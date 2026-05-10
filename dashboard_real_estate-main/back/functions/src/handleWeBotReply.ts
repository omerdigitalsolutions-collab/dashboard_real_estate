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
import { Resend } from 'resend';
import {
  buildWeBotPrompt,
  sendWhatsAppMessage,
  BotConfig,
  WhatsappIntegration,
  createSharedCatalog,
} from './whatsappService';
import { evaluateMatch, MatchingProperty, MatchingRequirements } from './leads/matchingEngine';
import { createCalendarEvent } from './calendar/eventManager';
import {
  getOfficeManagerUserId,
  queryFreeBusy,
  findFreeSlots,
  formatSlotHebrew,
} from './services/googleCalendar';

const db = admin.firestore();

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 1): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isTransient = err?.message?.includes('fetch failed') || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.message?.includes('timeout');
      if (isTransient && attempt < retries) {
        const delay = 400 * (attempt + 1);
        console.warn(`[WeBot] ${label} — transient error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms:`, err.message);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

// Reuse one client per process — `new GoogleGenerativeAI()` is cheap, but
// caching prevents repeated allocation under load.
let cachedGenAI: GoogleGenerativeAI | null = null;
let cachedGenAIKey = '';
function getGenAI(apiKey: string): GoogleGenerativeAI {
  if (!cachedGenAI || cachedGenAIKey !== apiKey) {
    cachedGenAI = new GoogleGenerativeAI(apiKey);
    cachedGenAIKey = apiKey;
  }
  return cachedGenAI;
}

// Hard deadline on any Gemini call so a hung request doesn't block the bot
// for minutes. flash-lite normally responds in 0.5–2s — 8s is generous.
function withTimeout<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    fn().then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
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
  | 'SCHEDULING_SELLER_CALL'
  | 'CLOSED';

interface StoredChatState {
  state: ChatState;
  lastStateAt: number;
  pendingSellerAddress?: string;
  pendingSellerType?: string;
  extraCriteriaAsked?: boolean;
  closedAt?: number;
  sellerInfoAttempts?: number;
  pendingIntent?: 'buyer' | 'seller'; // intent captured before name was collected
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
  description: 'שמור את דרישות הלקוח שאספת. קרא ברגע שיש לך לפחות פרמטר אחד (חדרים / תקציב / סוג / עיר / שכונה / רחוב). עיר אינה חובה — ניתן לחפש בכל נכסי הסוכנות.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      desiredCity:          { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: 'ערים מועדפות (עברית) — אופציונלי' },
      desiredNeighborhoods: { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: 'שכונות מועדפות (עברית) — אופציונלי' },
      desiredStreet:        { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: 'רחובות מועדפים (עברית) — שמור את שם הרחוב בלבד בלי המספר. לדוגמה: "הרצל" ולא "הרצל 5".' },
      maxBudget:            { type: SchemaType.NUMBER,  description: 'תקציב מקסימלי בשקלים' },
      minRooms:             { type: SchemaType.NUMBER,  description: 'מינימום חדרים' },
      maxRooms:             { type: SchemaType.NUMBER,  description: 'מקסימום חדרים' },
      propertyType:         { type: SchemaType.ARRAY,   items: { type: SchemaType.STRING }, description: '"sale" לקנייה, "rent" לשכירות' },
      mustHaveParking:      { type: SchemaType.BOOLEAN },
      mustHaveElevator:     { type: SchemaType.BOOLEAN },
      mustHaveBalcony:      { type: SchemaType.BOOLEAN },
      mustHaveSafeRoom:     { type: SchemaType.BOOLEAN },
    },
    required: [],
  },
};

const createCatalogDeclaration: FunctionDeclaration = {
  name: 'create_catalog',
  description: 'צור קטלוג נכסים מותאם ללקוח לפי הדרישות השמורות. קרא לאחר update_lead_requirements.',
  parameters: { type: SchemaType.OBJECT, properties: {} },
};

const notifyAssignedAgentDeclaration: FunctionDeclaration = {
  name: 'notify_assigned_agent',
  description:
    'שלח התראת WhatsApp לסוכן האחראי על נכס בלעדי כשהלקוח שואל עליו ספציפית. קרא רק כאשר ענית על שאלה לגבי נכס שמופיע ב-RAG context עם המזהה שלו, ואחרי שכבר נתת ללקוח את הפרטים.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      propertyId: { type: SchemaType.STRING, description: 'המזהה של הנכס מהקונטקסט (השדה [מזהה: ...])' },
    },
    required: ['propertyId'],
  },
};

const checkAvailabilityDeclaration: FunctionDeclaration = {
  name: 'check_availability',
  description: 'בדוק זמינות ביומן מנהל המשרד לתיאום פגישה. מחזיר עד 3 חלונות זמן פנויים בימי העסקים הקרובים. קרא לפני schedule_meeting כדי להציג ללקוח זמנים ריאליים שבהם המשרד פנוי.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      preferredDate: {
        type: SchemaType.STRING,
        description: 'תאריך מועדף להתחלת החיפוש YYYY-MM-DD (אופציונלי — ברירת מחדל: היום)',
      },
    },
    required: [],
  },
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
    .limit(100)
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
            .limit(50).get();
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

// ─── handleNotifyAssignedAgent ────────────────────────────────────────────────

/**
 * Looks up a property by ID across the agency and city subcollections, and —
 * if the property is exclusive and has an assigned agent — pings the agent
 * via WhatsApp. Called by Gemini's `notify_assigned_agent` function.
 */
async function handleNotifyAssignedAgent(
  agencyId: string,
  customerPhone: string,
  customerMessage: string,
  propertyId: string,
  greenApiCreds: { idInstance: string; apiTokenInstance: string },
  resendApiKey?: string,
): Promise<{ notified: boolean; reason?: string }> {
  try {
    const agencyPropDoc = await db.collection('agencies').doc(agencyId).collection('properties').doc(propertyId).get();
    let prop = agencyPropDoc.exists ? agencyPropDoc.data() : null;

    // Fallback: search city-level properties
    if (!prop) {
      const cityHit = await db.collectionGroup('properties').where('id', '==', propertyId).limit(1).get();
      if (!cityHit.empty) prop = cityHit.docs[0].data();
    }
    if (!prop) return { notified: false, reason: 'property_not_found' };

    if (prop.isExclusive !== true) return { notified: false, reason: 'not_exclusive' };
    const assignedAgentId: string | null = prop.management?.assignedAgentId || prop.agentId || null;
    if (!assignedAgentId) return { notified: false, reason: 'no_assigned_agent' };

    const agentDoc = await db.collection('users').doc(assignedAgentId).get();
    const agentData = agentDoc.data() || {};
    const agentPhone: string | null = agentData.phone || agentData.phoneNumber || null;
    const agentEmail: string | null = agentData.email || null;

    const address = prop.address?.fullAddress || `${prop.address?.street}, ${prop.address?.city}` || prop.city || 'נכס';
    const waMsg = `🏠 *פנייה ישירה לנכס — מהבוט*\nטלפון לקוח: ${customerPhone}\nשאל על: ${address}\n\nהודעה:\n"${customerMessage}"`;

    if (agentPhone) {
      await notifyAgentOrAdmin(agentPhone, waMsg, greenApiCreds);
    }
    if (agentEmail && resendApiKey) {
      await sendEmailNotification(
        resendApiKey, agentEmail,
        `פנייה ישירה לנכס — ${address}`,
        `<div dir="rtl" style="font-family:sans-serif;color:#333">
          <h2>🏠 לקוח התעניין בנכס ספציפי</h2>
          <p><strong>נכס:</strong> ${address}</p>
          <p><strong>טלפון לקוח:</strong> ${customerPhone}</p>
          <p><strong>הודעת הלקוח:</strong> ${customerMessage}</p>
        </div>`,
      );
    }

    // Also notify admin if no assigned agent phone/email was found
    if (!agentPhone && !agentEmail) return { notified: false, reason: 'no_agent_contact' };
    return { notified: true };
  } catch (err) {
    console.warn('[WeBot] handleNotifyAssignedAgent failed:', err);
    return { notified: false, reason: 'error' };
  }
}

