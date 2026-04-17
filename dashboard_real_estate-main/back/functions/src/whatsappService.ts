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

export function buildWeBotPrompt(config: BotConfig, properties: Property[], agencyName = 'הסוכנות שלנו'): string {
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

  return `אתה הנציג הוירטואלי של סוכנות הנדל"ן "${agencyName}". אתה משרת לקוחות שמחפשים לקנות, לשכור, או למכור נכס — לא סוכנים.

=== ברכת פתיחה ===
כשלקוח מתחיל שיחה (אומר "היי", "שלום", "בוקר טוב" וכדומה), הצג את עצמך: "היי! אני הנציג הוירטואלי של ${agencyName}. אוכל לעזור לך למצוא נכס לקנייה או שכירות, או לשווק את הנכס שלך. במה תרצה שאעזור לך?"

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

=== תהליך עבודה עם לקוח חדש ===
עקוב אחרי השלבים הבאים לפי סדר:

שלב 1 — הבנת הצורך:
  ⚠️ אם הלקוח כבר סיפק בהודעתו עיר + תקציב, או עיר + חדרים, או עיר + סוג (קנייה/שכירות) — אל תשאל שאלות נוספות. עבור ישירות לשלב 2 ואז לשלב 3.
  רק אם חסר מידע בסיסי, שאל שאלה אחת בלבד בכל פעם, לפי הסדר:
  א. איזה עיר / אזור מחפשים? (חובה)
  ב. מה התקציב? (קנייה / שכירות)
  ג. כמה חדרים?
  ד. קנייה או שכירות?

שלב 2 — שמירת הדרישות:
  ברגע שיש לך לפחות עיר אחת ועוד פרמטר אחד (תקציב / חדרים / סוג),
  קרא ל-update_lead_requirements עם כל המידע שאספת.

שלב 3 — שליחת קטלוג:
  מיד לאחר שמירת הדרישות, קרא ל-create_catalog.
  המערכת תמצא את הנכסים המתאימים ביותר ותחזיר לך קישור — שלח אותו ללקוח.
  לאחר שליחת הקטלוג, שאל אם יש עוד משהו שתוכל לעזור, או אם הלקוח רוצה לקבוע שיחה עם יועץ נדל"ן.

שלב 4 — קביעת פגישה:
  אם הלקוח מתעניין בנכס ספציפי, קרא ל-schedule_meeting עם מועד שמוסכם עליו.

=== מאגר הנכסים הפעילים (RAG Context) ===
השתמש בנכסים הבאים לתשובות ישירות בשיחה בלבד (לא לבחירה ידנית לקטלוג — הקטלוג נוצר אוטומטית):
${propertiesText}`;
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

// ─── 4. Create Shared Catalog ─────────────────────────────────────────────────

export async function createSharedCatalog(
  db: admin.firestore.Firestore,
  agencyId: string,
  agencyData: admin.firestore.DocumentData,
  leadId: string,
  leadName: string,
  propertyIds: string[]
): Promise<string> {
  const catalogRef = db.collection('shared_catalogs').doc();

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(now.getDate() + 7); // 7-day expiry

  await catalogRef.set({
      agencyId,
      agencyName: agencyData.agencyName || agencyData.name || '',
      agencyLogoUrl: agencyData.settings?.logoUrl || '',
      agencyPhone: agencyData.officePhone || agencyData.whatsappIntegration?.phoneNumber || '',
      leadId,
      leadName,
      propertyIds,
      source: 'whatsapp_ai_bot',
      viewCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
  });

  console.log(`[AI Bot] Catalog created: ${catalogRef.id} with ${propertyIds.length} properties`);
  return `https://homer.management/catalog/${catalogRef.id}`;
}

async function writeSystemError(db: FirebaseFirestore.Firestore, leadId: string, text: string) {
  try {
    await db.collection(`leads/${leadId}/messages`).add({
      idMessage: `sys-err-${Date.now()}`,
      text,
      direction: 'system',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: true,
      source: 'system_error'
    });
  } catch (err: any) {
    console.error(`Failed to write system error to Firestore: ${err.message}`);
  }
}

/**
 * ─── 4. Sync Chat History ──────────────────────────────────────────────────
 * Fetches the last N messages from Green API and persists them to Firestore.
 * Contains detailed diagnostic logging to identify payment/quota/API issues.
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

    console.log(`[History Sync] 🔄 Starting for lead=${leadId} phone=${phone} chatId=${chatId} instance=${keys.idInstance} count=${count}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, count }),
    });

    // ── Detailed HTTP error handling ──────────────────────────────────────
    if (!res.ok) {
      let responseText = '';
      try { responseText = await res.text(); } catch (_) {}

      const errMsg401 = `🚨 שגיאת התחברות ל-Green API (שגיאה ${res.status}): הטוקן פג תוקף או שגוי. יש להתחבר מחדש בהגדרות המערכת.`;
      const errMsg402 = `🚨 התראת תשלום (שגיאה 402): המנוי ב-Green API פג או שנגמרה המכסה. יש להיכנס לאזור האישי ב-Green API ולחדש את המנוי.`;
      const errMsg429 = `🚨 חריגה מכמות הבקשות (429): נשלחו יותר מדי בקשות ל-Green API בזמן קצר. הסנכרון יתחדש בקרוב.`;
      const errMsg466 = `🚨 חריגה ממכסת שותפים (466): הגעת למקסימום המותר במנוי Green API הנוכחי. יש לשדרג או לחדש תשלום.`;

      if (res.status === 401 || res.status === 403) {
        console.error(`[History Sync] ❌ AUTH ERROR (${res.status}) - Token invalid or expired for instance ${keys.idInstance}. Response: ${responseText}`);
        await writeSystemError(db, leadId, errMsg401);
      } else if (res.status === 402) {
        console.error(`[History Sync] ❌ PAYMENT REQUIRED (402) - Green API subscription expired for instance ${keys.idInstance}. Check billing at https://green-api.com`);
        await writeSystemError(db, leadId, errMsg402);
      } else if (res.status === 429) {
        console.error(`[History Sync] ❌ RATE LIMIT (429) - Too many requests to Green API. Response: ${responseText}`);
        await writeSystemError(db, leadId, errMsg429);
      } else if (res.status === 466) {
        console.error(`[History Sync] ❌ QUOTA EXCEEDED (466) - Partner quota limit reached for instance ${keys.idInstance}. Upgrade your Green API plan.`);
        await writeSystemError(db, leadId, errMsg466);
      } else {
        console.error(`[History Sync] ❌ HTTP ${res.status} from Green API for instance ${keys.idInstance}. Body: ${responseText}`);
        await writeSystemError(db, leadId, `🚨 שגיאה ${res.status} מספק הווצאפ: לא ניתן לסנכרן הודעות ברגע זה.`);
      }
      return;
    }

    // ── Parse response ────────────────────────────────────────────────────
    let history: any[];
    try {
      history = await res.json();
    } catch (parseErr) {
      console.error(`[History Sync] ❌ JSON parse error for lead ${leadId}: ${parseErr}`);
      return;
    }

    if (!Array.isArray(history)) {
      console.error(`[History Sync] ❌ Non-array response for lead ${leadId}. Got: ${JSON.stringify(history).substring(0, 300)}`);
      return;
    }

    console.log(`[History Sync] ✅ Green API returned ${history.length} messages for lead ${leadId} (chatId=${chatId})`);

    if (history.length === 0) {
      console.log(`[History Sync] ℹ️ Empty history for chatId=${chatId}. Chat may be new or phone number format may not match what Green API has stored.`);
      return;
    }

    // ── Save to Firestore ─────────────────────────────────────────────────
    const msgsRef = db.collection(`leads/${leadId}/messages`);
    let saved = 0;
    let skipped = 0;
    let errored = 0;

    for (const msg of history) {
      if (msg.type !== 'outgoing' && msg.type !== 'incoming') {
        console.log(`[History Sync] ⏭️ Skipping msg type="${msg.type}" idMessage=${msg.idMessage}`);
        continue;
      }
      const msgId = msg.idMessage;
      if (!msgId) {
        console.log(`[History Sync] ⏭️ Skipping msg with no idMessage. Raw: ${JSON.stringify(msg).substring(0, 100)}`);
        continue;
      }

      // Idempotency check
      const dup = await msgsRef.where('idMessage', '==', msgId).limit(1).get();
      if (!dup.empty) {
        skipped++;
        continue;
      }

      let text = msg.textMessage || msg.caption || '';
      if (!text) {
        if (msg.typeMessage === 'imageMessage') text = '[תמונה]';
        else if (msg.typeMessage === 'videoMessage') text = '[סרטון]';
        else if (msg.typeMessage === 'fileMessage') text = '[קובץ]';
        else {
          console.log(`[History Sync] ⏭️ Skipping unsupported typeMessage="${msg.typeMessage}" idMessage=${msgId}`);
          continue;
        }
      }

      try {
        await msgsRef.add({
          idMessage: msgId,
          text,
          direction: msg.type === 'outgoing' ? 'outbound' : 'inbound',
          senderPhone: msg.senderId?.replace('@c.us', '') || '',
          timestamp: admin.firestore.Timestamp.fromMillis(msg.timestamp * 1000),
          isRead: true,
          source: 'whatsapp_history_sync'
        });
        saved++;
      } catch (saveErr: any) {
        console.error(`[History Sync] ❌ Firestore save failed for msgId=${msgId}: ${saveErr.message}`);
        errored++;
      }
    }

    console.log(`[History Sync] ✅ Done for lead=${leadId} | saved=${saved} skipped=${skipped} errors=${errored} total=${history.length}`);

  } catch (err: any) {
    console.error(`[History Sync] ❌ Fatal error for lead=${leadId}: ${err.message}`, err.stack);
  }
}
