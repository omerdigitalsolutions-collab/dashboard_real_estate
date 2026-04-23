/**
 * ─── handleWeBotReply ─────────────────────────────────────────────────────────
 *
 * State-machine WeBot pipeline persisted in leads/{leadId}.chatState
 *
 * Buyer states:  IDLE → COLLECTING_REQS → SCHEDULING_CALL → IDLE
 * Seller states: IDLE → COLLECTING_SELLER_INFO → SCHEDULING_SELLER_CALL → IDLE
 *
 * State resets after 24 h inactivity or a "התחל מחדש" keyword.
 */

import * as admin from 'firebase-admin';
import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  SchemaType,
  Content,
  FunctionCallingMode,
} from '@google/generative-ai';
import {
  buildWeBotPrompt,
  sendWhatsAppMessage,
  BotConfig,
  WhatsappIntegration,
  createSharedCatalog,
} from './whatsappService';
import { evaluateMatch, MatchingProperty, MatchingRequirements } from './leads/matchingEngine';
import { createCalendarEvent } from './calendar/eventManager';

const db = admin.firestore();

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isTransient = err?.message?.includes('fetch failed') || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT';
      if (isTransient && attempt < retries) {
        const delay = 1500 * (attempt + 1);
        console.warn(`[WeBot] ${label} — transient error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms:`, err.message);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const RESET_KEYWORDS   = ['התחל מחדש', 'תחל מחדש', 'reset', 'start over', 'מחדש'];

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatState =
  | 'IDLE'
  | 'COLLECTING_NAME'
  | 'COLLECTING_REQS'
  | 'ASKING_EXTRA_CRITERIA'
  | 'SCHEDULING_CALL'
  | 'COLLECTING_SELLER_INFO'
  | 'SCHEDULING_SELLER_CALL';

interface StoredChatState {
  state: ChatState;
  lastStateAt: number;
  pendingSellerAddress?: string;
  pendingSellerType?: string;
  extraCriteriaAsked?: boolean;
}

// ─── Gemini Function Declarations ─────────────────────────────────────────────

const scheduleMeetingDeclaration: FunctionDeclaration = {
  name: 'schedule_meeting',
  description: 'קובע פגישה, סיור בנכס, או שיחת טלפון ביומן המתווך, בתאריך ושעה מוסכמים עם הלקוח.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      date:        { type: SchemaType.STRING, description: 'תאריך הפגישה YYYY-MM-DD' },
      time:        { type: SchemaType.STRING, description: 'שעת הפגישה HH:MM' },
      meetingType: { type: SchemaType.STRING, description: '"visit" לסיור, "call" לשיחת טלפון' },
      propertyId:  { type: SchemaType.STRING, description: 'מזהה נכס (אופציונלי)' },
      duration:    { type: SchemaType.NUMBER, description: 'משך בדקות (ברירת מחדל 60)' },
    },
    required: ['date', 'time', 'meetingType'],
  },
};

const updateLeadRequirementsDeclaration: FunctionDeclaration = {
  name: 'update_lead_requirements',
  description: 'שמור את דרישות הלקוח שאספת. קרא ברגע שיש לך לפחות עיר + תקציב או חדרים.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      desiredCity:      { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: 'ערים מועדפות (עברית)' },
      maxBudget:        { type: SchemaType.NUMBER,  description: 'תקציב מקסימלי בשקלים' },
      minRooms:         { type: SchemaType.NUMBER,  description: 'מינימום חדרים' },
      maxRooms:         { type: SchemaType.NUMBER,  description: 'מקסימום חדרים' },
      propertyType:     { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: '"sale" לקנייה, "rent" לשכירות' },
      mustHaveParking:  { type: SchemaType.BOOLEAN },
      mustHaveElevator: { type: SchemaType.BOOLEAN },
      mustHaveBalcony:  { type: SchemaType.BOOLEAN },
      mustHaveSafeRoom: { type: SchemaType.BOOLEAN },
    },
    required: ['desiredCity'],
  },
};

const createCatalogDeclaration: FunctionDeclaration = {
  name: 'create_catalog',
  description: 'צור קטלוג נכסים מותאם ללקוח לפי הדרישות השמורות. קרא לאחר update_lead_requirements.',
  parameters: { type: SchemaType.OBJECT, properties: {} },
};

// ─── mapWeBotConfig ───────────────────────────────────────────────────────────

function mapWeBotConfig(raw: Record<string, any>): BotConfig {
  const toneMap: Record<string, BotConfig['tone']> = {
    professional: 'professional',
    friendly_emoji: 'friendly_emoji',
    direct_sales: 'direct_sales',
  };
  return {
    isActive:             raw.isActive !== false,
    tone:                 toneMap[raw.tone] ?? 'professional',
    customTone:           raw.customTone,
    fallbackAction:       raw.fallbackAction === 'collect_details' ? 'collect_details' : 'human_handoff',
    customFallbackAction: raw.customFallbackAction,
    firewallMuteHours:    typeof raw.firewallMuteHours === 'number' ? raw.firewallMuteHours : 12,
    generalNotes:         raw.generalNotes || '',
  };
}