// ─── generateConversationSummary ──────────────────────────────────────────────

async function generateConversationSummary(
  leadType: 'buyer' | 'seller',
  recentMessages: string[],
  sellerInfo: { address?: string; propertyType?: string } | null,
  geminiApiKey: string,
): Promise<string> {
  if (leadType === 'seller' && sellerInfo) {
    const parts = [];
    if (sellerInfo.propertyType) parts.push(sellerInfo.propertyType);
    if (sellerInfo.address) parts.push(`ב${sellerInfo.address}`);
    return parts.length ? `${parts.join(' ')} — הגיש/ה בקשה לשיווק` : 'מוכר פנה לשיווק נכס';
  }

  try {
    const genAI = getGenAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const conversation = recentMessages.join('\n');
    const result = await withTimeout('summary', 6000, () => model.generateContent(
      `סכם את השיחה הבאה בין בוט נדל"ן לבין לקוח קונה בשתי שורות קצרות בעברית.\n\n${conversation}`,
    ));
    return result.response.text().trim().substring(0, 200);
  } catch (err) {
    console.warn('[WeBot] Failed to generate summary:', err);
    return 'לקוח חדש מחפש נכס';
  }
}

// ─── updateChatState ──────────────────────────────────────────────────────────

async function updateChatState(
  leadId: string,
  state: ChatState,
  extra: Partial<StoredChatState> = {},
): Promise<void> {
  // Firestore rejects `undefined` values — strip them so partial extractor
  // results (e.g. address known, propertyType unknown) don't crash the write.
  const cleanExtra: Record<string, any> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) cleanExtra[k] = v;
  }
  await db.collection('leads').doc(leadId).update({
    chatState: { state, lastStateAt: Date.now(), ...cleanExtra },
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
    // Fire-and-forget — message already left WhatsApp; the Firestore log
    // isn't on the critical path of the customer reply.
    db.collection(`leads/${leadId}/messages`).add({
      text,
      direction:   'outbound',
      senderPhone: 'bot',
      source:      'whatsapp_ai_bot',
      botSentAt:   Date.now(),
      timestamp:   admin.firestore.FieldValue.serverTimestamp(),
      isRead:      true,
    }).catch((e) => console.warn('[WeBot] outbound msg log failed:', e?.message));
  }
}

// ─── classifyIntent ───────────────────────────────────────────────────────────

async function classifyIntent(
  message: string,
  leadType: string,
  geminiApiKey: string,
  leadStatus?: string,
  currentState?: ChatState,
): Promise<'buyer' | 'seller' | 'irrelevant'> {
  // State continuity short-circuits — only stay-in-flow when actively in a
  // collection/scheduling state. When state is IDLE (between flows or a
  // returning customer), always reclassify so a seller who comes back with
  // a buyer question gets routed correctly. The mid-flow override at the
  // call site already passes leadType='new' to opt out, so this guard is
  // effectively "don't override an active collection state".
  const inActiveFlow = currentState !== undefined && currentState !== 'IDLE';
  if (inActiveFlow) {
    if (leadType === 'seller') return 'seller';
    if (leadType === 'buyer' && leadStatus === 'searching') return 'buyer';
  }

  // Otherwise, let Gemini decide. No keyword fast-paths — those caused
  // false positives ("אני מחפש קונה לדירה שלי" → buyer) and made the
  // classifier disagree with itself.
  try {
    const genAI = getGenAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await withTimeout('classifyIntent', 8000, () => model.generateContent(
      `סווג את ההודעה הבאה לאחת מ-3 קטגוריות. החזר JSON בלבד.\n\nהודעה: "${message}"\n\n` +
      `קטגוריות:\n- buyer: הלקוח מחפש דירה/נכס לקנייה או לשכירות (גם אם השתמש במילים "למכירה"/"להשכרה" — אלו מתייחסות לסטטוס הנכס, לא לכוונת הלקוח).\n` +
      `- seller: הלקוח רוצה למכור/להשכיר/לפרסם את הדירה שלו, או מחפש קונה/שוכר לנכס שלו.\n` +
      `- irrelevant: ברכות בלבד, ספאם, תגובה לא ברורה.\n\n` +
      `כלל מנחה: אם הלקוח הוא זה שמחפש/מתעניין/רוצה דירה — זה buyer, גם אם נכתב "דירה למכירה" או "דירה להשכרה".\n\n` +
      `דוגמאות:\n` +
      `- "מחפש דירה למכירה בתל אביב 5 חדרים" → buyer\n` +
      `- "מתעניין בדירת 5 חדרים במודיעין" → buyer\n` +
      `- "דירה להשכרה ברמת גן 4 חדרים" → buyer\n` +
      `- "מחפש דירה לקנות" → buyer\n` +
      `- "אני רוצה למכור את הדירה שלי" → seller\n` +
      `- "מחפש קונה לדירה שלי" → seller\n` +
      `- "רוצה לפרסם נכס למכירה" → seller\n\n` +
      `{"intent":"buyer"|"seller"|"irrelevant"}`
    ));
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return (['buyer', 'seller', 'irrelevant'].includes(parsed.intent) ? parsed.intent : 'irrelevant') as 'buyer' | 'seller' | 'irrelevant';
  } catch (err) {
    console.warn('[WeBot] Intent classification failed:', err);
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

async function findAdminEmail(agencyId: string): Promise<string | null> {
  const snap = await db.collection('users')
    .where('agencyId', '==', agencyId)
    .where('role', '==', 'admin')
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].data()?.email || null;
}

async function findAgentEmail(agencyId: string, assignedAgentId?: string): Promise<string | null> {
  if (assignedAgentId) {
    const doc = await db.collection('users').doc(assignedAgentId).get();
    const email = doc.data()?.email;
    if (email) return email;
  }
  const snap = await db.collection('users')
    .where('agencyId', '==', agencyId)
    .where('role', 'in', ['agent', 'admin'])
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].data()?.email || null;
}

