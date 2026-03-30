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

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const db = getFirestore();

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

// ─── TypeScript Interfaces ─────────────────────────────────────────────────────

/** The CRM action the agent should execute */
export type ActionType = 'create_lead' | 'update_lead' | 'unknown';

/** Property kind normalised to English keys */
export type PropertyType = 'apartment' | 'house' | 'plot' | 'commercial';

const VALID_ACTION_TYPES = new Set<ActionType>(['create_lead', 'update_lead', 'unknown']);
const VALID_PROPERTY_TYPES = new Set<PropertyType>(['apartment', 'house', 'plot', 'commercial']);

/**
 * Strict schema the LLM must populate.
 * Every field is explicitly nullable so the model never hallucinates required values.
 */
export interface LeadPayload {
    action_type: ActionType;
    full_name: string | null;
    phone_number: string | null;
    /** Defaults to "apartment" when a property type is implied but not specified */
    property_type: PropertyType;
    /** Number of rooms requested (e.g. 5) */
    rooms: number | null;
    /** Maximum budget in NIS as an integer (e.g. 3000000) */
    budget_max: number | null;
    /** Preferred street / neighbourhood / city (e.g. "רחוב וייצמן") */
    preferred_location: string | null;
    /** Any remaining context that doesn't map to a structured field */
    notes: string | null;
    /** Human-readable transcription of the audio input (populated by Gemini in the same pass) */
    transcribed_text?: string | null;
}

/**
 * The response this function always returns to the caller.
 * `message` is always a Hebrew string suitable for display in the UI.
 */
