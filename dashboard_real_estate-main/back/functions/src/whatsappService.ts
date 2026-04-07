/**
 * ─── WhatsApp Service Utilities ──────────────────────────────────────────────
 *
 * Stateless helpers used by the WeBot pipeline:
 *   - Type definitions (BotConfig, WhatsappIntegration, Property)
 *   - buildWeBotPrompt  → dynamic Gemini system prompt
 *   - formatPhoneForGreenAPI → phone normalisation
 *   - sendWhatsAppMessage   → Green API send wrapper
 *
 * NOTE: This project uses FLAT Firestore collections (leads, properties) with
 * an `agencyId` field — NOT the multi-tenant sub-collection pattern.
 * Keep all Firestore paths in webhookWhatsAppAI.ts, NOT here.
 */

import * as admin from 'firebase-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotConfig {
  isActive: boolean;
  tone: 'professional' | 'friendly_emoji' | 'direct_sales' | 'custom';
  customTone?: string;
  fallbackAction: 'human_handoff' | 'collect_details' | 'custom';
  customFallbackAction?: string;
  /** Hours the bot stays silenced after a human agent replies (AI Firewall) */
  firewallMuteHours?: number;
  /** Free-text guardrails from the WeBot settings page */
  generalNotes?: string;
}

export interface WhatsappIntegration {
  idInstance: string;
  apiTokenInstance: string;
  isConnected: boolean;
}

export interface Property {
  id: string;
  title: string;
  address: string;
  city: string;
  rooms: number;
  price: number;
  description: string;
}

// ─── 1. Prompt Builder ────────────────────────────────────────────────────────

const TONE_MAP: Record<string, string> = {
  professional:   'ענה בצורה רשמית, מקצועית, אדיבה ומכובדת.',
  friendly_emoji: "ענה בצורה קלילה, חברית, בגובה העיניים, ושלב אימוג'ים רלוונטיים.",
  direct_sales:   'ענה בצורה קצרה, מכירתית, ודחוף בעדינות לקביעת פגישה בנכס.',
};

const FALLBACK_MAP: Record<string, string> = {
  human_handoff:   'התנצל בנימוס והסבר שסוכן אנושי יחזור אליו בהקדם.',
  collect_details: 'בקש מהלקוח לפרט קצת יותר: אזור, חדרים ותקציב, כדי שנוכל לעזור.',
};

export function buildWeBotPrompt(config: BotConfig, properties: Property[]): string {
  let toneText = TONE_MAP[config.tone] ?? TONE_MAP.professional;
  if (config.tone === 'custom' && config.customTone) {
    toneText = config.customTone;
  }
  
  let fallbackText = FALLBACK_MAP[config.fallbackAction] ?? FALLBACK_MAP.human_handoff;
  if (config.fallbackAction === 'custom' && config.customFallbackAction) {
    fallbackText = config.customFallbackAction;
  }

  const propertiesText = properties.length > 0
    ? properties.map(p =>
        `- [מזהה: ${p.id}] ${p.title} ב${p.address}, ${p.city}` +
        ` | ${p.rooms} חדרים | מחיר: ₪${p.price.toLocaleString('he-IL')}` +
        (p.description ? ` | ${p.description}` : '')
      ).join('\n')
    : 'כרגע אין נכסים זמינים במאגר.';

  return `אתה "WeBot", עוזר וירטואלי ונציג אישי של משרד תיווך נדל"ן.

=== חוקי ברזל ===
1. אל תמציא נכסים, מחירים או פרטים. הסתמך רק על הנכסים המצורפים מטה.
2. אינך רשאי להבטיח הבטחות משפטיות, הנחות או חוזים.
3. סודיות מוחלטת: אל תחשוף נתוני הכנסות, עמלות, שמות סוכנים, או פרטי קשר של בעלי נכסים.
4. הצג רק עיר ושכונה — לא מספר בית מדויק לפני שלקוח מגיע למשרד.
5. השתמש תמיד בעברית טבעית ותקנית.

=== אישיות הבוט ===
- סגנון דיבור: ${toneText}
- כאשר אינך יודע תשובה או הנכס לא קיים במאגר: ${fallbackText}
- הנחיות ספציפיות מהמשרד: ${config.generalNotes?.trim() || 'אין הנחיות נוספות.'}

=== מאגר הנכסים הפעילים (RAG Context) ===
השתמש אך ורק בנכסים הבאים:
${propertiesText}

אם הלקוח מביע עניין בנכס, שאל מתי נוח לו להגיע לסיור.
החלף את [CATALOG_URL] עם קישור הקטלוג שיסופק לך בהמשך.`;
}

