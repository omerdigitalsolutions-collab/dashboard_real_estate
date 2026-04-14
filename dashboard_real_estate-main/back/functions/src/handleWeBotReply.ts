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
 *   • Gemini Function Calling: supports schedule_meeting tool
 *   • Logs both inbound & outbound messages to leads/{leadId}/messages
 *
 * ⚠️  Data model: FLAT Firestore collections
 *     leads/{leadId}          — agencyId field
 *     properties/{id}         — agencyId field, status == 'active'
 *   NOT agencies/{id}/leads (multi-tenant sub-collections)
 */

import * as admin from 'firebase-admin';
import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { buildWeBotPrompt, sendWhatsAppMessage, BotConfig, WhatsappIntegration, createSharedCatalog } from './whatsappService';

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

// ─── Gemini Function Calling: create_catalog ──────────────────────────────────

const createCatalogDeclaration: FunctionDeclaration = {
  name: 'create_catalog',
  description: 'יוצר קטלוג נכסים וירטואלי שניתן לשתף עם הלקוח (URL) בהתאם למזהי הנכסים שבחרת מהרשימה.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      propertyIds: { 
        type: SchemaType.ARRAY, 
        items: { type: SchemaType.STRING },
        description: 'רשימת מזהי הנכסים (ID) להוספה לקטלוג'
      },
    },
    required: ['propertyIds'],
  },
};

// ─── Helper: map Firestore weBotConfig → BotConfig ────────────────────────────

function mapWeBotConfig(raw: Record<string, any>): BotConfig {
  // Map internal keys from Firestore (saved by WeBotSettings.tsx) to BotConfig type
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

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleWeBotReply(
  agencyId: string,
  leadId: string,
  customerPhone: string,
  incomingMessage: string,
  geminiApiKey: string,
  greenApiCreds: { idInstance: string; apiTokenInstance: string },
  idMessage?: string,
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
    const muteMs             = (botConfig.firewallMuteHours ?? 12) * 60 * 60 * 1000;
    const lastHumanReplyAt   = leadData.lastHumanReplyAt?.toMillis?.() ?? 0;
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

    // ── 6. Initialise Gemini with Function Calling ──────────────────────────
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ functionDeclarations: [scheduleMeetingDeclaration, createCatalogDeclaration] }],
      systemInstruction: systemPrompt,
    });

    const chat   = model.startChat();
    const result = await chat.sendMessage(incomingMessage);
    const resp   = result.response;

    let finalReply = '';

    // ── 7. Handle Function Calling (schedule_meeting) ───────────────────────
    const fnCalls = resp.functionCalls?.() ?? [];
    if (fnCalls.length > 0) {
      const call = fnCalls[0];

      if (call.name === 'schedule_meeting') {
        const { date, time, propertyId } = call.args as Record<string, string>;

        // Persist meeting to Firestore
        await db.collection('meetings').add({
          agencyId,
          leadId,
          date,
          time,
          propertyId,
          status: 'scheduled',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[WeBot] 📅 Meeting scheduled: lead=${leadId} property=${propertyId} at ${date} ${time}`);

        // Send function result back to Gemini so it can craft the confirmation message
        const confirmResult = await chat.sendMessage([{
          functionResponse: {
            name: 'schedule_meeting',
            response: { success: true, message: 'הפגישה נקבעה בהצלחה.' },
          },
        }]);
        finalReply = confirmResult.response.text();
      } else if (call.name === 'create_catalog') {
        const { propertyIds } = call.args as Record<string, any>;
        const idsArray = Array.isArray(propertyIds) ? propertyIds : [];

        if (idsArray.length === 0) {
          console.warn(`[WeBot] Gemini attempted to create catalog with 0 properties.`);
          const failResult = await chat.sendMessage([{
            functionResponse: {
              name: 'create_catalog',
              response: { success: false, message: 'לא נבחרו נכסים.' },
            },
          }]);
          finalReply = failResult.response.text();
        } else {
          // Create catalog
          const catalogUrl = await createSharedCatalog(
            db, 
            agencyId, 
            agencyData, 
            leadId, 
            leadData.name || 'לקוח', 
            idsArray
          );

          console.log(`[WeBot] 📄 Catalog created via AI: lead=${leadId} URL=${catalogUrl} properties=${idsArray.length}`);

          // Send function result back to Gemini so it can craft the message with the URL
          const confirmResult = await chat.sendMessage([{
            functionResponse: {
              name: 'create_catalog',
              response: { success: true, url: catalogUrl },
            },
          }]);
          finalReply = confirmResult.response.text();
        }
      }
    } else {
      finalReply = resp.text();
    }

    if (!finalReply.trim()) {
      console.warn(`[WeBot] Empty reply from Gemini for lead ${leadId}, skipping send.`);
      return;
    }

    // ── 8. Send reply via Green API ─────────────────────────────────────────
    const integration: WhatsappIntegration = {
      idInstance:       greenApiCreds.idInstance,
      apiTokenInstance: greenApiCreds.apiTokenInstance,
      isConnected:      true,
    };

    const isSent = await sendWhatsAppMessage(integration, customerPhone, finalReply);
    console.log(`[WeBot] Reply ${isSent ? 'sent ✅' : 'FAILED ❌'} to ${customerPhone} for lead ${leadId}`);

    // ── 9. Log bot reply to CRM ─────────────────────────────────────────────
    // NOTE: The inbound message is already logged in webhookWhatsAppAI.ts
    // before calling handleWeBotReply. We only log the BOT's outbound reply here.
    if (isSent) {
      await db.collection(`leads/${leadId}/messages`).add({
        text: finalReply,
        direction: 'outbound',
        senderPhone: 'bot',
        source: 'whatsapp_ai_bot',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: true,
      });
    }

  } catch (err) {
    console.error('[WeBot] handleWeBotReply error:', err);
  }
}
