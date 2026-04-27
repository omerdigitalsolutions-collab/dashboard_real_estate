"use strict";
/**
 * ─── WhatsApp Service Utilities ──────────────────────────────────────────────
 *
 * Stateless helpers used by the WeBot pipeline:
 *   - Type definitions (BotConfig, WhatsappIntegration, Property)
 *   - buildWeBotPrompt  → dynamic Gemini system prompt
 *   - formatPhoneForGreenAPI → phone normalisation
 *   - sendWhatsAppMessage   → Green API send wrapper
 *
 * NOTE: properties are stored in the agencies/{agencyId}/properties subcollection.
 * leads remain in a flat top-level collection filtered by agencyId.
 * Keep all Firestore paths in webhookWhatsAppAI.ts, NOT here.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWeBotPrompt = buildWeBotPrompt;
exports.formatPhoneForGreenAPI = formatPhoneForGreenAPI;
exports.sendWhatsAppMessage = sendWhatsAppMessage;
exports.createSharedCatalog = createSharedCatalog;
exports.syncChatHistory = syncChatHistory;
const admin = __importStar(require("firebase-admin"));
// ─── 1. Prompt Builder ────────────────────────────────────────────────────────
const TONE_MAP = {
    professional: 'ענה בצורה מקצועית, ענייניית וממוקדת. אל תשתמש באימוג׳ים של חיוכים. ניתן להשתמש רק באימוג׳ים פונקציונליים (📍🏠✅) כשהם מוסיפים בהירות.',
    friendly_emoji: "ענה בצורה קלילה, חברית, בגובה העיניים, ושלב אימוג'ים רלוונטיים.",
    direct_sales: 'ענה בצורה קצרה, ממוקדת ומכירתית. הוביל לקביעת פגישה. אל תרחיב מעל הנדרש.',
};
const FALLBACK_MAP = {
    human_handoff: 'התנצל בנימוס והסבר שסוכן אנושי יחזור אליו בהקדם.',
    collect_details: 'בקש מהלקוח לפרט קצת יותר: אזור, חדרים ותקציב, כדי שנוכל לעזור.',
};
function buildWeBotPrompt(config, properties, agencyName = 'הסוכנות שלנו') {
    var _a, _b, _c;
    let toneText = (_a = TONE_MAP[config.tone]) !== null && _a !== void 0 ? _a : TONE_MAP.professional;
    if (config.tone === 'custom' && config.customTone) {
        toneText = config.customTone;
    }
    let fallbackText = (_b = FALLBACK_MAP[config.fallbackAction]) !== null && _b !== void 0 ? _b : FALLBACK_MAP.human_handoff;
    if (config.fallbackAction === 'custom' && config.customFallbackAction) {
        fallbackText = config.customFallbackAction;
    }
    const propertiesText = properties.length > 0
        ? properties.map(p => `- [מזהה: ${p.id}]${p.isExclusive ? ' [exclusive]' : ''} ${p.title} ב${p.address}, ${p.city}` +
            ` | ${p.rooms} חדרים | מחיר: ₪${p.price.toLocaleString('he-IL')}` +
            (p.description ? ` | ${p.description}` : '')).join('\n')
        : 'כרגע אין נכסים זמינים במאגר.';
    return `אתה הבוט החכם של סוכנות הנדל"ן "${agencyName}". אתה משרת לקוחות שמחפשים לקנות, לשכור, או למכור נכס — לא סוכנים.

=== מטרה ===
המטרה שלך היא אחת: לשלוח ללקוח קטלוג נכסים מותאם אישית, ולאחר מכן לתאם שיחת ייעוץ עם יועץ נדל"ן. כל שאר הפעולות (שאלות, הסברים) הן רק אמצעי להגיע למטרה זו.

=== חוקי ברזל ===
1. אל תמציא נכסים, מחירים או פרטים. הסתמך רק על הנכסים המצורפים מטה.
2. אינך רשאי להבטיח הבטחות משפטיות, הנחות או חוזים.
3. סודיות מוחלטת: אל תחשוף נתוני הכנסות, עמלות, שמות סוכנים, או פרטי קשר של בעלי נכסים.
4. הצג רק עיר ושכונה — לא מספר בית מדויק לפני שלקוח מגיע למשרד.
5. השתמש תמיד בעברית טבעית ותקנית.

=== אישיות הבוט ===
- סגנון דיבור: ${toneText}
- כאשר אינך יודע תשובה או הנכס לא קיים במאגר: ${fallbackText}
- הנחיות ספציפיות מהמשרד: ${((_c = config.generalNotes) === null || _c === void 0 ? void 0 : _c.trim()) || 'אין הנחיות נוספות.'}

=== תהליך עבודה עם לקוח ===
עקוב אחרי השלבים הבאים לפי סדר:

שלב 1 — הבנת הצורך:
  ⚠️ אם הלקוח סיפק לפחות פרמטר אחד (חדרים / תקציב / סוג נכס / שכונה / עיר) — אל תשאל שאלות נוספות על פרמטרים חסרים.
  במקום זאת: שאל שאלה אחת בלבד — "יש עוד פרטים שחשוב לי לדעת לפני שאמצא לך נכסים מתאימים?" — ואז עבור לשלב 2 ללא קשר לתשובה.
  עיר אינה חובה — הבוט מחפש בכל נכסי הסוכנות. אל תשאל "באיזה עיר?" אם הלקוח לא ציין עיר.

שלב 2 — שמירת הדרישות:
  קרא ל-update_lead_requirements עם כל המידע שאספת (חדרים, תקציב, סוג, עיר אם צוינה).
  אין צורך בעיר כדי לקרוא לפונקציה זו.

שלב 3 — שליחת קטלוג:
  מיד לאחר שמירת הדרישות, קרא ל-create_catalog.
  הפונקציה תחזיר אובייקט JSON עם שדה url — אתה חייב לכלול את הקישור הזה מילה במילה בהודעתך ללקוח.
  לדוגמה: "הכנתי עבורך קטלוג נכסים מותאם אישית: https://homer.management/catalog/..."
  לאחר שליחת הקטלוג, שאל מתי נוח ללקוח לשיחת ייעוץ עם יועץ נדל"ן.

שלב 4 — תיאום שיחת ייעוץ:
  זהו השלב הסופי והחשוב ביותר. אם הלקוח מעוניין — שאל מה התאריך והשעה המועדפים ואז קרא ל-schedule_meeting.
  ניתן לקבוע שיחת ייעוץ גם ללא נכס ספציפי (שיחת טלפון ראשונית).
  אל תסיים שיחה מבלי לנסות לתאם שיחת ייעוץ.

=== שאלות ישירות על נכסים ===
אם הלקוח שואל שאלה ישירה על נכס ספציפי (מחיר, חדרים, קומה, שטח, שכונה וכדומה):
1. ענה ישירות מרשימת הנכסים המצורפת מטה. אל תאמר "אין לי מידע" אם הנכס קיים ברשימה.
2. כל נכס ברשימה מסומן ב־[מזהה: ...]. אם ענית על שאלה לגבי נכס *בלעדי* (מסומן בתיאור או שמופיע "exclusive"), קרא לפונקציה notify_assigned_agent עם המזהה כדי שהסוכן האחראי יקבל התראה. אל תזכיר ללקוח את המזהה.
3. אם הנכס שהלקוח שאל עליו לא נמצא ברשימה — אמור שתבדוק עם סוכן ושב לבקש פרטים (עיר/חדרים/תקציב) כדי שתוכל להציג קטלוג מותאם.

=== מאגר הנכסים הפעילים (RAG Context) ===
השתמש בנכסים הבאים לתשובות ישירות בשיחה בלבד (לא לבחירה ידנית לקטלוג — הקטלוג נוצר אוטומטית):
${propertiesText}`;
}
// ─── 2. Phone Normaliser ──────────────────────────────────────────────────────
/**
 * Converts Israeli phone to Green API chatId format.
 * "0501234567" → "972501234567@c.us"
 */
