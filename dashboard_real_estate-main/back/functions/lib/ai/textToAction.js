"use strict";
/**
 * ─── Text-to-Action AI Agent ──────────────────────────────────────────────────
 *
 * Cloud Function: ai-textToActionAgent
 *
 * Receives a free-text or voice-recording instruction in Hebrew from a real
 * estate agent, extracts structured CRM data via Gemini, validates the output,
 * and either saves a new lead to Firestore or returns a follow-up Hebrew prompt
 * asking for the missing fields.
 *
 * Input (request.data):
 *   { text: string }                          ← plain Hebrew text
 *   { audio: string; mimeType?: string }      ← base64-encoded audio blob
 *                                               (mimeType defaults to audio/webm)
 *
 * Output: TextToActionResult (see interface below)
 *
 * Required Firebase Secret (already provisioned in this project):
 *   GEMINI_API_KEY
 *
 * Security guarantees:
 *   - Firebase Auth + agency membership enforced via validateUserAuth()
 *   - Audio mimeType whitelisted to known audio types
 *   - Audio payload capped at 10 MB (base64 chars)
 *   - Gemini output schema-validated before Firestore write (no passthrough)
 *   - PII (name, phone) redacted in all Cloud Log lines
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.textToActionAgent = void 0;
exports.extractLeadDataFromAudio = extractLeadDataFromAudio;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
const db = (0, firestore_1.getFirestore)();
// ─── Security Constants ───────────────────────────────────────────────────────
/** ~10 MB base64 limit. A 60-second voice note is ~1-2 MB; 10 MB is generous. */
const MAX_AUDIO_BASE64_CHARS = 10 * 1024 * 1024;
/** Only allow real audio file types — prevents Gemini prompt injection via mimeType */
const ALLOWED_AUDIO_MIME_TYPES = new Set([
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/aac',
    'audio/flac',
]);
const VALID_ACTION_TYPES = new Set(['create_lead', 'update_lead', 'unknown']);
const VALID_PROPERTY_TYPES = new Set(['apartment', 'house', 'plot', 'commercial']);
// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `אתה עוזר CRM חכם לסוכן נדל"ן ישראלי.
תפקידך לנתח הודעת קול או טקסט בעברית ולחלץ ממנה נתוני ליד מובנים.

**חוקים:**
1. החזר אך ורק JSON תקף בפורמט הנדרש — ללא markdown, ללא הסברים, ללא שדות נוספים.
2. אם שדה חסר בהודעה, הגדר את ערכו כ-null (לא מחרוזת ריקה, לא "לא ידוע").
3. budget_max יהיה תמיד מספר שלם בשקלים (e.g. "3 מיליון" → 3000000, "1.5M" → 1500000).
4. property_type: "apartment" | "house" | "plot" | "commercial" — תרגם מעברית בהתאם.
   אם לא צוין במפורש אך מוזכרת דירה/נכס, השתמש ב-"apartment".
5. action_type: "create_lead" כאשר מבקשים ליצור ליד חדש,
               "update_lead" כאשר מבקשים לעדכן ליד קיים,
               "unknown" אם הכוונה לא ברורה.
6. transcribed_text: אם הקלט הוא הקלטת קול — כתוב כאן את הטקסט המדויק שנאמר. אם הקלט הוא טקסט — הגדר null.