// ─── loadChatHistory ──────────────────────────────────────────────────────────

async function loadChatHistory(leadId: string, limit = 20, excludeDocId?: string): Promise<Content[]> {
  try {
    const snap = await db
      .collection(`leads/${leadId}/messages`)
      .orderBy('timestamp', 'asc')
      .limitToLast(limit)
      .get();

    const history: Content[] = [];
    for (const doc of snap.docs) {
      if (excludeDocId && doc.id === excludeDocId) continue;
      const d = doc.data();
      if (d.source === 'system_error' || d.source === 'whatsapp_history_sync') continue;
      if (d.direction !== 'inbound' && d.direction !== 'outbound') continue;
      if (d.direction === 'outbound' && d.source !== 'whatsapp_ai_bot') continue;
      const text: string = d.text || '';
      if (!text.trim()) continue;
      history.push({ role: d.direction === 'inbound' ? 'user' : 'model', parts: [{ text }] });
    }
    // Gemini requires history to start with 'user' role — strip any leading bot messages
    while (history.length > 0 && history[0].role !== 'user') {
      history.shift();
    }
    return history;
  } catch (err) {
    console.warn(`[WeBot] Could not load chat history for lead ${leadId}:`, err);
    return [];
  }
}

// ─── findMatchingPropertiesForBot ─────────────────────────────────────────────