function formatPhoneForGreenAPI(phone) {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0'))
        clean = '972' + clean.substring(1);
    if (!clean.endsWith('@c.us'))
        clean += '@c.us';
    return clean;
}
// ─── 3. Send via Green API ────────────────────────────────────────────────────
/**
 * Sends a WhatsApp message via Green API.
 * Uses native fetch (Node 18+) to avoid extra axios dependency here.
 * Returns true if the message was accepted by the API.
 */
async function sendWhatsAppMessage(integration, customerPhone, messageText) {
    if (!(integration === null || integration === void 0 ? void 0 : integration.idInstance) || !(integration === null || integration === void 0 ? void 0 : integration.apiTokenInstance) || !messageText)
        return false;
    const chatId = formatPhoneForGreenAPI(customerPhone);
    const url = `https://7105.api.greenapi.com/waInstance${integration.idInstance}/sendMessage/${integration.apiTokenInstance}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message: messageText }),
            signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        return res.ok && !!data.idMessage;
    }
    catch (err) {
        console.error('[Green API] sendWhatsAppMessage failed:', err);
        return false;
    }
}
// ─── 4. Create Shared Catalog ─────────────────────────────────────────────────
async function createSharedCatalog(db, agencyId, agencyData, leadId, leadName, propertyIds) {
    var _a, _b;
    const catalogRef = db.collection('shared_catalogs').doc();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(now.getDate() + 7); // 7-day expiry
    await catalogRef.set({
        agencyId,
        agencyName: agencyData.agencyName || agencyData.name || '',
        agencyLogoUrl: ((_a = agencyData.settings) === null || _a === void 0 ? void 0 : _a.logoUrl) || '',
        agencyPhone: agencyData.officePhone || ((_b = agencyData.whatsappIntegration) === null || _b === void 0 ? void 0 : _b.phoneNumber) || '',
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
async function writeSystemError(db, leadId, text) {
    try {
        await db.collection(`leads/${leadId}/messages`).add({
            idMessage: `sys-err-${Date.now()}`,
            text,
            direction: 'system',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isRead: true,
            source: 'system_error'
        });
    }
    catch (err) {
        console.error(`Failed to write system error to Firestore: ${err.message}`);
    }
}
/**
 * ─── 4. Sync Chat History ──────────────────────────────────────────────────
 * Fetches the last N messages from Green API and persists them to Firestore.
 * Contains detailed diagnostic logging to identify payment/quota/API issues.
 */
async function syncChatHistory(db, agencyId, leadId, phone, keys, count = 10) {
    var _a;
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
            try {
                responseText = await res.text();
            }
            catch (_) { }
            const errMsg401 = `🚨 שגיאת התחברות ל-Green API (שגיאה ${res.status}): הטוקן פג תוקף או שגוי. יש להתחבר מחדש בהגדרות המערכת.`;
            const errMsg402 = `🚨 התראת תשלום (שגיאה 402): המנוי ב-Green API פג או שנגמרה המכסה. יש להיכנס לאזור האישי ב-Green API ולחדש את המנוי.`;
            const errMsg429 = `🚨 חריגה מכמות הבקשות (429): נשלחו יותר מדי בקשות ל-Green API בזמן קצר. הסנכרון יתחדש בקרוב.`;
            const errMsg466 = `🚨 חריגה ממכסת שותפים (466): הגעת למקסימום המותר במנוי Green API הנוכחי. יש לשדרג או לחדש תשלום.`;
            if (res.status === 401 || res.status === 403) {
                console.error(`[History Sync] ❌ AUTH ERROR (${res.status}) - Token invalid or expired for instance ${keys.idInstance}. Response: ${responseText}`);
                await writeSystemError(db, leadId, errMsg401);
            }
            else if (res.status === 402) {
                console.error(`[History Sync] ❌ PAYMENT REQUIRED (402) - Green API subscription expired for instance ${keys.idInstance}. Check billing at https://green-api.com`);
                await writeSystemError(db, leadId, errMsg402);
            }
            else if (res.status === 429) {
                console.error(`[History Sync] ❌ RATE LIMIT (429) - Too many requests to Green API. Response: ${responseText}`);
                await writeSystemError(db, leadId, errMsg429);
            }
            else if (res.status === 466) {
                console.error(`[History Sync] ❌ QUOTA EXCEEDED (466) - Partner quota limit reached for instance ${keys.idInstance}. Upgrade your Green API plan.`);
                await writeSystemError(db, leadId, errMsg466);
            }
            else {
                console.error(`[History Sync] ❌ HTTP ${res.status} from Green API for instance ${keys.idInstance}. Body: ${responseText}`);
                await writeSystemError(db, leadId, `🚨 שגיאה ${res.status} מספק הווצאפ: לא ניתן לסנכרן הודעות ברגע זה.`);
            }
            return;
        }
        // ── Parse response ────────────────────────────────────────────────────
        let history;
        try {
            history = await res.json();
        }
        catch (parseErr) {
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
                if (msg.typeMessage === 'imageMessage')
                    text = '[תמונה]';
                else if (msg.typeMessage === 'videoMessage')
                    text = '[סרטון]';
                else if (msg.typeMessage === 'fileMessage')
                    text = '[קובץ]';
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
                    senderPhone: ((_a = msg.senderId) === null || _a === void 0 ? void 0 : _a.replace('@c.us', '')) || '',
                    timestamp: admin.firestore.Timestamp.fromMillis(msg.timestamp * 1000),
                    isRead: true,
                    source: 'whatsapp_history_sync'
                });
                saved++;
            }
            catch (saveErr) {
                console.error(`[History Sync] ❌ Firestore save failed for msgId=${msgId}: ${saveErr.message}`);
                errored++;
            }
        }
        console.log(`[History Sync] ✅ Done for lead=${leadId} | saved=${saved} skipped=${skipped} errors=${errored} total=${history.length}`);
    }
    catch (err) {
        console.error(`[History Sync] ❌ Fatal error for lead=${leadId}: ${err.message}`, err.stack);
    }
}
//# sourceMappingURL=whatsappService.js.map