// ─── 2. Phone Normaliser ──────────────────────────────────────────────────────

/**
 * Converts Israeli phone to Green API chatId format.
 * "0501234567" → "972501234567@c.us"
 */
export function formatPhoneForGreenAPI(phone: string): string {
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  if (!clean.endsWith('@c.us')) clean += '@c.us';
  return clean;
}

// ─── 3. Send via Green API ────────────────────────────────────────────────────

/**
 * Sends a WhatsApp message via Green API.
 * Uses native fetch (Node 18+) to avoid extra axios dependency here.
 * Returns true if the message was accepted by the API.
 */
export async function sendWhatsAppMessage(
  integration: WhatsappIntegration,
  customerPhone: string,
  messageText: string,
): Promise<boolean> {
  if (!integration?.idInstance || !integration?.apiTokenInstance || !messageText) return false;

  const chatId = formatPhoneForGreenAPI(customerPhone);
  const url = `https://7105.api.greenapi.com/waInstance${integration.idInstance}/sendMessage/${integration.apiTokenInstance}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: messageText }),
    });
    const data: any = await res.json();
    return res.ok && !!data.idMessage;
  } catch (err) {
    console.error('[Green API] sendWhatsAppMessage failed:', err);
    return false;
  }
}

/**
 * ─── 4. Sync Chat History ──────────────────────────────────────────────────
 * Fetches the last N messages from Green API and persists them.
 */
export async function syncChatHistory(
  db: FirebaseFirestore.Firestore,
  agencyId: string,
  leadId: string,
  phone: string,
  keys: { idInstance: string; apiTokenInstance: string },
  count = 10
) {
  try {
    const chatId = formatPhoneForGreenAPI(phone);
    const url = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getChatHistory/${keys.apiTokenInstance}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, count }),
    });

    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const history: any[] = await res.json();

    if (!Array.isArray(history)) return;

    const msgsRef = db.collection(`leads/${leadId}/messages`);

    for (const msg of history) {
      if (msg.type !== 'outgoing' && msg.type !== 'incoming') continue;
      const msgId = msg.idMessage;
      if (!msgId) continue;

      const dup = await msgsRef.where('idMessage', '==', msgId).limit(1).get();
      if (!dup.empty) continue;

      let text = msg.textMessage || msg.caption || '';
      if (!text) {
        if (msg.typeMessage === 'imageMessage') text = '[תמונה]';
        else if (msg.typeMessage === 'videoMessage') text = '[סרטון]';
        else if (msg.typeMessage === 'fileMessage') text = '[קובץ]';
        else continue;
      }

      await msgsRef.add({
        idMessage: msgId,
        text,
        direction: msg.type === 'outgoing' ? 'outbound' : 'inbound',
        senderPhone: msg.senderId?.replace('@c.us', '') || '',
        timestamp: admin.firestore.Timestamp.fromMillis(msg.timestamp * 1000),
        isRead: true,
        source: 'whatsapp_history_sync'
      });
    }
    console.log(`[WhatsApp] Sync complete for lead ${leadId} (${history.length} msgs)`);
  } catch (err: any) {
    console.error(`[WhatsApp] syncChatHistory error: ${err.message}`);
  }
}
