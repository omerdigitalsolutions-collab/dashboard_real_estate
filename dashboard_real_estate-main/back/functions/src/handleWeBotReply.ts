/**
 * ─── handleWeBotReply ─────────────────────────────────────────────────────────
 *
 * Central WeBot pipeline handler.
 * Called from webhookWhatsAppAI after a lead has been upserted and basic
 * guards (isBotActive, idempotency) have passed.
 *
 * Features:
 *   • Reads agency's weBotConfig from Firestore for personalised prompt
 *   • AI Firewall: respects lastHumanReplyAt + firewallMuteHours
 *   • RAG: injects active properties into the system prompt
 *   • Chat History: loads last 20 messages so the bot remembers the conversation
 *   • Gemini Function Calling:
 *       - update_lead_requirements → saves extracted criteria to lead doc
 *       - create_catalog           → runs matching engine + sends catalog URL
 *       - schedule_meeting         → books a viewing in Firestore
 *
 * ⚠️  Data model: FLAT Firestore collections
 *     leads/{leadId}          — agencyId field
 *     properties/{id}         — agencyId field, status == 'active'
 *   NOT agencies/{id}/leads (multi-tenant sub-collections)
 */

import * as admin from 'firebase-admin';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, Content } from '@google/generative-ai';
import { buildWeBotPrompt, sendWhatsAppMessage, BotConfig, WhatsappIntegration, createSharedCatalog } from './whatsappService';
import { evaluateMatch, MatchingProperty, MatchingRequirements } from './leads/matchingEngine';

const db = admin.firestore();

// ─── Gemini Function Calling: schedule_meeting ────────────────────────────────

const scheduleMeetingDeclaration: FunctionDeclaration = {
  name: 'schedule_meeting',
  description: 'קובע פגישה/סיור ביומן המתווך לנכס ספציפי, בתאריך ושעה מוסכמים עם הלקוח.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      date:       { type: SchemaType.STRING, description: 'תאריך הפגישה בפורמט YYYY-MM-DD' },
      time:       { type: SchemaType.STRING, description: 'שעת הפגישה בפורמט HH:MM' },
      propertyId: { type: SchemaType.STRING, description: 'מזהה הנכס מרשימת ה-RAG' },
    },
    required: ['date', 'time', 'propertyId'],
  },
};

// ─── Gemini Function Calling: update_lead_requirements ───────────────────────
// Called by Gemini once it has gathered enough info from the conversation.

const updateLeadRequirementsDeclaration: FunctionDeclaration = {
  name: 'update_lead_requirements',
  description: 'שמור את דרישות הלקוח שאספת משיחה זו. קרא לפונקציה זו ברגע שיש לך לפחות עיר + תקציב או חדרים.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      desiredCity:      { type: SchemaType.ARRAY,  items: { type: SchemaType.STRING }, description: 'ערים מועדפות (עברית)' },
      maxBudget:        { type: SchemaType.NUMBER,  description: 'תקציב מקסימלי בשקלים' },
      minRooms:         { type: SchemaType.NUMBER,  description: 'מינימום חדרים' },
      maxRooms:         { type: SchemaType.NUMBER,  description: 'מקסימום חדרים' },
      propertyType:     { type: SchemaType.ARRAY,  items: { type: SchemaType.STRING }, description: '"sale" לקנייה, "rent" לשכירות' },
      mustHaveParking:  { type: SchemaType.BOOLEAN, description: 'חובה חניה' },
      mustHaveElevator: { type: SchemaType.BOOLEAN, description: 'חובה מעלית' },
      mustHaveBalcony:  { type: SchemaType.BOOLEAN, description: 'חובה מרפסת' },
      mustHaveSafeRoom: { type: SchemaType.BOOLEAN, description: 'חובה ממד"ק' },
    },
    required: ['desiredCity'],
  },
};

// ─── Gemini Function Calling: create_catalog ─────────────────────────────────
// No parameters — the server resolves matching properties from the saved requirements.