async function findMatchingPropertiesForBot(
  agencyId: string,
  requirements: MatchingRequirements,
  topN = 10,
): Promise<Array<{ id: string; [key: string]: any }>> {
  const agencyPath = `agencies/${agencyId}/properties`;
  const agencySnap = await db
    .collection('agencies').doc(agencyId).collection('properties')
    .where('status', '==', 'active')
    .get();
  const agencyProps = agencySnap.docs.map(doc => ({ id: doc.id, _collectionPath: agencyPath, ...doc.data() }));

  let globalProps: any[] = [];
  const cities = requirements.desiredCity ?? [];
  if (cities.length > 0) {
    const cityResults = await Promise.all(
      cities.slice(0, 10).map(async (city) => {
        try {
          const snap = await db
            .collection('cities').doc(city).collection('properties')
            .limit(200).get();
          return snap.docs.map(doc => ({ id: doc.id, _collectionPath: `cities/${city}/properties`, isExclusivity: false, ...doc.data() }));
        } catch { return []; }
      })
    );
    globalProps = cityResults.flat();
  }

  const all = [...agencyProps, ...globalProps];
  const matches: Array<{ id: string; matchScore: number; [key: string]: any }> = [];

  for (const prop of all) {
    const mp: MatchingProperty = {
      id: prop.id,
      city: prop.address?.city || prop.city,
      neighborhood: prop.address?.neighborhood || prop.neighborhood,
      street: prop.address?.street || prop.street,
      price: prop.financials?.price ?? prop.price,
      rooms: prop.rooms,
      transactionType: prop.transactionType || prop.type || 'forsale',
      hasElevator: prop.features?.hasElevator ?? prop.hasElevator,
      hasParking: prop.features?.hasParking ?? prop.hasParking,
      hasBalcony: prop.features?.hasBalcony ?? prop.hasBalcony,
      hasMamad: prop.features?.hasMamad ?? prop.hasSafeRoom,
    };
    const result = evaluateMatch(mp, requirements);
    if (result) matches.push({ ...prop, matchScore: result.matchScore, category: result.category });
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches.slice(0, topN);
}

// ─── updateChatState ──────────────────────────────────────────────────────────

async function updateChatState(
  leadId: string,
  state: ChatState,
  extra: Partial<StoredChatState> = {},
): Promise<void> {
  await db.collection('leads').doc(leadId).update({
    chatState: { state, lastStateAt: Date.now(), ...extra },
    lastInteraction: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`[WeBot] 🔄 State → ${state} for lead ${leadId}`);
}

// ─── sendBotMessage ───────────────────────────────────────────────────────────

async function sendBotMessage(
  integration: WhatsappIntegration,
  customerPhone: string,
  leadId: string,
  text: string,
): Promise<void> {
  const isSent = await sendWhatsAppMessage(integration, customerPhone, text);
  if (!isSent) {
    console.error(`[WeBot] ❌ Failed to send message to ${customerPhone} — instance=${integration.idInstance} text_preview="${text.substring(0, 50)}"`);
  } else {
    console.log(`[WeBot] ✅ Sent to ${customerPhone}`);
  }
  if (isSent) {
    await db.collection(`leads/${leadId}/messages`).add({
      text,
      direction:   'outbound',
      senderPhone: 'bot',
      source:      'whatsapp_ai_bot',
      botSentAt:   Date.now(),
      timestamp:   admin.firestore.FieldValue.serverTimestamp(),
      isRead:      true,
    });
  }
}

// ─── classifyIntent ───────────────────────────────────────────────────────────

async function classifyIntent(
  message: string,
  leadType: string,
  geminiApiKey: string,
): Promise<'buyer' | 'seller' | 'irrelevant'> {
  // Fast keyword check for sellers (high confidence)
  const sellerKeywords = ['למכור', 'מכירה', 'לפרסם', 'פרסום נכס', 'נכס שלי', 'דירה שלי', 'להשכיר את'];
  if (sellerKeywords.some(kw => message.includes(kw))) return 'seller';

  // If existing seller lead writing again — stay in seller flow
  if (leadType === 'seller') return 'seller';

  // Returning buyers skip the Gemini classification call entirely
  if (leadType === 'buyer') return 'buyer';

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(
      `סווג את ההודעה הבאה לאחת מ-3 קטגוריות. החזר JSON בלבד.\n\nהודעה: "${message}"\n\n` +
      `קטגוריות:\n- buyer: מחפש לקנות/לשכור נכס\n- seller: רוצה למכור/להשכיר/לפרסם נכס\n` +
      `- irrelevant: ברכות בלבד, ספאם, תגובה לא ברורה\n\n{"intent":"buyer"|"seller"|"irrelevant"}`
    );
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return (['buyer', 'seller', 'irrelevant'].includes(parsed.intent) ? parsed.intent : 'buyer') as 'buyer' | 'seller' | 'irrelevant';
  } catch (err) {
    console.warn('[WeBot] Intent classification failed, fallback to keyword check:', err);
    const buyerKeywords = ['מחפש', 'קנות', 'שכירות', 'דירה', 'נכס', 'חדרים', 'תקציב', 'רוצה לקנות'];
    if (buyerKeywords.some(kw => message.includes(kw))) return 'buyer';
    return 'irrelevant';
  }
}

// ─── notifyAgentOrAdmin ───────────────────────────────────────────────────────

async function notifyAgentOrAdmin(
  targetPhone: string,
  message: string,
  creds: { idInstance: string; apiTokenInstance: string },
): Promise<void> {
  try {
    await sendWhatsAppMessage(
      { idInstance: creds.idInstance, apiTokenInstance: creds.apiTokenInstance, isConnected: true },
      targetPhone,
      message,
    );
  } catch (err) {
    console.warn('[WeBot] Failed to notify agent/admin:', err);
  }
}

// ─── createCRMNotification ────────────────────────────────────────────────────

async function createCRMNotification(
  agencyId: string,
  leadId: string,
  leadName: string,
  type: 'new_buyer_inquiry' | 'new_seller_inquiry',
  actionType: 'assign_agent' | 'contact_seller',
  details: Record<string, any>,
): Promise<void> {
  try {
    await db.collection('notifications').add({
      agencyId, leadId, leadName, type, actionType, details,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[WeBot] createCRMNotification failed:', err);
  }
}

// ─── findAgentPhone / findAdminPhone ─────────────────────────────────────────

async function findAgentPhone(agencyId: string, assignedAgentId?: string): Promise<string | null> {
  if (assignedAgentId) {
    const doc = await db.collection('users').doc(assignedAgentId).get();
    const phone = doc.data()?.phone || doc.data()?.phoneNumber;
    if (phone) return phone;
  }
  const snap = await db.collection('users')
    .where('agencyId', '==', agencyId)
    .where('role', 'in', ['agent', 'admin'])
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].data()?.phone || snap.docs[0].data()?.phoneNumber || null;
}

async function findAdminPhone(agencyId: string): Promise<string | null> {
  const snap = await db.collection('users')
    .where('agencyId', '==', agencyId)
    .where('role', '==', 'admin')
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].data()?.phone || snap.docs[0].data()?.phoneNumber || null;
}

// ─── extractSellerInfo ────────────────────────────────────────────────────────

async function extractSellerInfo(
  message: string,
  geminiApiKey: string,
): Promise<{ address?: string; propertyType?: string }> {
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(
      `חלץ פרטי נכס מהמסר הבא. החזר JSON בלבד.\n\nמסר: "${message}"\n\n` +
      `{"address":"כתובת מלאה או null","propertyType":"דירה/בית/דופלקס/פנטהאוס/מסחרי או null"}`
    );
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return {
      address:      parsed.address      || undefined,
      propertyType: parsed.propertyType || undefined,
    };
  } catch (err) {
    console.warn('[WeBot] extractSellerInfo failed (Gemini/parse error):', err);
    return {};
  }
}

// ─── extractTimePreference ────────────────────────────────────────────────────

async function extractTimePreference(message: string, geminiApiKey: string): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const today = new Date().toLocaleDateString('he-IL');
    const result = await model.generateContent(
      `חלץ העדפת זמן מהמסר. תאריך היום: ${today}.\nמסר: "${message}"\n` +
      `{"timeText":"תיאור הזמן הקריא בעברית, או null"}`
    );
    const parsed = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
    return parsed.timeText || message.trim();
  } catch (err) {
    console.warn('[WeBot] extractTimePreference failed (Gemini/parse error):', err);
    return message.trim();
  }
}

// ─── Buyer Flow (Gemini function-calling pipeline) ────────────────────────────