async function sendEmailNotification(
  resendApiKey: string,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<void> {
  try {
    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: 'hOMER CRM <noreply@omer-crm.co.il>',
      to: [to],
      subject,
      html: htmlBody,
    });
  } catch (err) {
    console.warn('[WeBot] sendEmailNotification failed (non-fatal):', err);
  }
}

// ─── generatePropertyTeaser ───────────────────────────────────────────────────

async function generatePropertyTeaser(
  userMessage: string,
  properties: Array<{ type: string; city: string; rooms: number | null; price: number | null }>,
  geminiApiKey: string,
): Promise<string> {
  try {
    const genAI = getGenAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const propContext = properties.length
      ? properties.map(p => `${p.type}${p.city ? ` ב${p.city}` : ''}${p.rooms ? `, ${p.rooms} חדרים` : ''}${p.price ? `, ₪${Number(p.price).toLocaleString('he-IL')}` : ''}`).join(' | ')
      : 'נכסים מגוונים';

    // Cap the embedded user text to prevent prompt inflation / injection attempts
    const safeMsg = userMessage.replace(/"/g, "'").substring(0, 120);
    const result = await withTimeout('generatePropertyTeaser', 6000, () => model.generateContent(
      `כתוב משפט אחד קצר בעברית (עד 20 מילים) המקבל בחמימות לקוח שפנה בהודעה הזו: "${safeMsg}".\n` +
      `נכסים זמינים בסוכנות: ${propContext}.\n` +
      `הטון: חם ומקצועי. אל תזכיר מחירים ספציפיים. אל תשאל שאלות. רק משפט קבלת פנים קצר.`,
    ));
    const text = result.response.text().trim();
    return text || 'שמחים שפנית אלינו! יש לנו נכסים מעולים שיכולים להתאים לך.';
  } catch {
    return 'שמחים שפנית אלינו! יש לנו נכסים מעולים שיכולים להתאים לך.';
  }
}

// ─── extractSellerInfo ────────────────────────────────────────────────────────

async function extractSellerInfo(
  message: string,
  geminiApiKey: string,
): Promise<{ address?: string; propertyType?: string }> {
  try {
    const genAI = getGenAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await withTimeout('extractSellerInfo', 6000, () => model.generateContent(
      `חלץ פרטי נכס מהמסר הבא. החזר JSON בלבד.\n\nמסר: "${message}"\n\n` +
      `{"address":"כתובת מלאה או null","propertyType":"דירה/בית/דופלקס/פנטהאוס/מסחרי או null"}`
    ));
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

/**
 * Extracts a usable time hint from the customer's message via Gemini.
 * Returns null when Gemini can't find a time signal (or fails) so the caller
 * can re-ask instead of saving garbage like "תודה רבה" as scheduledTime.
 */
async function extractTimePreference(message: string, geminiApiKey: string): Promise<string | null> {
  const trimmed = message.trim();
  try {
    const genAI = getGenAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const today = new Date().toLocaleDateString('he-IL');
    const result = await withTimeout('extractTimePreference', 6000, () => model.generateContent(
      `חלץ העדפת זמן מהמסר. תאריך היום: ${today}.\nמסר: "${trimmed}"\n` +
      `החזר JSON בלבד. אם אין במסר אזכור של יום/שעה/תאריך, החזר null.\n` +
      `{"timeText":"תיאור הזמן הקריא בעברית, או null"}`
    ));
    const parsed = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
    if (typeof parsed.timeText === 'string' && parsed.timeText.trim()) {
      return parsed.timeText.trim();
    }
    return null;
  } catch (err) {
    console.warn('[WeBot] extractTimePreference failed (Gemini/parse error):', err);
    return null;
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
  resendApiKey?:  string,
): Promise<void> {
  // RAG: active properties + chat history in parallel
  const reqsCity = leadData.requirements?.desiredCity?.[0];
  const globalPropPromise = reqsCity ?
    db.collection('cities').doc(reqsCity).collection('properties').limit(3).get() :
    Promise.resolve({ docs: [] });

  const [propSnap, globalSnap, chatHistory] = await Promise.all([
    db.collection('agencies').doc(agencyId).collection('properties')
      .where('status', '==', 'active')
      .limit(10)
      .get(),
    globalPropPromise,
    loadChatHistory(leadId, 12, currentMsgDocId),
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
      isExclusive: d.isExclusive === true,
    };
  });

  const agencyName  = agencyData.agencyName || agencyData.name || 'הסוכנות שלנו';
  const botConfig   = mapWeBotConfig(agencyData.weBotConfig || {});
  const systemPrompt = buildWeBotPrompt(botConfig, ragProperties, agencyName);

  const schedulingPrefix =
    currentState === 'SCHEDULING_CALL'
      ? '⚠️ מצב נוכחי: הלקוח מוכן לתאם פגישה עם המתווך. פעל כך:\n1. קרא ל-check_availability כדי לשלוף את הזמנים הפנויים.\n2. הצע ללקוח את הזמן הפנוי הראשון בשפה טבעית — לדוגמה: "מחר בשעה 10:00 יהיה לך נוח? אם לא, תכתוב מתי אפשרי."\n3. אם הלקוח מאשר — קרא ל-schedule_meeting עם הזמן שנבחר.\n4. אם הלקוח דוחה ומציע זמן אחר — קרא שוב ל-check_availability עם התאריך שהציע, ואשר או הצע חלופה.\n5. לאחר קביעת הפגישה שלח הודעת סיום חמה וחזור ל-IDLE.\nאל תקרא שוב ל-update_lead_requirements או ל-create_catalog.\n\n'
      : '⚡ מהירות מעל הכל: ברגע שיש לך לפחות פרמטר אחד (חדרים / תקציב / סוג נכס / שכונה), קרא ל-update_lead_requirements ומיד אחר כך ל-create_catalog — אין צורך לדעת עיר. הבוט מחפש בכל נכסי הסוכנות. שאל שאלה אחת בלבד: "יש פרטים נוספים שחשוב לי לדעת לפני שאמצא לך נכסים?" ואז צור קטלוג ללא תלות בתשובה.\n\n';

  const genAI = getGenAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    tools: [{ functionDeclarations: [scheduleMeetingDeclaration, updateLeadRequirementsDeclaration, createCatalogDeclaration, notifyAssignedAgentDeclaration, checkAvailabilityDeclaration] }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    systemInstruction: schedulingPrefix + systemPrompt,
  });

  const chat = model.startChat({ history: chatHistory });
  let chatResponse  = await withRetry('chat.sendMessage', () => withTimeout('chat.sendMessage', 20_000, () => chat.sendMessage(incomingMessage)));
  let finalReply             = '';
  let catalogCreated         = false;
  let sentCatalogUrl: string | null = null;
  let iterCount              = 0;
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

      // Reject Gemini outputs that aren't well-formed dates/times — feed the
      // error back so it asks the user again instead of crashing on
      // Invalid Date.toISOString().
      const dateOk = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
      const timeOk = typeof time === 'string' && /^\d{2}:\d{2}$/.test(time);
      const startDateObj = dateOk && timeOk ? new Date(`${date}T${time}:00`) : null;
      if (!startDateObj || Number.isNaN(startDateObj.getTime())) {
        chatResponse = await withRetry('chat.sendMessage(fn)', () => withTimeout('chat.sendMessage(fn)', 20_000, () => chat.sendMessage([{
          functionResponse: {
            name: call.name,
            response: {
              success: false,
              reason: 'invalid_datetime',
              message: 'התאריך או השעה לא תקינים. בקש מהלקוח תאריך בפורמט YYYY-MM-DD ושעה בפורמט HH:MM.',
            },
          },
        }])));
        continue;
      }
      const startDateTime = `${date}T${time}:00`;
      const endDate     = new Date(startDateObj);
      endDate.setMinutes(endDate.getMinutes() + durationMins);
      const endDateTime = endDate.toISOString().slice(0, 16) + ':00';

      // Freebusy validation — reject the proposed slot if the Office Manager is
      // already busy and surface alternatives so Gemini can re-ask the customer.
      try {
        const calendarOwner = await getOfficeManagerUserId(agencyId);
        if (calendarOwner) {
          const busyForSlot = await queryFreeBusy(calendarOwner, startDateObj.toISOString(), endDate.toISOString());
          const hasConflict = busyForSlot.some(b => startDateObj < new Date(b.end) && endDate > new Date(b.start));
          if (hasConflict) {
            const windowEnd = new Date(startDateObj.getTime() + 3 * 24 * 60 * 60 * 1000);
            const allBusy   = await queryFreeBusy(calendarOwner, startDateObj.toISOString(), windowEnd.toISOString());
            const alts      = findFreeSlots(allBusy, startDateObj, windowEnd, durationMins);
            chatResponse = await withRetry('chat.sendMessage(fn)', () => withTimeout('chat.sendMessage(fn)', 20_000, () => chat.sendMessage([{
              functionResponse: {
                name: call.name,
                response: {
                  success: false,
                  reason: 'time_conflict',
                  message: 'הזמן שהוצע תפוס ביומן. הצע ללקוח את האלטרנטיבות שלהלן.',
                  alternatives: alts.map(formatSlotHebrew),
                },
              },
            }])));
            continue;
          }
        }
      } catch (freeBusyErr) {
        // If freebusy check fails (network / OAuth) proceed optimistically —
        // the meeting will be created and the Office Manager can reschedule.
        console.warn('[WeBot] freebusy validation failed (proceeding optimistically):', freeBusyErr);
      }

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
      if (Array.isArray(args.desiredCity)          && args.desiredCity.length)          requirements.desiredCity          = args.desiredCity;
      if (Array.isArray(args.desiredNeighborhoods) && args.desiredNeighborhoods.length) requirements.desiredNeighborhoods = args.desiredNeighborhoods;
      // Street numbers are intentionally stripped — the matching engine compares by
      // street name only, and Gemini sometimes includes the house number despite
      // the schema description.
      if (Array.isArray(args.desiredStreet) && args.desiredStreet.length) {
        requirements.desiredStreet = args.desiredStreet
          .map((s: any) => typeof s === 'string' ? s.replace(/\s*\d+\s*$/, '').trim() : '')
          .filter((s: string) => s.length > 0);
      }
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
      functionResult = { success: true, message: 'הדרישות נשמרו. קרא עכשיו ל-create_catalog באותו תור.' };

    // ── create_catalog ────────────────────────────────────────────────────────
    } else if (call.name === 'create_catalog') {
      {
        const freshLead = await db.collection('leads').doc(leadId).get();
        const reqs: MatchingRequirements = freshLead.data()?.requirements || {};

        const hasAnyReq =
            reqs.desiredCity?.length ||
            reqs.desiredNeighborhoods?.length ||
            reqs.desiredStreet?.length ||
            (reqs.maxBudget !== undefined && reqs.maxBudget !== null) ||
            (reqs.minRooms  !== undefined && reqs.minRooms  !== null) ||
            (reqs.maxRooms  !== undefined && reqs.maxRooms  !== null) ||
            reqs.propertyType?.length;
        if (!hasAnyReq) {
          functionResult = {
            success: false, reason: 'missing_requirements',
            message: 'לא נמצאו דרישות שמורות. יש לאסוף מהלקוח לפחות פרמטר אחד (חדרים / תקציב / סוג נכס).',
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
              leadData.assignedAgentId || '',
            );
            catalogCreated = true;
            sentCatalogUrl = catalogUrl;
            console.log(`[WeBot] 📄 Catalog created: lead=${leadId} URL=${catalogUrl} count=${propertyRefs.length}`);
            functionResult = { success: true, url: catalogUrl, count: matchedProperties.length };
          }
        }
      }

    // ── notify_assigned_agent ─────────────────────────────────────────────────
    } else if (call.name === 'notify_assigned_agent') {
      const args = call.args as Record<string, any>;
      const propertyId = typeof args.propertyId === 'string' ? args.propertyId : '';
      if (!propertyId) {
        functionResult = { success: false, reason: 'missing_property_id' };
      } else {
        const result = await handleNotifyAssignedAgent(
          agencyId, customerPhone, incomingMessage, propertyId, greenApiCreds, resendApiKey,
        );
        functionResult = { success: result.notified, reason: result.reason };
      }

    // ── check_availability ────────────────────────────────────────────────────
    } else if (call.name === 'check_availability') {
      const { preferredDate } = (call.args || {}) as { preferredDate?: string };
      const officeManagerId = await getOfficeManagerUserId(agencyId);

      if (!officeManagerId) {
        functionResult = {
          success: false,
          message: 'יומן מנהל המשרד אינו מחובר. שאל את הלקוח על זמן מועדף וקבע ישירות.',
        };
      } else {
        try {
          const windowStart = preferredDate ? new Date(`${preferredDate}T09:00:00`) : new Date();
          const windowEnd   = new Date(windowStart.getTime() + 3 * 24 * 60 * 60 * 1000);
          const busy        = await queryFreeBusy(officeManagerId, windowStart.toISOString(), windowEnd.toISOString());
          const freeSlots   = findFreeSlots(busy, windowStart, windowEnd, 60);

          if (freeSlots.length > 0) {
            functionResult = {
              success: true,
              freeSlots: freeSlots.map(formatSlotHebrew),
              message: 'הצג את הזמנים הפנויים ללקוח ובקש ממנו לבחור אחד.',
            };
          } else {
            functionResult = {
              success: true,
              freeSlots: [],
              message: 'אין זמנים פנויים בטווח זה. שאל את הלקוח על תאריך אחר.',
            };
          }
        } catch (availErr) {
          console.warn('[WeBot] check_availability failed:', availErr);
          functionResult = { success: false, message: 'לא ניתן לבדוק יומן כרגע. שאל על זמן מועדף.' };
        }
      }

    } else {
      console.warn(`[WeBot] Unknown function call: ${call.name}`);
      functionResult = { success: false, reason: 'unknown_function' };
    }

    chatResponse = await withRetry('chat.sendMessage(fn)', () => withTimeout('chat.sendMessage(fn)', 20_000, () => chat.sendMessage([{
      functionResponse: { name: call.name, response: functionResult },
    }])));
  }

  if (iterCount >= 5 && !finalReply.trim()) {
    console.warn(`[WeBot] Hit max iterations (5) for lead ${leadId}`);
    finalReply = 'הבנתי. אני מעבד את הנתונים, מיד אשוב חזרה עם תשובה מסודרת.';
  }

  // Guarantee the catalog URL appears in the reply even if Gemini forgot to include it
  if (sentCatalogUrl) {
    if (!finalReply.includes(sentCatalogUrl)) {
      finalReply = finalReply.trimEnd()
        ? `${finalReply.trimEnd()}\n\n📋 קטלוג הנכסים שלך:\n${sentCatalogUrl}`
        : `הנה קטלוג הנכסים המותאם לך 🏠\n${sentCatalogUrl}`;
    }
    // Invite to schedule — only when catalog was NOT created in this turn
    // (catalogCreated always sends a proactive slot invitation separately, so
    // appending a second scheduling question here would send two conflicting prompts).
    if (!catalogCreated && !finalReply.includes('שיחה') && !finalReply.includes('פגישה') && !finalReply.includes('ייעוץ')) {
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

  // After catalog is sent → move to SCHEDULING_CALL so the customer can still reply
  // to schedule a meeting. CLOSED would silently block all messages for 24h.
  if (catalogCreated) {
    // Proactively propose the first free slot from the Office Manager's calendar.
    // Falls back to an open-ended question when no calendar is connected or no
    // slots are available in the next 3 days.
    let schedulingInvite: string;
    try {
      const omId = await getOfficeManagerUserId(agencyId);
      if (omId) {
        const now = new Date();
        const end = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const busy = await queryFreeBusy(omId, now.toISOString(), end.toISOString());
        const free = findFreeSlots(busy, now, end);
        schedulingInvite = free.length > 0
          ? `${formatSlotHebrew(free[0])} יהיה לך נוח לשיחה עם יועץ נדל"ן שלנו?\nאם לא, תכתוב מתי אפשרי.`
          : 'מתי נוח לך לשיחה קצרה עם יועץ נדל"ן שלנו?';
      } else {
        schedulingInvite = 'מתי נוח לך לשיחה קצרה עם יועץ נדל"ן שלנו?';
      }
    } catch {
      schedulingInvite = 'מתי נוח לך לשיחה קצרה עם יועץ נדל"ן שלנו?';
    }
    await sendBotMessage(integration, customerPhone, leadId, schedulingInvite);

    await updateChatState(leadId, 'SCHEDULING_CALL');

    const freshLead  = await db.collection('leads').doc(leadId).get();
    const reqs       = freshLead.data()?.requirements || {};
    const leadName   = leadData.name || customerPhone;
    const reqSummary = [
      Array.isArray(reqs.desiredCity)          && reqs.desiredCity.length          ? reqs.desiredCity.join(', ')                      : null,
      Array.isArray(reqs.desiredNeighborhoods) && reqs.desiredNeighborhoods.length ? `שכונה: ${reqs.desiredNeighborhoods.join(', ')}`  : null,
      Array.isArray(reqs.desiredStreet)        && reqs.desiredStreet.length        ? `רחוב ${reqs.desiredStreet.join(', ')}`           : null,
      reqs.minRooms                                                                ? `${reqs.minRooms} חדרים`                          : null,
      reqs.maxBudget                                                               ? `תקציב עד ₪${Number(reqs.maxBudget).toLocaleString('he-IL')}` : null,
    ].filter(Boolean).join(' | ');

    const [agentPhone, agentEmail, adminPhone, adminEmail, recentMsgs] = await Promise.all([
      findAgentPhone(agencyId, leadData.assignedAgentId),
      findAgentEmail(agencyId, leadData.assignedAgentId),
      findAdminPhone(agencyId),
      findAdminEmail(agencyId),
      loadChatHistory(leadId, 6),
    ]);

    const waBody = `🏠 *פנייה חדשה מהבוט*\nשם: ${leadName}\nטלפון: ${customerPhone}\nדרישות: ${reqSummary || 'לא צוין'}\nהלקוח קיבל קטלוג ומחכה לשיחת ייעוץ.${sentCatalogUrl ? `\n🔗 קטלוג: ${sentCatalogUrl}` : ''}`;

    if (agentPhone) {
      await notifyAgentOrAdmin(agentPhone, waBody, greenApiCreds);
    }
    if (agentEmail && resendApiKey) {
      await sendEmailNotification(
        resendApiKey, agentEmail,
        `ליד חדש מהבוט — ${leadName}`,
        `<div dir="rtl" style="font-family:sans-serif;color:#333">
          <h2>🏠 פנייה חדשה — קונה</h2>
          <p><strong>שם:</strong> ${leadName}</p>
          <p><strong>טלפון:</strong> ${customerPhone}</p>
          <p><strong>דרישות:</strong> ${reqSummary || 'לא צוין'}</p>
          ${sentCatalogUrl ? `<p><strong>קטלוג שנשלח:</strong> <a href="${sentCatalogUrl}">${sentCatalogUrl}</a></p>` : ''}
          <p>הלקוח ממתין לשיחת ייעוץ.</p>
        </div>`,
      );
    }

    const msgTexts = recentMsgs.map(m => `${m.role === 'user' ? 'לקוח' : 'בוט'}: ${(m.parts[0] as any).text}`);
    const summary = await generateConversationSummary('buyer', msgTexts, null, geminiApiKey);

    if (adminPhone && adminPhone !== agentPhone) {
      await notifyAgentOrAdmin(adminPhone,
        `🏠 *ליד חדש — קונה*\nשם: ${leadName}\nטלפון: ${customerPhone}\nדרישות: ${reqSummary || 'לא צוין'}\n📝 סיכום: ${summary}${sentCatalogUrl ? `\n🔗 קטלוג: ${sentCatalogUrl}` : ''}`,
        greenApiCreds,
      );
    }
    if (adminEmail && adminEmail !== agentEmail && resendApiKey) {
      await sendEmailNotification(
        resendApiKey, adminEmail,
        `ליד חדש מהבוט — ${leadName}`,
        `<div dir="rtl" style="font-family:sans-serif;color:#333">
          <h2>🏠 ליד חדש — קונה</h2>
          <p><strong>שם:</strong> ${leadName}</p>
          <p><strong>טלפון:</strong> ${customerPhone}</p>
          <p><strong>דרישות:</strong> ${reqSummary || 'לא צוין'}</p>
          ${sentCatalogUrl ? `<p><strong>קטלוג שנשלח:</strong> <a href="${sentCatalogUrl}">${sentCatalogUrl}</a></p>` : ''}
          <p><strong>סיכום שיחה:</strong> ${summary}</p>
        </div>`,
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
      `תודה שפנית.\nכדי שנוכל למכור את הדירה שלך, אנא ספר לנו:\n\n1. מה *כתובת הנכס*?\n2. מה *סוג הנכס*? (דירה, בית פרטי, דופלקס, פנטהאוס וכו׳)`,
    );
    return;
  }

  // ── Collecting address + property type ───────────────────────────────────
  if (currentState === 'COLLECTING_SELLER_INFO') {
    const extracted    = await extractSellerInfo(incomingMessage, geminiApiKey);
    const address      = extracted.address      || chatStateData.pendingSellerAddress;
    const propertyType = extracted.propertyType || chatStateData.pendingSellerType;

    const attempts = (chatStateData.sellerInfoAttempts ?? 0) + 1;
    const incomplete = !address || !propertyType;

    // After 3 unsuccessful attempts, escalate to admin instead of looping forever.
    if (incomplete && attempts >= 3) {
      await updateChatState(leadId, 'IDLE', {
        pendingSellerAddress: address,
        pendingSellerType:    propertyType,
        sellerInfoAttempts:   attempts,
      });
      await sendBotMessage(
        integration, customerPhone, leadId,
        'תודה רבה. מנהל המשרד יחזור אליך בהקדם להמשך הטיפול.',
      );
      const adminPhone = await findAdminPhone(agencyId);
      if (adminPhone) {
        const partial = [
          address ? `כתובת חלקית: ${address}` : null,
          propertyType ? `סוג: ${propertyType}` : null,
        ].filter(Boolean).join(' | ') || 'אין פרטים';
        await notifyAgentOrAdmin(
          adminPhone,
          `🏠 *מוכר חדש — דורש טיפול ידני*\nשם: ${leadName}\nטלפון: ${customerPhone}\nהבוט לא הצליח לאסוף פרטים אחרי 3 ניסיונות.\n${partial}\nהודעה אחרונה: "${incomingMessage.substring(0, 200)}"`,
          greenApiCreds,
        );
      }
      await createCRMNotification(
        agencyId, leadId, leadName,
        'new_seller_inquiry', 'contact_seller',
        { phone: customerPhone, partialAddress: address, partialType: propertyType, reason: 'bot_collection_failed', canAssignToAgent: true },
      );
      return;
    }

    if (!address && !propertyType) {
      await updateChatState(leadId, 'COLLECTING_SELLER_INFO', {
        pendingSellerAddress: address,
        pendingSellerType:    propertyType,
        sellerInfoAttempts:   attempts,
      });
      await sendBotMessage(
        integration, customerPhone, leadId,
        `לא הצלחתי לזהות את הפרטים.\nאנא ציין את *כתובת הנכס* וה*סוג* שלו — לדוגמה: "דירה ברחוב הרצל 5, תל אביב"`,
      );
      return;
    }

    if (incomplete) {
      await updateChatState(leadId, 'COLLECTING_SELLER_INFO', {
        pendingSellerAddress: address,
        pendingSellerType:    propertyType,
        sellerInfoAttempts:   attempts,
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
    if (!timePreference) {
      await sendBotMessage(
        integration, customerPhone, leadId,
        'לא הצלחתי להבין את הזמן המבוקש.\nציין בבקשה יום ושעה — לדוגמה: "מחר ב-10:00" או "יום שני אחה"צ".',
      );
      return;
    }
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
      const summary = await generateConversationSummary('seller', [], { address, propertyType }, geminiApiKey);
      await notifyAgentOrAdmin(
        adminPhone,
        `🏠 *מוכר חדש — מהבוט*\nשם: ${leadName}\nטלפון: ${customerPhone}\nנכס: ${propertyType} ב${address}\nזמן מועדף לשיחה: *${timePreference}*\n📝 סיכום: ${summary}`,
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
  resendApiKey?:   string,
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

    // CLOSED state — 24h lock after catalog was sent
    const bypassPhone = process.env.BYPASS_PHONE ?? '';
    if (currentState === 'CLOSED') {
      if (bypassPhone !== '' && customerPhone === bypassPhone) {
        // Silent pass — no AI invoked, no tokens spent, just log
        console.log(`[WeBot] ✅ Bypass phone in CLOSED state — skipping AI`);
        return;
      }
      const closedAt = storedChatState.closedAt ?? storedChatState.lastStateAt;
      if ((Date.now() - closedAt) < 24 * 60 * 60 * 1000) {
        console.log(`[WeBot] 🔒 CLOSED lock active for lead ${leadId} — ignoring message`);
        return; // Silent ignore
      }
      // 24h passed — reopen
      currentState = 'IDLE';
      await updateChatState(leadId, 'IDLE');
    }

    // Daily AI usage limit — prevent token abuse
    const today = new Date().toISOString().split('T')[0];
    const dailyCount = leadData.lastMessageDate === today ? (leadData.dailyMessageCount ?? 0) : 0;

    if (dailyCount >= 10) {
      console.log(`[WeBot] 🛑 Lead ${leadId} reached daily AI limit (${dailyCount}/10) — skipping`);
      return;
    }

    // Suspected bot alert at 50 messages
    if (dailyCount === 49) {
      const adminPhone = await findAdminPhone(agencyId);
      const alertMsg = `⚠️ *התראת אבטחה*\nהמספר ${customerPhone} שלח מעל 50 הודעות היום. חשד לבוט.`;
      if (adminPhone) await notifyAgentOrAdmin(adminPhone, alertMsg, greenApiCreds);
      if (bypassPhone) await notifyAgentOrAdmin(bypassPhone, alertMsg, greenApiCreds);
    }

    // Increment daily counter (reset if new day) — fire-and-forget; the
    // value isn't read again in this handler, so blocking on it is wasted.
    db.collection('leads').doc(leadId).update({
      dailyMessageCount: leadData.lastMessageDate === today
        ? admin.firestore.FieldValue.increment(1)
        : 1,
      lastMessageDate: today,
    }).catch((e) => console.warn('[WeBot] dailyMessageCount update failed:', e?.message));

    if (isStale && currentState !== 'IDLE') {
      console.log(`[WeBot] State stale (>24h) for lead ${leadId} — resetting to IDLE`);
      currentState = 'IDLE';
      await updateChatState(leadId, 'IDLE');
    }

    // 5. Name collection: ask name on first bot interaction (regardless of WhatsApp display name)
    if (currentState === 'COLLECTING_NAME') {
      const candidate = incomingMessage.trim().substring(0, 50);
      // Accept ≤ 3 words of Hebrew/Latin letters (with hyphen/apostrophe) —
      // and reject any candidate containing real-estate intent keywords, which
      // would otherwise let "אני מחפש דירה לקנות" slip through as a name.
      const wordCount = candidate.split(/\s+/).filter(Boolean).length;
      const intentKeywords = /(מחפש|מעוניין|מתעניין|לקנות|לשכור|למכור|דירה|נכס|לפרסם|להשכיר|קונה|שוכר)/;
      const looksLikeName =
        /^[֐-׿a-zA-Z]{2,}(?:[\s'\-][֐-׿a-zA-Z]+){0,2}$/.test(candidate)
        && wordCount <= 3
        && !intentKeywords.test(candidate);
      const name = looksLikeName ? candidate : 'לקוח';
      await db.collection('leads').doc(leadId).update({ name, botNameCollected: true });

      // If name was asked in response to a property inquiry, move directly to
      // scheduling and offer real free slots from the Office Manager's calendar.
      if (storedChatState.pendingIntent === 'buyer') {
        await updateChatState(leadId, 'SCHEDULING_CALL');

        let schedulingMsg = `נעים להכיר, ${name}!\n`;
        try {
          const officeManagerId = await getOfficeManagerUserId(agencyId);
          if (officeManagerId) {
            const windowStart = new Date();
            const windowEnd   = new Date(windowStart.getTime() + 3 * 24 * 60 * 60 * 1000);
            const busySlots   = await queryFreeBusy(officeManagerId, windowStart.toISOString(), windowEnd.toISOString());
            const freeSlots   = findFreeSlots(busySlots, windowStart, windowEnd);
            if (freeSlots.length > 0) {
              schedulingMsg += `${formatSlotHebrew(freeSlots[0])} יהיה לך נוח לשיחה עם יועץ נדל"ן שלנו?\nאם לא, תכתוב מתי אפשרי.`;
            } else {
              schedulingMsg += 'מתי נוח לך לשיחה קצרה עם יועץ נדל"ן שלנו?';
            }
          } else {
            schedulingMsg += 'מתי נוח לך לשיחה קצרה עם יועץ נדל"ן שלנו?';
          }
        } catch (calErr) {
          console.warn('[WeBot] freebusy after name collection failed (non-fatal):', calErr);
          schedulingMsg += 'מתי נוח לך לשיחה קצרה עם יועץ נדל"ן שלנו?';
        }

        await sendBotMessage(integration, customerPhone, leadId, schedulingMsg);
        return;
      }

      await updateChatState(leadId, 'IDLE');
      await sendBotMessage(
        integration, customerPhone, leadId,
        `נעים להכיר, ${name}.\nאיך אוכל לעזור לך?\n\nמחפש/ת דירה לקנות או לשכור? או\n\nלמכור נכס?`,
      );
      return;
    }

    if (currentState === 'IDLE' && !leadData.botNameCollected) {
      const agencyDisplayName = agencyData.agencyName || agencyData.name || 'הסוכנות שלנו';

      // Classify intent so property inquiries get a tailored teaser before we ask for the name.
      const firstIntent = await classifyIntent(incomingMessage, 'new', geminiApiKey);

      if (firstIntent === 'buyer') {
        // Load a few active properties for teaser context
        const teaserPropSnap = await db
          .collection('agencies').doc(agencyId).collection('properties')
          .where('status', '==', 'active')
          .limit(3)
          .get();
        const teaserProps = teaserPropSnap.docs.map(d => {
          const pd = d.data();
          return {
            type: pd.propertyType || 'נכס',
            city: pd.address?.city || '',
            rooms: pd.rooms ?? null,
            price: pd.financials?.price ?? null,
          };
        });

        const teaser = await generatePropertyTeaser(incomingMessage, teaserProps, geminiApiKey);
        await updateChatState(leadId, 'COLLECTING_NAME', { pendingIntent: 'buyer' });
        await sendBotMessage(
          integration, customerPhone, leadId,
          `${teaser}\n\nכדי לחבר אותך עם המתווך שלנו, מה שמך?`,
        );
      } else {
        await updateChatState(leadId, 'COLLECTING_NAME');
        await sendBotMessage(
          integration, customerPhone, leadId,
          `שלום, אני הנציג הדיגיטלי של ${agencyDisplayName}.\nאשמח לעזור לך לקנות, לשכור או למכור דירה.\nמה שמך?`,
        );
      }
      return;
    }

    // 6. Route by state
    if (currentState === 'IDLE') {
      let intent = await classifyIntent(incomingMessage, leadData.type || 'new', geminiApiKey, leadData.status, currentState);
      console.log(`[WeBot] Intent=${intent} for lead ${leadId}`);

      // Anti-flip-flop guard: a confirmed buyer/seller is NOT switched to the
      // opposite type on a short, ambiguous message. Without this, a seller
      // returning with "היי" or "תודה" could get reclassified to buyer and
      // start the wrong flow. We only flip on substantive messages: ≥ 4 words
      // OR a clear directional verb.
      const wordCount = incomingMessage.trim().split(/\s+/).filter(Boolean).length;
      const hasDirectionalVerb = /(למכור|לקנות|לשכור|מחפש|מתעניין|לפרסם|להשכיר|בעל\s+נכס|נכס\s+שלי|דירה\s+שלי)/.test(incomingMessage);
      const isAmbiguous = wordCount < 4 && !hasDirectionalVerb;
      const isFlip = leadData.type && intent !== 'irrelevant' && intent !== leadData.type;
      if (isFlip && isAmbiguous) {
        console.log(`[WeBot] 🛡️ Anti-flip-flop: ignoring ${intent} for type=${leadData.type} on ambiguous "${incomingMessage.substring(0, 30)}"`);
        intent = 'irrelevant';
      }

      if (intent === 'irrelevant') {
        // Greetings & ambiguous one-liners ("היי", "שלום", "מה קורה") get a
        // friendly menu instead of dead silence. True spam (long, repeated,
        // off-topic) gets ignored after the first nudge.
        const trimmed = incomingMessage.trim();
        const looksLikeGreeting = trimmed.length <= 30;
        const lastNudgeAt: number = leadData.lastIrrelevantNudgeAt || 0;
        const recentlyNudged = Date.now() - lastNudgeAt < 6 * 60 * 60 * 1000; // 6h

        if (looksLikeGreeting && !recentlyNudged) {
          const name = leadData.name && leadData.name !== 'לקוח' && leadData.name !== 'ליד מוואטסאפ (לא ידוע)'
            ? leadData.name : '';
          const greeting = name ? `שלום ${name},` : 'שלום,';

          // Reference prior interest when we have it — so a returning buyer
          // who already told us city/rooms/budget doesn't get re-asked from
          // scratch. Falls back to the generic menu otherwise.
          const reqs = leadData.requirements || {};
          const reqSummaryParts = [
            Array.isArray(reqs.desiredCity)          && reqs.desiredCity.length          ? reqs.desiredCity.join(', ')                     : null,
            Array.isArray(reqs.desiredNeighborhoods) && reqs.desiredNeighborhoods.length ? `שכונה ${reqs.desiredNeighborhoods.join(', ')}`  : null,
            Array.isArray(reqs.desiredStreet)        && reqs.desiredStreet.length        ? `רחוב ${reqs.desiredStreet.join(', ')}`          : null,
            reqs.minRooms ? `${reqs.minRooms} חדרים` : null,
            reqs.maxBudget ? `תקציב עד ₪${Number(reqs.maxBudget).toLocaleString('he-IL')}` : null,
          ].filter(Boolean);
          const reqSummary = reqSummaryParts.join(' | ');

          let body: string;
          if (leadData.type === 'seller') {
            const sellerAddress = leadData.sellerInfo?.address;
            const sellerType    = leadData.sellerInfo?.propertyType;
            const sellerSummary = [sellerType, sellerAddress].filter(Boolean).join(' ב');
            body = sellerSummary
              ? `כיף שחזרת. ראיתי שבעבר התעניינת במכירת ${sellerSummary}. רוצה שנתקדם עם זה, או שמשהו אחר?`
              : `כיף שחזרת. רוצה להתקדם עם מכירת הנכס שלך, או שמשהו אחר?`;
          } else if (reqSummary) {
            body = `כיף שחזרת. ראיתי שבעבר התעניינת ב-${reqSummary}.\nרוצה שאעדכן אותך בנכסים חדשים שמתאימים, או שמחפש משהו אחר?`;
          } else {
            body = `כיף שחזרת. איך אוכל לעזור?\n\n• מחפש/ת דירה לקנות או לשכור?\n• רוצה למכור את הדירה שלך?`;
          }

          await sendBotMessage(
            integration, customerPhone, leadId,
            `${greeting} ${body}`,
          );
          await db.collection('leads').doc(leadId).update({ lastIrrelevantNudgeAt: Date.now() });
          return;
        }

        // Real spam / repeated noise → silent CRM log only.
        if (leadData.source) {
          await createCRMNotification(
            agencyId, leadId, leadData.name || customerPhone,
            'new_buyer_inquiry', 'assign_agent',
            { phone: customerPhone, note: 'הודעה לא רלוונטית מליד קיים', message: incomingMessage },
          );
        }
        return;
      }

      // Persist the classified type immediately so the lead is registered
      // as buyer/seller even if the conversation stalls before requirements
      // are collected or the seller flow completes.
      if (intent === 'seller') {
        if (leadData.type !== 'seller') {
          await db.collection('leads').doc(leadId).update({
            type: 'seller',
            status: leadData.status && leadData.status !== 'new' ? leadData.status : 'potential_seller',
          });
          leadData.type = 'seller';
        }
        await runSellerFlow(
          agencyId, leadId, customerPhone, incomingMessage,
          geminiApiKey, leadData, integration, 'IDLE',
          storedChatState, greenApiCreds,
        );
        return;
      }

      // buyer (default)
      if (leadData.type !== 'buyer') {
        await db.collection('leads').doc(leadId).update({
          type: 'buyer',
          status: leadData.status && leadData.status !== 'new' ? leadData.status : 'searching',
        });
        leadData.type = 'buyer';
      }
      await runBuyerFlow(
        agencyId, leadId, customerPhone, incomingMessage,
        geminiApiKey, agencyData, leadData, integration,
        currentMsgDocId, greenApiCreds, currentState, resendApiKey,
      );
      return;
    }

    // Mid-flow override: if the customer pivots to a different topic
    // ("אני מחפש דירה לקנות" while we're in COLLECTING_SELLER_INFO, or
    // "רוצה למכור את הדירה שלי" while in COLLECTING_REQS), don't keep
    // re-asking the previous question. Re-classify the new message — if
    // Gemini sees a clear *opposite* intent, reset to IDLE and route fresh.
    const inBuyerFlow  = currentState === 'COLLECTING_REQS' || currentState === 'SCHEDULING_CALL';
    const inSellerFlow = currentState === 'COLLECTING_SELLER_INFO' || currentState === 'SCHEDULING_SELLER_CALL';

    if (inBuyerFlow || inSellerFlow) {
      // Pass leadType='new' to force a fresh Gemini classification (skip the
      // state-continuity short-circuits in classifyIntent).
      const freshIntent = await classifyIntent(incomingMessage, 'new', geminiApiKey, undefined, 'IDLE');
      const wantsBuyer  = freshIntent === 'buyer'  && inSellerFlow;
      const wantsSeller = freshIntent === 'seller' && inBuyerFlow;

      if (wantsBuyer || wantsSeller) {
        console.log(`[WeBot] 🔀 Topic pivot detected: state=${currentState} → intent=${freshIntent} for lead ${leadId}`);
        // Reset state and re-route through the IDLE path with the new intent.
        await updateChatState(leadId, 'IDLE');
        if (wantsSeller) {
          if (leadData.type !== 'seller') {
            await db.collection('leads').doc(leadId).update({
              type: 'seller',
              status: leadData.status && leadData.status !== 'new' ? leadData.status : 'potential_seller',
            });
            leadData.type = 'seller';
          }
          await runSellerFlow(
            agencyId, leadId, customerPhone, incomingMessage,
            geminiApiKey, leadData, integration, 'IDLE',
            { state: 'IDLE', lastStateAt: Date.now() }, greenApiCreds,
          );
        } else {
          if (leadData.type !== 'buyer') {
            await db.collection('leads').doc(leadId).update({
              type: 'buyer',
              status: leadData.status && leadData.status !== 'new' ? leadData.status : 'searching',
            });
            leadData.type = 'buyer';
          }
          await runBuyerFlow(
            agencyId, leadId, customerPhone, incomingMessage,
            geminiApiKey, agencyData, leadData, integration,
            currentMsgDocId, greenApiCreds, 'IDLE', resendApiKey,
          );
        }
        return;
      }
    }

    if (inBuyerFlow) {
      await runBuyerFlow(
        agencyId, leadId, customerPhone, incomingMessage,
        geminiApiKey, agencyData, leadData, integration,
        currentMsgDocId, greenApiCreds, currentState, resendApiKey,
      );
      return;
    }

    if (inSellerFlow) {
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