const createCatalogDeclaration: FunctionDeclaration = {
  name: 'create_catalog',
  description: 'צור קטלוג נכסים מותאם אישית ללקוח לפי הדרישות שנשמרו. קרא לפונקציה זו לאחר שעדכנת את הדרישות.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

// ─── Helper: map Firestore weBotConfig → BotConfig ────────────────────────────

function mapWeBotConfig(raw: Record<string, any>): BotConfig {
  const toneMap: Record<string, BotConfig['tone']> = {
    professional: 'professional',
    friendly_emoji: 'friendly_emoji',
    direct_sales: 'direct_sales',
  };

  return {
    isActive:          raw.isActive !== false,
    tone:              toneMap[raw.tone] ?? 'professional',
    customTone:        raw.customTone,
    fallbackAction:    raw.fallbackAction === 'collect_details' ? 'collect_details' : 'human_handoff',
    customFallbackAction: raw.customFallbackAction,
    firewallMuteHours: typeof raw.firewallMuteHours === 'number' ? raw.firewallMuteHours : 12,
    generalNotes:      raw.generalNotes || '',
  };
}

// ─── Helper: Load chat history from Firestore ─────────────────────────────────
// Returns the last N bot↔user exchanges as Gemini Content[] so the model
// has full conversation context.

async function loadChatHistory(leadId: string, limit = 20): Promise<Content[]> {
  try {
    const snap = await db
      .collection(`leads/${leadId}/messages`)
      .orderBy('timestamp', 'asc')
      .limitToLast(limit)
      .get();

    const history: Content[] = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      // Skip system errors and history-sync messages — they are noise for the AI
      if (d.source === 'system_error' || d.source === 'whatsapp_history_sync') continue;
      // Only include user messages and bot replies
      if (d.direction !== 'inbound' && d.direction !== 'outbound') continue;
      // Skip outbound messages that were sent by a human agent
      if (d.direction === 'outbound' && d.source !== 'whatsapp_ai_bot') continue;

      const role: 'user' | 'model' = d.direction === 'inbound' ? 'user' : 'model';
      const text: string = d.text || '';
      if (!text.trim()) continue;

      history.push({ role, parts: [{ text }] });
    }

    return history;
  } catch (err) {
    console.warn(`[WeBot] Could not load chat history for lead ${leadId}:`, err);
    return [];
  }
}

// ─── Helper: Find matching properties (server-side, no auth guard) ────────────
// Mirrors the logic in matchPropertiesForLead.ts but runs as a trusted
// server-side call from the bot pipeline.