export interface TextToActionResult {
    /** success        → lead was created/updated in Firestore
     *  missing_info  → extracted OK but required fields are absent
     *  unknown_action → the agent couldn't determine what action to take
     *  error         → unexpected runtime error (details in message)
     */
    status: 'success' | 'missing_info' | 'unknown_action' | 'error';
    /** Firestore document ID of the newly created lead (only on success) */
    leadId?: string;
    /** The parsed payload returned by Gemini (useful for client-side display) */
    extractedData?: LeadPayload;
    /** Hebrew message ready for UI display */
    message: string;
    /** Raw transcription from audio (only when input was voice) */
    transcribedText?: string;
}

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
function buildContents(input: { text: string } | { audio: string; mimeType: string }): Part[] {
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
function stripFences(raw: string): string {
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
function sanitisePayload(raw: unknown): LeadPayload {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('Gemini returned a non-object payload.');
    }

    const obj = raw as Record<string, unknown>;

    // action_type — must be one of the enum values
    const actionType: ActionType =
        VALID_ACTION_TYPES.has(obj['action_type'] as ActionType)
            ? (obj['action_type'] as ActionType)
            : 'unknown';

    // property_type — must be one of the enum values, default apartment
    const propertyType: PropertyType =
        VALID_PROPERTY_TYPES.has(obj['property_type'] as PropertyType)
            ? (obj['property_type'] as PropertyType)
            : 'apartment';

    // String fields — only keep non-empty trimmed strings
    const toStr = (v: unknown): string | null => {
        if (typeof v === 'string' && v.trim().length > 0) return v.trim();
        return null;
    };

    // Number fields — accept number or numeric string
    const toNum = (v: unknown): number | null => {
        if (typeof v === 'number' && isFinite(v)) return Math.round(v);
        if (typeof v === 'string') {
            const n = parseFloat(v.replace(/,/g, ''));
            if (isFinite(n)) return Math.round(n);
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

function buildMissingInfoMessage(payload: LeadPayload): string {
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
async function saveLeadToDatabase(
    payload: LeadPayload,
    agencyId: string,
    uid: string
): Promise<string> {
    const leadRef = db.collection('leads').doc();

    // Only the sanitised, schema-controlled fields are written — no passthrough of raw Gemini output.
    await leadRef.set({
        agencyId,
        name: payload.full_name!,
        phone: payload.phone_number!,
        email: null,
        source: 'AI Agent (Voice/Text)',
        requirements: {
            desiredCity: payload.preferred_location ? [payload.preferred_location] : [],
            maxBudget: payload.budget_max ?? null,
            minRooms: payload.rooms ?? null,
            propertyType: [payload.property_type],
        },
        assignedAgentId: uid,
        notes: payload.notes ?? null,
        status: 'new',
        createdAt: FieldValue.serverTimestamp(),
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
export const textToActionAgent = onCall(
    {
        secrets: [geminiApiKey],
        region: 'europe-west1',
        timeoutSeconds: 120,
        memory: '512MiB',
        cors: true,
    },
    async (request): Promise<TextToActionResult> => {
        // ── 1. Auth: Firebase token + active agency membership ───────────────────
        const authData = await validateUserAuth(request);
        const { agencyId, uid } = authData;

        // ── 2. Parse & validate input ────────────────────────────────────────────
        const { text, audio, mimeType } = request.data as {
            text?: string;
            audio?: string;
            mimeType?: string;
        };

        const hasText = typeof text === 'string' && text.trim().length > 0;
        const hasAudio = typeof audio === 'string' && audio.length > 0;

        if (!hasText && !hasAudio) {
            throw new HttpsError('invalid-argument', 'יש לספק text או audio.');
        }

        // ── Security Fix #1: cap audio payload size ─────────────────────────────
        if (hasAudio && audio!.length > MAX_AUDIO_BASE64_CHARS) {
            throw new HttpsError(
                'invalid-argument',
                'הקובץ האודיו גדול מדי. אורך ההקלטה המקסימלי הוא כ-60 שניות.'
            );
        }

        // ── Security Fix #2: whitelist MIME type ────────────────────────────────
        const resolvedMimeType = (mimeType || 'audio/webm').toLowerCase();
        if (hasAudio && !ALLOWED_AUDIO_MIME_TYPES.has(resolvedMimeType)) {
            throw new HttpsError(
                'invalid-argument',
                `סוג קובץ "${resolvedMimeType}" אינו נתמך. השתמש ב-webm, mp4, mpeg, ogg, wav, aac, או flac.`
            );
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError('internal', 'GEMINI_API_KEY is not configured.');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // ── 3. Build content parts — audio or text ───────────────────────────────
        const inputParts: Part[] = hasAudio
            ? buildContents({ audio: audio!, mimeType: resolvedMimeType })
            : buildContents({ text: text! });

        // ── 4. Call Gemini (single pass — transcription + extraction together) ───
        //    Fix #3: removed the second transcribeAudio() call; transcribed_text
        //    is now a field inside the JSON schema Gemini already fills in one shot.
        console.log(`[TextToAction] Processing. mode=${hasAudio ? 'audio' : 'text'} agencyId=${agencyId}`);

        let rawResponse: string;
        try {
            const result = await model.generateContent(inputParts);
            rawResponse = stripFences(result.response.text());
        } catch (err: any) {
            console.error('[TextToAction] Gemini call failed:', err?.message ?? err);
            return {
                status: 'error',
                message: 'שגיאה בתקשורת עם מנוע ה-AI. אנא נסה שנית.',
            };
        }

        // ── 5. Parse JSON ────────────────────────────────────────────────────────
        let parsedRaw: unknown;
        try {
            parsedRaw = JSON.parse(rawResponse);
        } catch {
            // Never log rawResponse here — it might contain PII from transcription
            console.error('[TextToAction] Failed to parse Gemini output as JSON.');
            return {
                status: 'error',
                message: 'ה-AI לא החזיר נתונים תקינים. אנא נסח מחדש את ההוראה.',
            };
        }

        // ── 6. Sanitise & schema-guard the payload (Fix #5) ──────────────────────
        let payload: LeadPayload;
        try {
            payload = sanitisePayload(parsedRaw);
        } catch (err: any) {
            console.error('[TextToAction] Payload sanitisation failed:', err?.message);
            return {
                status: 'error',
                message: 'ה-AI החזיר מבנה נתונים לא תקין. אנא נסה שנית.',
            };
        }

        // ── 7. PII-safe log: only structural, non-PII fields (Fix #6) ────────────
        console.log(
            `[TextToAction] Extracted: action=${payload.action_type} ` +
            `propertyType=${payload.property_type} rooms=${payload.rooms} ` +
            `budget=${payload.budget_max} hasName=${!!payload.full_name} hasPhone=${!!payload.phone_number}`
        );

        const transcribedText = payload.transcribed_text ?? undefined;

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
        } catch (err: any) {
            console.error('[TextToAction] Database save failed:', err?.message ?? err);
            return {
                status: 'error',
                message: 'שגיאה בשמירת הליד לבסיס הנתונים. אנא נסה שנית.',
            };
        }
    }
);