**פורמט JSON שיש להחזיר (בדיוק — ללא שדות נוספים):**
{
  "action_type": "create_lead" | "update_lead" | "unknown",
  "full_name": string | null,
  "phone_number": string | null,
  "property_type": "apartment" | "house" | "plot" | "commercial",
  "rooms": number | null,
  "budget_max": number | null,
  "preferred_location": string | null,
  "notes": string | null,
  "transcribed_text": string | null
}`;
// ─── Gemini Helpers ───────────────────────────────────────────────────────────
/**
 * Builds the Gemini `contents` parts array.
 * - Text input  → system prompt + user text (single call, no audio upload).
 * - Audio input → system prompt + instruction + inlineData audio part.
 *   Gemini transcribes AND extracts all fields (incl. transcribed_text) in ONE pass —
 *   eliminating the need for a second API call.
 */
function buildContents(input) {
    if ('audio' in input) {
        return [
            { text: SYSTEM_PROMPT },
            {
                text: 'הקלטת הסוכן המצורפת מכילה את ההוראה. תמלל אותה ב-transcribed_text ולאחר מכן חלץ ממנה את שאר שדות ה-JSON לפי הפורמט שהוגדר.',
            },
            {
                inlineData: {
                    data: input.audio,
                    mimeType: input.mimeType,
                },
            },
        ];
    }
    return [
        { text: SYSTEM_PROMPT },
        { text: `הודעת הסוכן:\n"${input.text}"` },
    ];
}
/** Strips markdown code fences if the model wraps the JSON anyway */
function stripFences(raw) {
    return raw
        .replace(/^```(?:json)?/m, '')
        .replace(/```$/m, '')
        .trim();
}
// ─── Payload Sanitisation (Security Fix #5) ───────────────────────────────────
/**
 * Validates and sanitises the raw object returned by Gemini.
 * Only known fields are forwarded — any extra keys Gemini may inject are dropped.
 * Type coercions are applied where safe (e.g. string "5" → number 5 for rooms).
 *
 * @throws if the parsed object is structurally invalid (not an object, action_type missing)
 */
function sanitisePayload(raw) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('Gemini returned a non-object payload.');
    }
    const obj = raw;
    // action_type — must be one of the enum values
    const actionType = VALID_ACTION_TYPES.has(obj['action_type'])
        ? obj['action_type']
        : 'unknown';
    // property_type — must be one of the enum values, default apartment
    const propertyType = VALID_PROPERTY_TYPES.has(obj['property_type'])
        ? obj['property_type']
        : 'apartment';
    // String fields — only keep non-empty trimmed strings
    const toStr = (v) => {
        if (typeof v === 'string' && v.trim().length > 0)
            return v.trim();
        return null;
    };
    // Number fields — accept number or numeric string
    const toNum = (v) => {
        if (typeof v === 'number' && isFinite(v))
            return Math.round(v);
        if (typeof v === 'string') {
            const n = parseFloat(v.replace(/,/g, ''));
            if (isFinite(n))
                return Math.round(n);
        }
        return null;
    };
    return {
        action_type: actionType,
        full_name: toStr(obj['full_name']),
        phone_number: toStr(obj['phone_number']),
        property_type: propertyType,
        rooms: toNum(obj['rooms']),
        budget_max: toNum(obj['budget_max']),
        preferred_location: toStr(obj['preferred_location']),
        notes: toStr(obj['notes']),
        transcribed_text: toStr(obj['transcribed_text']),
    };
}
// ─── Validation & Hebrew Messages ─────────────────────────────────────────────
function buildMissingInfoMessage(payload) {
    const missingName = !payload.full_name;
    const missingPhone = !payload.phone_number;
    if (missingName && missingPhone) {
        return 'קלטתי את פרטי הליד, אבל חסרים לי שם מלא ומספר טלפון כדי לשמור אותו. מה הפרטים?';
    }
    if (missingName) {
        return 'קלטתי את פרטי הליד, אבל חסר לי שם מלא של הלקוח. מה השם?';
    }
    if (missingPhone) {
        return 'קלטתי את פרטי הליד, אבל חסר לי מספר טלפון כדי לשמור אותו. מה המספר?';
    }
    return ''; // All required fields present — no message needed
}
// ─── Database Layer ───────────────────────────────────────────────────────────
/**
 * saveLeadToDatabase
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PLUG IN YOUR FIRESTORE / SUPABASE LOGIC HERE                  ║
 * ║                                                                  ║
 * ║  Currently wired to Firestore using the same schema as          ║
 * ║  addLead.ts. Replace the body with your Supabase insert if      ║
 * ║  migrating away from Firebase.                                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * @param payload  Validated + sanitised LeadPayload from Gemini
 * @param agencyId The agency this lead belongs to
 * @param uid      The UID of the agent who triggered the action
 * @returns Firestore document ID of the created lead
 */
async function saveLeadToDatabase(payload, agencyId, uid) {
    var _a, _b, _c;
    const leadRef = db.collection('leads').doc();
    // Only the sanitised, schema-controlled fields are written — no passthrough of raw Gemini output.
    await leadRef.set({
        agencyId,
        name: payload.full_name,
        phone: payload.phone_number,
        email: null,
        source: 'AI Agent (Voice/Text)',
        requirements: {
            desiredCity: payload.preferred_location ? [payload.preferred_location] : [],
            maxBudget: (_a = payload.budget_max) !== null && _a !== void 0 ? _a : null,
            minRooms: (_b = payload.rooms) !== null && _b !== void 0 ? _b : null,
            propertyType: [payload.property_type],
        },
        assignedAgentId: uid,
        notes: (_c = payload.notes) !== null && _c !== void 0 ? _c : null,
        status: 'new',
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    // ── PII-safe log: never log name or phone ────────────────────────────────
    console.log(`[TextToAction] Lead created: ${leadRef.id} | agencyId: ${agencyId}`);
    return leadRef.id;
}
// ─── Cloud Function ───────────────────────────────────────────────────────────
/**
 * textToActionAgent
 *
 * Deployed name: ai-textToActionAgent
 *
 * Call from the client with one of:
 *   { text: "צור ליד חדש..." }
 *   { audio: "<base64>", mimeType: "audio/webm" }
 */
exports.textToActionAgent = (0, https_1.onCall)({
    secrets: [geminiApiKey],
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
}, async (request) => {
    var _a, _b, _c;
    // ── 1. Auth: Firebase token + active agency membership ───────────────────
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { agencyId, uid } = authData;
    // ── 2. Parse & validate input ────────────────────────────────────────────
    const { text, audio, mimeType } = request.data;
    const hasText = typeof text === 'string' && text.trim().length > 0;
    const hasAudio = typeof audio === 'string' && audio.length > 0;
    if (!hasText && !hasAudio) {
        throw new https_1.HttpsError('invalid-argument', 'יש לספק text או audio.');
    }
    // ── Security Fix #1: cap audio payload size ─────────────────────────────
    if (hasAudio && audio.length > MAX_AUDIO_BASE64_CHARS) {
        throw new https_1.HttpsError('invalid-argument', 'הקובץ האודיו גדול מדי. אורך ההקלטה המקסימלי הוא כ-60 שניות.');
    }
    // ── Security Fix #2: whitelist MIME type ────────────────────────────────
    const resolvedMimeType = (mimeType || 'audio/webm').toLowerCase();
    if (hasAudio && !ALLOWED_AUDIO_MIME_TYPES.has(resolvedMimeType)) {
        throw new https_1.HttpsError('invalid-argument', `סוג קובץ "${resolvedMimeType}" אינו נתמך. השתמש ב-webm, mp4, mpeg, ogg, wav, aac, או flac.`);
    }
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('internal', 'GEMINI_API_KEY is not configured.');
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    // ── 3. Build content parts — audio or text ───────────────────────────────
    const inputParts = hasAudio
        ? buildContents({ audio: audio, mimeType: resolvedMimeType })
        : buildContents({ text: text });
    // ── 4. Call Gemini (single pass — transcription + extraction together) ───
    //    Fix #3: removed the second transcribeAudio() call; transcribed_text
    //    is now a field inside the JSON schema Gemini already fills in one shot.
    console.log(`[TextToAction] Processing. mode=${hasAudio ? 'audio' : 'text'} agencyId=${agencyId}`);
    let rawResponse;
    try {
        const result = await model.generateContent(inputParts);
        rawResponse = stripFences(result.response.text());
    }
    catch (err) {
        console.error('[TextToAction] Gemini call failed:', (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err);
        return {
            status: 'error',
            message: 'שגיאה בתקשורת עם מנוע ה-AI. אנא נסה שנית.',
        };
    }
    // ── 5. Parse JSON ────────────────────────────────────────────────────────
    let parsedRaw;
    try {
        parsedRaw = JSON.parse(rawResponse);
    }
    catch (_d) {
        // Never log rawResponse here — it might contain PII from transcription
        console.error('[TextToAction] Failed to parse Gemini output as JSON.');
        return {
            status: 'error',
            message: 'ה-AI לא החזיר נתונים תקינים. אנא נסח מחדש את ההוראה.',
        };
    }
    // ── 6. Sanitise & schema-guard the payload (Fix #5) ──────────────────────
    let payload;
    try {
        payload = sanitisePayload(parsedRaw);
    }
    catch (err) {
        console.error('[TextToAction] Payload sanitisation failed:', err === null || err === void 0 ? void 0 : err.message);
        return {
            status: 'error',
            message: 'ה-AI החזיר מבנה נתונים לא תקין. אנא נסה שנית.',
        };
    }
    // ── 7. PII-safe log: only structural, non-PII fields (Fix #6) ────────────
    console.log(`[TextToAction] Extracted: action=${payload.action_type} ` +
        `propertyType=${payload.property_type} rooms=${payload.rooms} ` +
        `budget=${payload.budget_max} hasName=${!!payload.full_name} hasPhone=${!!payload.phone_number}`);
    const transcribedText = (_b = payload.transcribed_text) !== null && _b !== void 0 ? _b : undefined;
    // ── 8. Unknown action guard ──────────────────────────────────────────────
    if (payload.action_type === 'unknown') {
        return {
            status: 'unknown_action',
            extractedData: payload,
            transcribedText,
            message: 'לא הצלחתי להבין מה הפעולה הנדרשת. אנא ציין אם ברצונך ליצור ליד חדש או לעדכן ליד קיים.',
        };
    }
    // ── 9. Validation gate: full_name + phone_number are required ─────────────
    const missingMessage = buildMissingInfoMessage(payload);
    if (missingMessage) {
        return {
            status: 'missing_info',
            extractedData: payload,
            transcribedText,
            message: missingMessage,
        };
    }
    // ── 10. Save to database ─────────────────────────────────────────────────
    try {
        switch (payload.action_type) {
            case 'create_lead': {
                const leadId = await saveLeadToDatabase(payload, agencyId, uid);
                return {
                    status: 'success',
                    leadId,
                    extractedData: payload,
                    transcribedText,
                    message: `הליד ${payload.full_name} נשמר בהצלחה! 🎉`,
                };
            }
            case 'update_lead':
                // TODO: implement findLeadByPhone + partial update
                return {
                    status: 'unknown_action',
                    extractedData: payload,
                    transcribedText,
                    message: 'עדכון ליד קיים עדיין לא נתמך. אנא עשה זאת ישירות מהמסך.',
                };
            default:
                // TypeScript exhaustiveness — should never reach here
                return {
                    status: 'unknown_action',
                    extractedData: payload,
                    transcribedText,
                    message: 'פעולה לא מוכרת.',
                };
        }
    }
    catch (err) {
        console.error('[TextToAction] Database save failed:', (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : err);
        return {
            status: 'error',
            message: 'שגיאה בשמירת הליד לבסיס הנתונים. אנא נסה שנית.',
        };
    }
});
const CALL_ANALYSIS_PROMPT = `אתה מנתח שיחות בין סוכן נדל"ן ולקוח פוטנציאלי.
השיחה מוקלטת ב-Stereo: ערוץ שמאל = לקוח, ערוץ ימין = סוכן.

תפקידך:
1. תמלל את השיחה המלאה בעברית — ציין [סוכן] ו[לקוח] לפני כל תור דיבור.
2. ספק סיכום קצר (2-3 משפטים) של צרכי הלקוח.
3. חלץ נתונים מובנים.

חוקים:
- אם שדה לא הוזכר בשיחה — הגדר כ-null.
- budget_max: מספר שלם בשקלים (לדוגמה "3 מיליון" → 3000000).
- property_type: "apartment" | "house" | "plot" | "commercial" — תרגם מעברית.
- transaction_type: "sale" (קנייה/מכירה) | "rent" (שכירות) | null.

החזר JSON בלבד — ללא markdown, ללא הסברים:
{
  "transcription": "תמלול מלא עם [סוכן] / [לקוח]...",
  "summary": "סיכום קצר של צרכי הלקוח...",
  "clientName": string | null,
  "budget_max": number | null,
  "rooms": number | null,
  "preferred_location": string | null,
  "property_type": "apartment" | "house" | "plot" | "commercial",
  "transaction_type": "sale" | "rent" | null
}`;
/**
 * Analyses a recorded phone call (stereo MP3) using Gemini.
 * Transcribes, summarises, and extracts structured lead data in one pass.
 * Used by twilioRecordingComplete Cloud Function.
 */
async function extractLeadDataFromAudio(audioBase64, mimeType, apiKey) {
    var _a, _b;
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const parts = [
        { text: CALL_ANALYSIS_PROMPT },
        { inlineData: { data: audioBase64, mimeType } },
    ];
    const result = await model.generateContent(parts);
    const rawText = stripFences(result.response.text());
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    }
    catch (_c) {
        throw new Error('[extractLeadDataFromAudio] Gemini returned invalid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('[extractLeadDataFromAudio] Gemini returned non-object');
    }
    const obj = parsed;
    const toStr = (v) => typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
    const toNum = (v) => {
        if (typeof v === 'number' && isFinite(v))
            return Math.round(v);
        if (typeof v === 'string') {
            const n = parseFloat(v.replace(/,/g, ''));
            if (isFinite(n))
                return Math.round(n);
        }
        return null;
    };
    const propertyType = VALID_PROPERTY_TYPES.has(obj['property_type'])
        ? obj['property_type']
        : 'apartment';
    const txRaw = toStr(obj['transaction_type']);
    const transactionType = txRaw === 'sale' || txRaw === 'rent' ? txRaw : null;
    return {
        transcription: (_a = toStr(obj['transcription'])) !== null && _a !== void 0 ? _a : '',
        summary: (_b = toStr(obj['summary'])) !== null && _b !== void 0 ? _b : '',
        clientName: toStr(obj['clientName']),
        budget_max: toNum(obj['budget_max']),
        rooms: toNum(obj['rooms']),
        preferred_location: toStr(obj['preferred_location']),
        property_type: propertyType,
        transaction_type: transactionType,
    };
}
//# sourceMappingURL=textToAction.js.map