async function findMatchingPropertiesForBot(
  agencyId: string,
  requirements: MatchingRequirements,
  topN = 10,
): Promise<Array<{ id: string; [key: string]: any }>> {
  // Agency-owned active listings
  const agencySnap = await db
    .collection('properties')
    .where('agencyId', '==', agencyId)
    .where('status', '==', 'active')
    .get();

  const agencyProps = agencySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Global listings from city sub-collections
  let globalProps: any[] = [];
  const cities = requirements.desiredCity ?? [];
  if (cities.length > 0) {
    const cityResults = await Promise.all(
      cities.slice(0, 10).map(async (city) => {
        try {
          const snap = await db
            .collection('cities').doc(city).collection('properties')
            .limit(200).get();
          return snap.docs.map(doc => ({
            id: doc.id,
            isExclusivity: false,
            ...doc.data(),
          }));
        } catch {
          return [];
        }
      })
    );
    globalProps = cityResults.flat();
  }

  const all = [...agencyProps, ...globalProps];
  const matches: Array<{ id: string; matchScore: number; [key: string]: any }> = [];

  for (const prop of all) {
    const mp: MatchingProperty = {
      id:          prop.id,
      city:        prop.city,
      neighborhood: prop.neighborhood,
      price:       prop.price,
      rooms:       prop.rooms,
      type:        prop.type,
      hasElevator: prop.hasElevator,
      hasParking:  prop.hasParking,
      hasBalcony:  prop.hasBalcony,
      hasSafeRoom: prop.hasSafeRoom,
    };
    const result = evaluateMatch(mp, requirements);
    if (result) {
      matches.push({ ...prop, matchScore: result.matchScore, category: result.category });
    }
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches.slice(0, topN);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleWeBotReply(
  agencyId: string,
  leadId: string,
  customerPhone: string,
  incomingMessage: string,
  geminiApiKey: string,
  greenApiCreds: { idInstance: string; apiTokenInstance: string },
  _idMessage?: string,
): Promise<void> {
  try {
    // ── 1. Fetch agency + lead docs ─────────────────────────────────────────
    const [agencySnap, leadSnap] = await Promise.all([
      db.collection('agencies').doc(agencyId).get(),
      db.collection('leads').doc(leadId).get(),
    ]);

    if (!agencySnap.exists || !leadSnap.exists) {
      console.warn(`[WeBot] Agency or lead not found: agency=${agencyId} lead=${leadId}`);
      return;
    }

    const agencyData = agencySnap.data()!;
    const leadData   = leadSnap.data()!;
    const rawConfig  = agencyData.weBotConfig || {};
    const botConfig  = mapWeBotConfig(rawConfig);

    // ── 2. Bot active check (agency-level) ─────────────────────────────────
    if (!botConfig.isActive) {
      console.log(`[WeBot] Bot disabled by agency ${agencyId}. Skipping.`);
      return;
    }

    // ── 3. AI Firewall: honour lastHumanReplyAt mute window ────────────────
    const muteMs           = (botConfig.firewallMuteHours ?? 12) * 60 * 60 * 1000;
    const lastHumanReplyAt = leadData.lastHumanReplyAt?.toMillis?.() ?? 0;
    if (Date.now() - lastHumanReplyAt < muteMs) {
      console.log(`[WeBot] 🔇 Firewall mute active for lead ${leadId} — human replied ${Math.floor((Date.now() - lastHumanReplyAt) / 60000)} min ago.`);
      return;
    }

    // ── 4. RAG: fetch active properties for this agency ────────────────────
    const propSnap = await db.collection('properties')
      .where('agencyId', '==', agencyId)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(15)
      .get();

    const ragProperties = propSnap.docs.map(doc => {
      const d = doc.data();
      return {
        id:          doc.id,
        title:       d.title || d.propertyType || 'נכס',
        address:     d.street || d.address || d.neighborhood || '',
        city:        d.city || '',
        rooms:       d.rooms ?? 0,
        price:       d.price ?? 0,
        description: d.description || '',
      };
    });

    // ── 5. Build dynamic system prompt ─────────────────────────────────────
    const systemPrompt = buildWeBotPrompt(botConfig, ragProperties);

    // ── 6. Load conversation history from Firestore ─────────────────────────
    const chatHistory = await loadChatHistory(leadId);
    console.log(`[WeBot] Loaded ${chatHistory.length} history messages for lead ${leadId}`);

    // ── 7. Initialise Gemini with Function Calling + chat history ───────────
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ functionDeclarations: [scheduleMeetingDeclaration, updateLeadRequirementsDeclaration, createCatalogDeclaration] }],
      systemInstruction: systemPrompt,
    });

    const chat = model.startChat({ history: chatHistory });

    // ── 8. Agentic loop: handle chained function calls ──────────────────────
    let chatResponse = await chat.sendMessage(incomingMessage);
    let finalReply = '';
    let iterCount = 0;

    while (iterCount < 5) {
      iterCount++;
      const fnCalls = chatResponse.response.functionCalls?.() ?? [];

      if (fnCalls.length === 0) {
        finalReply = chatResponse.response.text();
        break;
      }

      const call = fnCalls[0];
      let functionResult: Record<string, any>;

      // ── schedule_meeting ──────────────────────────────────────────────────
      if (call.name === 'schedule_meeting') {
        const { date, time, propertyId } = call.args as Record<string, string>;

        await db.collection('meetings').add({
          agencyId,
          leadId,
          date,
          time,
          propertyId,
          status:    'scheduled',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[WeBot] 📅 Meeting scheduled: lead=${leadId} property=${propertyId} at ${date} ${time}`);
        functionResult = { success: true, message: 'הפגישה נקבעה בהצלחה.' };

      // ── update_lead_requirements ──────────────────────────────────────────
      } else if (call.name === 'update_lead_requirements') {
        const args = call.args as Record<string, any>;

        // Build a clean requirements object — only include defined fields
        const requirements: Record<string, any> = {};
        if (Array.isArray(args.desiredCity) && args.desiredCity.length > 0)
          requirements.desiredCity = args.desiredCity;
        if (typeof args.maxBudget === 'number')
          requirements.maxBudget = args.maxBudget;
        if (typeof args.minRooms === 'number')
          requirements.minRooms = args.minRooms;
        if (typeof args.maxRooms === 'number')
          requirements.maxRooms = args.maxRooms;
        if (Array.isArray(args.propertyType) && args.propertyType.length > 0)
          requirements.propertyType = args.propertyType;
        if (typeof args.mustHaveParking === 'boolean')
          requirements.mustHaveParking = args.mustHaveParking;
        if (typeof args.mustHaveElevator === 'boolean')
          requirements.mustHaveElevator = args.mustHaveElevator;
        if (typeof args.mustHaveBalcony === 'boolean')
          requirements.mustHaveBalcony = args.mustHaveBalcony;
        if (typeof args.mustHaveSafeRoom === 'boolean')
          requirements.mustHaveSafeRoom = args.mustHaveSafeRoom;

        // Merge with existing requirements to avoid overwriting unrelated fields
        const existingReqs = leadData.requirements || {};
        await db.collection('leads').doc(leadId).update({
          requirements: { ...existingReqs, ...requirements },
        });

        console.log(`[WeBot] 📋 Lead requirements saved: lead=${leadId}`, requirements);
        functionResult = { success: true };

      // ── create_catalog ────────────────────────────────────────────────────
      } else if (call.name === 'create_catalog') {
        // Read the latest lead data (requirements may have just been updated)
        const freshLead = await db.collection('leads').doc(leadId).get();
        const reqs: MatchingRequirements = freshLead.data()?.requirements || {};

        if (!reqs.desiredCity?.length && !reqs.maxBudget && !reqs.minRooms) {
          console.warn(`[WeBot] create_catalog called but no requirements saved for lead ${leadId}`);
          functionResult = {
            success: false,
            reason:  'missing_requirements',
            message: 'לא נמצאו דרישות שמורות. יש לאסוף מהלקוח לפחות עיר, תקציב או מספר חדרים לפני יצירת הקטלוג.',
          };
        } else {
          const matchedProperties = await findMatchingPropertiesForBot(agencyId, reqs, 10);

          if (matchedProperties.length === 0) {
            console.log(`[WeBot] No matching properties found for lead ${leadId}`);
            functionResult = { success: false, reason: 'no_matches', message: 'לא נמצאו נכסים מתאימים לפי הדרישות.' };
          } else {
            const propertyIds = matchedProperties.map(p => p.id);
            const catalogUrl  = await createSharedCatalog(
              db,
              agencyId,
              agencyData,
              leadId,
              freshLead.data()?.name || 'לקוח',
              propertyIds,
            );

            console.log(`[WeBot] 📄 Catalog created: lead=${leadId} URL=${catalogUrl} count=${propertyIds.length}`);
            functionResult = { success: true, url: catalogUrl, count: matchedProperties.length };
          }
        }

      } else {
        console.warn(`[WeBot] Unknown function call: ${call.name}`);
        functionResult = { success: false, reason: 'unknown_function' };
      }

      // Send the function result back to Gemini so it can continue
      chatResponse = await chat.sendMessage([{
        functionResponse: { name: call.name, response: functionResult },
      }]);
    }

    if (!finalReply.trim()) {
      console.warn(`[WeBot] Empty reply from Gemini for lead ${leadId}, skipping send.`);
      return;
    }

    // ── 9. Send reply via Green API ─────────────────────────────────────────
    const integration: WhatsappIntegration = {
      idInstance:       greenApiCreds.idInstance,
      apiTokenInstance: greenApiCreds.apiTokenInstance,
      isConnected:      true,
    };

    const isSent = await sendWhatsAppMessage(integration, customerPhone, finalReply);
    console.log(`[WeBot] Reply ${isSent ? 'sent ✅' : 'FAILED ❌'} to ${customerPhone} for lead ${leadId}`);

    // ── 10. Log bot reply to CRM ────────────────────────────────────────────
    // NOTE: The inbound message is already logged in webhookWhatsAppAI.ts
    // before calling handleWeBotReply. We only log the BOT's outbound reply here.
    if (isSent) {
      await db.collection(`leads/${leadId}/messages`).add({
        text:        finalReply,
        direction:   'outbound',
        senderPhone: 'bot',
        source:      'whatsapp_ai_bot',
        timestamp:   admin.firestore.FieldValue.serverTimestamp(),
        isRead:      true,
      });
    }

  } catch (err) {
    console.error('[WeBot] handleWeBotReply error:', err);
  }
}