async function runBuyerFlow(
  agencyId:       string,
  leadId:         string,
  customerPhone:  string,
  incomingMessage: string,
  geminiApiKey:   string,
  agencyData:     admin.firestore.DocumentData,
  leadData:       admin.firestore.DocumentData,
  integration:    WhatsappIntegration,
  currentMsgDocId: string | undefined,
  greenApiCreds:  { idInstance: string; apiTokenInstance: string },
  currentState:   ChatState = 'IDLE',
): Promise<void> {
  // RAG: active properties + chat history in parallel
  const reqsCity = leadData.requirements?.desiredCity?.[0];
  const globalPropPromise = reqsCity ? 
    db.collection('cities').doc(reqsCity).collection('properties').limit(5).get() : 
    Promise.resolve({ docs: [] });

  const [propSnap, globalSnap, chatHistory] = await Promise.all([
    db.collection('agencies').doc(agencyId).collection('properties')
      .where('status', '==', 'active')
      .limit(15)
      .get(),
    globalPropPromise,
    loadChatHistory(leadId, 20, currentMsgDocId),
  ]);

  const allDocs = [...propSnap.docs, ...globalSnap.docs];

  const ragProperties = allDocs.map(doc => {
    const d = doc.data();
    return {
      id:          doc.id,
      title:       d.propertyType || 'נכס',
      address:     d.address?.fullAddress || d.address?.street || '',
      city:        d.address?.city || '',
      rooms:       d.rooms ?? 0,
      price:       d.financials?.price ?? d.price ?? 0,
      description: d.management?.descriptions || '',
    };
  });

  const agencyName  = agencyData.agencyName || agencyData.name || 'הסוכנות שלנו';
  const botConfig   = mapWeBotConfig(agencyData.weBotConfig || {});
  const systemPrompt = buildWeBotPrompt(botConfig, ragProperties, agencyName);

  const schedulingPrefix =
    currentState === 'SCHEDULING_CALL'
      ? '⚠️ מצב נוכחי: קטלוג הנכסים כבר נשלח ללקוח. אם הלקוח רוצה לקבוע שיחה/פגישה — שאל תאריך ושעה מועדפים ואז קרא ל-schedule_meeting בלבד. לאחר שהפגישה נקבעה שלח הודעת סיום חמה וחזור ל-IDLE. אל תקרא שוב ל-update_lead_requirements או ל-create_catalog.\n\n'
      : currentState === 'ASKING_EXTRA_CRITERIA'
      ? '⚠️ שלב: הלקוח ענה על שאלת "האם יש קריטריונים נוספים?". אם ציין קריטריונים — קרא ל-update_lead_requirements עם הדרישות המעודכנות ואז מיד ל-create_catalog. אם אין דרישות נוספות — קרא ישירות ל-create_catalog.\n\n'
      : '';

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ functionDeclarations: [scheduleMeetingDeclaration, updateLeadRequirementsDeclaration, createCatalogDeclaration] }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    systemInstruction: schedulingPrefix + systemPrompt,
  });

  const chat = model.startChat({ history: chatHistory });
  let chatResponse  = await withRetry('chat.sendMessage', () => chat.sendMessage(incomingMessage));
  let finalReply             = '';
  let catalogCreated         = false;
  let sentCatalogUrl: string | null = null;
  let iterCount              = 0;
  let requirementsJustSaved  = false;
  let meetingScheduled       = false;

  while (iterCount < 5) {
    iterCount++;
    const fnCalls = chatResponse.response.functionCalls?.() ?? [];

    if (fnCalls.length === 0) {
      finalReply = chatResponse.response.text();
      break;
    }

    const call = fnCalls[0];
    let functionResult: Record<string, any>;

    // ── schedule_meeting ──────────────────────────────────────────────────────
    if (call.name === 'schedule_meeting') {
      const args        = call.args as Record<string, any>;
      const { date, time } = args as { date: string; time: string };
      const meetingType = args.meetingType || 'call';
      const propertyId  = args.propertyId as string | undefined;
      const durationMins = typeof args.duration === 'number' ? args.duration : 60;
      const typeLabel   = meetingType === 'call' ? 'שיחת טלפון' : 'סיור בנכס';
      const startDateTime = `${date}T${time}:00`;
      const endDate     = new Date(`${date}T${time}:00`);
      endDate.setMinutes(endDate.getMinutes() + durationMins);
      const endDateTime = endDate.toISOString().slice(0, 16) + ':00';

      await db.collection('meetings').add({
        agencyId, leadId, date, time, meetingType,
        propertyId: propertyId || null,
        status: 'scheduled',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const taskRef  = db.collection('tasks').doc();
      const leadName = leadData.name || 'לקוח';
      await taskRef.set({
        id: taskRef.id, agencyId, createdBy: 'bot',
        title: `${typeLabel} — ${leadName}`,
        description: `נקבע על ידי הבוט. ליד: ${leadId}${propertyId ? ` | נכס: ${propertyId}` : ''}`,
        dueDate:     admin.firestore.Timestamp.fromDate(new Date(startDateTime)),
        priority:    'Medium', isCompleted: false, type: 'meeting',
        relatedTo:   { type: 'lead', id: leadId },
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
      });

      // Google Calendar (best-effort)
      let calendarLink: string | null = null;
      try {
        let calendarUserId: string | null = null;
        if (leadData.assignedAgentId) {
          const agentDoc = await db.collection('users').doc(leadData.assignedAgentId).get();
          if (agentDoc.data()?.googleCalendar?.enabled) calendarUserId = leadData.assignedAgentId;
        }
        if (!calendarUserId) {
          const adminSnap = await db.collection('users')
            .where('agencyId', '==', agencyId).where('role', '==', 'admin').limit(1).get();
          if (!adminSnap.empty && adminSnap.docs[0].data().googleCalendar?.enabled)
            calendarUserId = adminSnap.docs[0].id;
        }
        if (calendarUserId) {
          const calResult = await createCalendarEvent(calendarUserId, {
            summary:     `${typeLabel} — ${leadName}`,
            description: `ליד: ${leadName} | טלפון: ${customerPhone}${propertyId ? ` | נכס: ${propertyId}` : ''}`,
            start: { dateTime: startDateTime, timeZone: 'Asia/Jerusalem' },
            end:   { dateTime: endDateTime,   timeZone: 'Asia/Jerusalem' },
            relatedTo: { type: 'lead' as const, id: leadId, name: leadData.name || 'לקוח' },
          });
          calendarLink = calResult.htmlLink;
          await taskRef.update({ googleEventId: calResult.eventId });
          console.log(`[WeBot] 📅 Calendar event: ${calResult.htmlLink}`);
        }
      } catch (calErr) {
        console.warn('[WeBot] Calendar create failed (non-fatal):', calErr);
      }

      // Notify agent
      const agentPhone = await findAgentPhone(agencyId, leadData.assignedAgentId);
      if (agentPhone) {
        await notifyAgentOrAdmin(
          agentPhone,
          `🏠 *עדכון מהבוט*\nהלקוח ${leadName} קבע ${typeLabel} לתאריך ${date} בשעה ${time}.\nטלפון: ${customerPhone}`,
          greenApiCreds,
        );
      }

      await updateChatState(leadId, 'IDLE');
      meetingScheduled = true;

      functionResult = {
        success: true,
        message: calendarLink
          ? `הפגישה נקבעה ביומן ל-${date} בשעה ${time}.`
          : `הפגישה נשמרה במערכת ל-${date} בשעה ${time}.`,
      };

    // ── update_lead_requirements ──────────────────────────────────────────────
    } else if (call.name === 'update_lead_requirements') {
      const args = call.args as Record<string, any>;
      const requirements: Record<string, any> = {};
      if (Array.isArray(args.desiredCity)  && args.desiredCity.length)  requirements.desiredCity = args.desiredCity;
      if (typeof args.maxBudget  === 'number')  requirements.maxBudget  = args.maxBudget;
      if (typeof args.minRooms   === 'number')  requirements.minRooms   = args.minRooms;
      if (typeof args.maxRooms   === 'number')  requirements.maxRooms   = args.maxRooms;
      if (Array.isArray(args.propertyType) && args.propertyType.length) requirements.propertyType = args.propertyType;
      if (typeof args.mustHaveParking  === 'boolean') requirements.mustHaveParking  = args.mustHaveParking;
      if (typeof args.mustHaveElevator === 'boolean') requirements.mustHaveElevator = args.mustHaveElevator;
      if (typeof args.mustHaveBalcony  === 'boolean') requirements.mustHaveBalcony  = args.mustHaveBalcony;
      if (typeof args.mustHaveSafeRoom === 'boolean') requirements.mustHaveSafeRoom = args.mustHaveSafeRoom;

      await db.collection('leads').doc(leadId).update({
        requirements: { ...(leadData.requirements || {}), ...requirements },
        type: 'buyer',
        status: 'searching',
      });
      await updateChatState(leadId, 'COLLECTING_REQS');
      console.log(`[WeBot] 📋 Requirements saved: lead=${leadId}`, requirements);
      requirementsJustSaved = true;
      functionResult = { success: true };

    // ── create_catalog ────────────────────────────────────────────────────────
    } else if (call.name === 'create_catalog') {
      if (requirementsJustSaved && currentState !== 'ASKING_EXTRA_CRITERIA') {
        // Requirements were just saved in a non-extra-criteria turn — ask extra criteria first
        functionResult = {
          success: false,
          reason: 'ask_extra_criteria_first',
          message: 'יש לשאול את הלקוח על קריטריונים נוספים לפני יצירת הקטלוג.',
        };
      } else {
        const freshLead = await db.collection('leads').doc(leadId).get();
        const reqs: MatchingRequirements = freshLead.data()?.requirements || {};

        if (!reqs.desiredCity?.length && !reqs.maxBudget && !reqs.minRooms) {
          functionResult = {
            success: false, reason: 'missing_requirements',
            message: 'לא נמצאו דרישות שמורות. יש לאסוף מהלקוח לפחות עיר + תקציב או חדרים.',
          };
        } else {
          const matchedProperties = await findMatchingPropertiesForBot(agencyId, reqs, 10);
          if (matchedProperties.length === 0) {
            functionResult = { success: false, reason: 'no_matches', message: 'לא נמצאו נכסים מתאימים לפי הדרישות.' };
          } else {
            const propertyRefs = matchedProperties.map(p => ({
              id: p.id,
              collectionPath: p._collectionPath || `agencies/${agencyId}/properties`,
            }));
            const catalogUrl  = await createSharedCatalog(
              db, agencyId, agencyData, leadId,
              freshLead.data()?.name || 'לקוח', propertyRefs,
            );
            catalogCreated = true;
            sentCatalogUrl = catalogUrl;
            console.log(`[WeBot] 📄 Catalog created: lead=${leadId} URL=${catalogUrl} count=${propertyRefs.length}`);
            functionResult = { success: true, url: catalogUrl, count: matchedProperties.length };
          }
        }
      }

    } else {
      console.warn(`[WeBot] Unknown function call: ${call.name}`);
      functionResult = { success: false, reason: 'unknown_function' };
    }

    chatResponse = await withRetry('chat.sendMessage(fn)', () => chat.sendMessage([{
      functionResponse: { name: call.name, response: functionResult },
    }]));
  }

  if (iterCount >= 5 && !finalReply.trim()) {
    console.warn(`[WeBot] Hit max iterations (5) for lead ${leadId}`);
    finalReply = 'הבנתי. אני מעבד את הנתונים, מיד אשוב חזרה עם תשובה מסודרת.';
  }

  // Ask for extra criteria ONCE — only when first entering this stage
  if (requirementsJustSaved && !catalogCreated && currentState !== 'ASKING_EXTRA_CRITERIA') {
    finalReply = 'קיבלתי את הדרישות.\nלפני שמכין את הקטלוג — האם יש דרישות נוספות?\n(חנייה, מעלית, מרפסת, ממ״ד, קומה, גינה, מצב הנכס)';
    await updateChatState(leadId, 'ASKING_EXTRA_CRITERIA');
    await sendBotMessage(integration, customerPhone, leadId, finalReply);
    return;
  }

  // Guarantee the catalog URL appears in the reply even if Gemini forgot to include it
  if (sentCatalogUrl) {
    if (!finalReply.includes(sentCatalogUrl)) {
      finalReply = finalReply.trimEnd()
        ? `${finalReply.trimEnd()}\n\n📋 קטלוג הנכסים שלך:\n${sentCatalogUrl}`
        : `הנה קטלוג הנכסים המותאם לך 🏠\n${sentCatalogUrl}`;
    }
    // Invite to schedule a consultation call
    if (!finalReply.includes('שיחה') && !finalReply.includes('פגישה') && !finalReply.includes('ייעוץ')) {
      finalReply += '\n\nהיועץ שלנו זמין לדון איתך על הנכסים ולסייע בקבלת ההחלטה.\nמתי נוח לך לשיחת ייעוץ?';
    }
  }

  // After meeting scheduled: closing message
  if (meetingScheduled) {
    const base = finalReply.trim() || 'מצוין.';
    finalReply = `${base}\n\nתודה. נדבר בקרוב.\nלשאלות נוספות, אנחנו כאן.`;
  }

  if (!finalReply.trim()) {
    console.warn(`[WeBot] Empty reply from Gemini for lead ${leadId}, using fallback.`);
    finalReply = 'תודה על פנייתך. נחזור אליך בהקדם.';
  }

  await sendBotMessage(integration, customerPhone, leadId, finalReply);

  // After catalog is sent → move to SCHEDULING_CALL + notify agent
  if (catalogCreated) {
    await updateChatState(leadId, 'SCHEDULING_CALL');

    const freshLead  = await db.collection('leads').doc(leadId).get();
    const reqs       = freshLead.data()?.requirements || {};
    const leadName   = leadData.name || customerPhone;
    const reqSummary = [
      Array.isArray(reqs.desiredCity)   ? reqs.desiredCity.join(', ')                      : null,
      reqs.minRooms                     ? `${reqs.minRooms} חדרים`                         : null,
      reqs.maxBudget                    ? `תקציב עד ₪${Number(reqs.maxBudget).toLocaleString('he-IL')}` : null,
    ].filter(Boolean).join(' | ');

    const agentPhone = await findAgentPhone(agencyId, leadData.assignedAgentId);
    if (agentPhone) {
      await notifyAgentOrAdmin(
        agentPhone,
        `🏠 *פנייה חדשה מהבוט*\nשם: ${leadName}\nטלפון: ${customerPhone}\nדרישות: ${reqSummary || 'לא צוין'}\nהלקוח קיבל קטלוג ומחכה לשיחת ייעוץ.`,
        greenApiCreds,
      );
    }

    await createCRMNotification(
      agencyId, leadId, leadName,
      'new_buyer_inquiry', 'assign_agent',
      { phone: customerPhone, requirements: reqs, catalogSent: true },
    );
  }
}

// ─── Seller Flow (deterministic) ─────────────────────────────────────────────

async function runSellerFlow(
  agencyId:       string,
  leadId:         string,
  customerPhone:  string,
  incomingMessage: string,
  geminiApiKey:   string,
  leadData:       admin.firestore.DocumentData,
  integration:    WhatsappIntegration,
  currentState:   ChatState,
  chatStateData:  StoredChatState,
  greenApiCreds:  { idInstance: string; apiTokenInstance: string },
): Promise<void> {
  const leadName = leadData.name || customerPhone;

  // ── First contact: start seller flow ─────────────────────────────────────
  if (currentState === 'IDLE') {
    await db.collection('leads').doc(leadId).update({ type: 'seller', status: 'potential_seller' });
    await updateChatState(leadId, 'COLLECTING_SELLER_INFO');
    await sendBotMessage(
      integration, customerPhone, leadId,
      `תודה שפנית.\nכדי שנוכל לשווק את הנכס שלך, אנא ספר לנו:\n\n1. מה *כתובת הנכס*?\n2. מה *סוג הנכס*? (דירה, בית פרטי, דופלקס, פנטהאוס וכו׳)`,
    );
    return;
  }

  // ── Collecting address + property type ───────────────────────────────────
  if (currentState === 'COLLECTING_SELLER_INFO') {
    const extracted    = await extractSellerInfo(incomingMessage, geminiApiKey);
    const address      = extracted.address      || chatStateData.pendingSellerAddress;
    const propertyType = extracted.propertyType || chatStateData.pendingSellerType;

    if (!address && !propertyType) {
      await sendBotMessage(
        integration, customerPhone, leadId,
        `לא הצלחתי לזהות את הפרטים.\nאנא ציין את *כתובת הנכס* וה*סוג* שלו — לדוגמה: "דירה ברחוב הרצל 5, תל אביב"`,
      );
      return;
    }

    if (!address || !propertyType) {
      await updateChatState(leadId, 'COLLECTING_SELLER_INFO', {
        pendingSellerAddress: address,
        pendingSellerType:    propertyType,
      });
      const missing = !address ? 'כתובת הנכס' : 'סוג הנכס (דירה, בית, פנטהאוס וכו׳)';
      await sendBotMessage(
        integration, customerPhone, leadId,
        `תודה. כדי להמשיך, חסר לנו ${missing}.`,
      );
      return;
    }

    // All info collected → move to scheduling
    await db.collection('leads').doc(leadId).update({
      sellerInfo: { address, propertyType },
      type: 'seller',
    });
    await updateChatState(leadId, 'SCHEDULING_SELLER_CALL', {
      pendingSellerAddress: address,
      pendingSellerType:    propertyType,
    });
    await sendBotMessage(
      integration, customerPhone, leadId,
      `קיבלנו את הפרטים:\n📍 *כתובת:* ${address}\n🏠 *סוג:* ${propertyType}\n\nמתי נוח לך לשיחה עם מנהל המשרד? (ציין יום ושעה מועדפים)`,
    );
    return;
  }

  // ── Scheduling the seller call ────────────────────────────────────────────
  if (currentState === 'SCHEDULING_SELLER_CALL') {
    const timePreference = await extractTimePreference(incomingMessage, geminiApiKey);
    const address        = chatStateData.pendingSellerAddress || leadData.sellerInfo?.address || 'לא צוין';
    const propertyType   = chatStateData.pendingSellerType    || leadData.sellerInfo?.propertyType || 'לא צוין';

    await db.collection('tasks').add({
      agencyId, leadId,
      createdBy:     'bot',
      title:         `שיחת ייעוץ מוכר — ${leadName}`,
      description:   `נכס: ${propertyType} ב${address}\nזמן מועדף: ${timePreference}\nטלפון: ${customerPhone}`,
      priority:      'High',
      isCompleted:   false,
      type:          'seller_call',
      relatedTo:     { type: 'lead', id: leadId },
      scheduledTime: timePreference,
      createdAt:     admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
    });

    await sendBotMessage(
      integration, customerPhone, leadId,
      'תודה. מנהל המשרד יחזור אליך בזמן שציינת.',
    );

    await updateChatState(leadId, 'IDLE');

    // Notify admin (not agent — seller goes straight to admin)
    const adminPhone = await findAdminPhone(agencyId);
    if (adminPhone) {
      await notifyAgentOrAdmin(
        adminPhone,
        `🏠 *מוכר חדש — מהבוט*\nשם: ${leadName}\nטלפון: ${customerPhone}\nנכס: ${propertyType} ב${address}\nזמן מועדף לשיחה: *${timePreference}*`,
        greenApiCreds,
      );
    }

    await createCRMNotification(
      agencyId, leadId, leadName,
      'new_seller_inquiry', 'contact_seller',
      { phone: customerPhone, address, propertyType, scheduledTime: timePreference, canAssignToAgent: true },
    );
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function handleWeBotReply(
  agencyId:        string,
  leadId:          string,
  customerPhone:   string,
  incomingMessage: string,
  geminiApiKey:    string,
  greenApiCreds:   { idInstance: string; apiTokenInstance: string },
  _idMessage?:     string,
  currentMsgDocId?: string,
): Promise<void> {
  try {
    // 1. Fetch agency + lead
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
    const botConfig  = mapWeBotConfig(agencyData.weBotConfig || {});

    // 2. Bot active check (agency-level)
    if (!botConfig.isActive) {
      console.log(`[WeBot] Bot disabled by agency ${agencyId}.`);
      return;
    }

    // 3. AI Firewall: honour human-reply mute window
    const muteMs = (botConfig.firewallMuteHours ?? 12) * 60 * 60 * 1000;
    if (Date.now() - (leadData.lastHumanReplyAt?.toMillis?.() ?? 0) < muteMs) {
      console.log(`[WeBot] 🔇 Firewall mute active for lead ${leadId}`);
      return;
    }

    const integration: WhatsappIntegration = {
      idInstance:       greenApiCreds.idInstance,
      apiTokenInstance: greenApiCreds.apiTokenInstance,
      isConnected:      true,
    };

    // 4. Resolve current state + handle resets
    const storedChatState: StoredChatState = leadData.chatState
      ? { state: leadData.chatState.state || 'IDLE', lastStateAt: leadData.chatState.lastStateAt || 0, ...leadData.chatState }
      : { state: 'IDLE', lastStateAt: 0 };

    const isResetKeyword = RESET_KEYWORDS.some(kw => incomingMessage.includes(kw));
    const isStale        = storedChatState.lastStateAt > 0 && (Date.now() - storedChatState.lastStateAt > STATE_TIMEOUT_MS);

    let currentState: ChatState = storedChatState.state;

    if (isResetKeyword) {
      await updateChatState(leadId, 'IDLE');
      await sendBotMessage(
        integration, customerPhone, leadId,
        'בסדר, מתחילים מחדש.\nאיך אוכל לעזור לך היום?\n• מחפש דירה לקנות/לשכור?\n• רוצה לפרסם ולמכור נכס?',
      );
      return;
    }

    if (isStale && currentState !== 'IDLE') {
      console.log(`[WeBot] State stale (>24h) for lead ${leadId} — resetting to IDLE`);
      currentState = 'IDLE';
      await updateChatState(leadId, 'IDLE');
    }

    // 5. Name collection: ask name on first bot interaction (regardless of WhatsApp display name)
    if (currentState === 'COLLECTING_NAME') {
      const name = incomingMessage.trim().substring(0, 50) || 'לקוח';
      await db.collection('leads').doc(leadId).update({ name, botNameCollected: true });
      await updateChatState(leadId, 'IDLE');
      await sendBotMessage(
        integration, customerPhone, leadId,
        `נעים להכיר, ${name}.\nאיך אוכל לעזור לך?\n• מחפש/ת דירה לקנות או לשכור?\n• רוצה לפרסם ולמכור נכס?`,
      );
      return;
    }

    if (currentState === 'IDLE' && !leadData.botNameCollected) {
      const agencyDisplayName = agencyData.agencyName || agencyData.name || 'הסוכנות שלנו';
      await updateChatState(leadId, 'COLLECTING_NAME');
      await sendBotMessage(
        integration, customerPhone, leadId,
        `שלום, אני הנציג הדיגיטלי של ${agencyDisplayName}.\nאשמח לעזור לך בחיפוש או שיווק נכס.\nמה שמך?`,
      );
      return;
    }

    // 6. Route by state
    if (currentState === 'IDLE') {
      const intent = await classifyIntent(incomingMessage, leadData.type || 'buyer', geminiApiKey);
      console.log(`[WeBot] Intent=${intent} for lead ${leadId}`);

      if (intent === 'irrelevant') {
        // Known leads: log silent CRM note. New contacts: discard.
        if (leadData.source) {
          await createCRMNotification(
            agencyId, leadId, leadData.name || customerPhone,
            'new_buyer_inquiry', 'assign_agent',
            { phone: customerPhone, note: 'הודעה לא רלוונטית מליד קיים', message: incomingMessage },
          );
        }
        return; // No WhatsApp reply
      }

      if (intent === 'seller') {
        await runSellerFlow(
          agencyId, leadId, customerPhone, incomingMessage,
          geminiApiKey, leadData, integration, 'IDLE',
          storedChatState, greenApiCreds,
        );
        return;
      }

      // buyer (default)
      await runBuyerFlow(
        agencyId, leadId, customerPhone, incomingMessage,
        geminiApiKey, agencyData, leadData, integration,
        currentMsgDocId, greenApiCreds, currentState,
      );
      return;
    }

    if (currentState === 'COLLECTING_REQS' || currentState === 'ASKING_EXTRA_CRITERIA' || currentState === 'SCHEDULING_CALL') {
      await runBuyerFlow(
        agencyId, leadId, customerPhone, incomingMessage,
        geminiApiKey, agencyData, leadData, integration,
        currentMsgDocId, greenApiCreds, currentState,
      );
      return;
    }

    if (currentState === 'COLLECTING_SELLER_INFO' || currentState === 'SCHEDULING_SELLER_CALL') {
      await runSellerFlow(
        agencyId, leadId, customerPhone, incomingMessage,
        geminiApiKey, leadData, integration, currentState,
        storedChatState, greenApiCreds,
      );
    }

  } catch (err) {
    console.error('[WeBot] handleWeBotReply error:', err);
  }
}
