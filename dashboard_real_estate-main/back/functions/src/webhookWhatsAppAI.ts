/**
 * ─── AI WhatsApp Chatbot & Catalog Generator ─────────────────────────────────
 *
 * Webhook: webhookWhatsAppAI
 *
 * This HTTP Cloud Function is a dedicated AI real estate chatbot endpoint.
 * It is designed to be registered as the webhook URL in Green API for instances
 * that are meant to serve as an automated buyer-facing assistant.
 *
 * Flow:
 *   1. Parse inbound Green API POST and ACK immediately.
 *   2. Resolve which agency owns the Green API instance.
 *   3. Upsert a lead (create if new, retrieve if existing).
 *   4. Use Gemini to extract search criteria from the buyer's message.
 *   5. Query matching active properties from Firestore.
 *   6. Create a shared catalog valid for 7 days.
 *   7. Send a polite Hebrew reply via Green API with the catalog URL.
 *   8. Log both the inbound message and the bot's reply to the lead thread.
 *
 * Required Firebase Secrets (already provisioned):
 *   - GEMINI_API_KEY       → for AI intent extraction
 *   - ENCRYPTION_MASTER_KEY → for decrypting Green API credentials
 *
 * Environment Variable (optional, set via firebase functions:config:set):
 *   - DEFAULT_AGENCY_ID    → fallback agency if resolution fails (set during development)
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Firebase Secrets ─────────────────────────────────────────────────────────
// These secrets must be provisioned with:
//   firebase functions:secrets:set GEMINI_API_KEY
//   firebase functions:secrets:set ENCRYPTION_MASTER_KEY
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const masterKey = defineSecret('ENCRYPTION_MASTER_KEY');

const db = admin.firestore();
const REGION = 'europe-west1';
const CATALOG_BASE_URL = 'https://homer.management/catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedCriteria {
    city: string | null;
    address: string | null;
    rooms: number | null;
    maxPrice: number | null;
    /** AI-generated Hebrew reply to send to the buyer (catalog URL injected afterwards) */
    replyMessage: string;
    /** True when the buyer asked a business/internal question — no catalog should be generated */
    isOffTopic: boolean;
    /** True when the buyer explicitly asks to speak to a human agent */
    needsHuman: boolean;
}

// ─── Crypto Helpers (mirrors whatsapp.ts — AES-256-CBC) ───────────────────────

const ALGORITHM = 'aes-256-cbc';

function decryptToken(encryptedData: string, ivText: string, secret: string): string {
    const key = crypto
        .createHash('sha256')
        .update(String(secret))
        .digest('base64')
        .substring(0, 32);
    const iv = Buffer.from(ivText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ─── Helper: Get & Decrypt Green API Credentials ─────────────────────────────

interface GreenApiCreds {
    idInstance: string;
    apiTokenInstance: string;
}

async function getGreenApiCredentials(
    agencyId: string,
    secretValue: string
): Promise<GreenApiCreds | null> {
    const doc = await db
        .collection('agencies')
        .doc(agencyId)
        .collection('private_credentials')
        .doc('whatsapp')
        .get();

    if (!doc.exists) return null;
    const data = doc.data()!;
    if (!data.idInstance || !data.encryptedToken || !data.iv) return null;

    try {
        const apiTokenInstance = decryptToken(data.encryptedToken, data.iv, secretValue);
        return { idInstance: data.idInstance, apiTokenInstance };
    } catch (err) {
        console.error(`[AI Bot] Failed to decrypt credentials for agency ${agencyId}`, err);
        return null;
    }
}

// ─── Helper: Normalise Israeli phone ─────────────────────────────────────────
// Converts "972501234567@c.us" → "0501234567" (local Israeli format)
// and back to WA chatId format for sending: "972501234567@c.us"

function normalisePhone(rawSender: string): { localPhone: string; waChatId: string } {
    // rawSender is typically "972XXXXXXXXX@c.us"
    let digits = rawSender.replace(/\D/g, '');
    const waChatId = `${digits}@c.us`;
    // Convert to local Israeli format for Firestore lookups
    if (digits.startsWith('972')) {
        digits = '0' + digits.substring(3);
    }
    return { localPhone: digits, waChatId };
}

// ─── Helper: Resolve agencyId from idInstance ─────────────────────────────────

async function resolveAgencyByInstance(idInstance: string): Promise<string | null> {
    const snap = await db
        .collectionGroup('private_credentials')
        .where('idInstance', '==', idInstance)
        .limit(1)
        .get();

    if (snap.empty) return null;
    return snap.docs[0].ref.parent.parent?.id ?? null;
}

// ─── Helper: AI Criteria Extraction (Gemini) ──────────────────────────────────

async function extractSearchCriteria(
    message: string,
    apiKey: string
): Promise<ExtractedCriteria> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // ── System Persona + Security Guardrails ─────────────────────────────────
    // This is the prompt that defines the bot's identity, security boundaries,
    // and the structured output format it must follow.
    // ─────────────────────────────────────────────────────────────────────────
    const prompt = `אתה עוזר נדל"ן וירטואלי בכיר המייצג משרד תיווך שעובד עם מערכת hOMER.
תפקידך לקבל פניות מלקוחות בווצאפ, להבין מה הם מחפשים, ולהציג להם נכסים רלוונטיים.

חוקי ברזל לאבטחת מידע (קריטי):
1. סודיות מוחלטת: אסור לך בשום פנים ואופן לחשוף מידע פנימי על המשרד. זה כולל: נתוני הכנסות/עמלות, שמות סוכנים או הביצועים שלהם, הסכמי שיתוף פעולה (שת"פ) עם משרדים אחרים, או פרטי קשר של בעלי הנכסים.
2. ניתוב אלגנטי: אם הלקוח שואל שאלות עסקיות על המשרד ("כמה אתם מרוויחים?", "מי הסוכן הכי טוב?"), עליך לענות בנימוס: "אני העוזר הווירטואלי של המשרד ואחראי על התאמת נכסים. לפרטים עסקיים, אשמח להפנות אליך את מנהל המשרד."
3. מסירת מידע על נכסים: הצג רק את העיר, השכונה, מאפייני הנכס (חדרים, מ"ר) והמחיר. לעולם אל תמסור מספר בית או דירה מדויק.

תהליך העבודה שלך:
כאשר לקוח פונה אליך:
1. ברך אותו לשלום בצורה מקצועית ושירותית.
2. חלץ מתוך ההודעה שלו את הקריטריונים (עיר, שכונה/רחוב, תקציב מקסימלי, כמות חדרים מדויקת).
3. ספק לו תשובה קצרה ומזמינה הכוללת את הקישור לקטלוג הנכסים הדיגיטלי שהופק עבורו.
   — החלף את הטקסט [CATALOG_URL] במקום שבו יש לשים את הקישור. אל תמציא URL.
   — אם השאלה אינה נדל"נית, אל תכלול [CATALOG_URL] בתשובה (isOffTopic: true).
4. זיהוי בקשה לנציג אנושי: אם הלקוח מבקש במפורש לדבר עם סוכן, נציג, או מנהל (למשל: "תעביר אותי לסוכן", "רוצה לדבר עם אדם", "תחבר אותי למנהל"), הגדר needsHuman: true וכתוב תשובה אמפתית שמסבירה שיועבר לסוכן בקרוב (ללא [CATALOG_URL]).

כעת, נתח את הודעת הלקוח הבאה והחזר אך ורק JSON תקף:

הודעת לקוח: "${message}"

JSON שדות:
{
  "city": "שם עיר בעברית או null",
  "address": "שם שכונה או רחוב רלוונטי מההודעה או null",
  "rooms": "מספר החדרים המדויק שביקש הלקוח (מספר) או null",
  "maxPrice": מחיר בש"ח או null,
  "replyMessage": "הודעת התשובה המלאה ללקוח בעברית — כולל [CATALOG_URL] במקום הקישור כשרלוונטי",
  "isOffTopic": true/false,
  "needsHuman": true/false
}`;


    try {
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/```json|```/g, '').trim();
        return JSON.parse(raw) as ExtractedCriteria;
    } catch (err) {
        console.error('[AI Bot] Gemini extraction failed, using empty criteria:', err);
        // Fallback: safe default so the pipeline can still continue
        return {
            city: null,
            address: null,
            rooms: null,
            maxPrice: null,
            replyMessage: 'היי! 👋 קיבלנו את פנייתך. הכנו לך קטלוג נכסים אישי: [CATALOG_URL]',
            isOffTopic: false,
            needsHuman: false,
        };

    }
}

// ─── Helper: Query Matching Properties ───────────────────────────────────────

async function findMatchingProperties(
    agencyId: string,
    criteria: ExtractedCriteria
): Promise<string[]> {
    try {
        // Fetch all active properties for the agency (same pattern as matchPropertiesForLead)
        const snapshot = await db
            .collection('properties')
            .where('agencyId', '==', agencyId)
            .where('status', '==', 'active')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const allActiveProperties = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Array<Record<string, any>>;

        // Helper to sort and slice results
        const finalizeMatches = (matches: any[]) => {
            matches.sort((a, b) => {
                const aTime = a.createdAt?.toMillis() || 0;
                const bTime = b.createdAt?.toMillis() || 0;
                return bTime - aTime;
            });
            return matches.slice(0, 10).map((m) => m.id);
        };

        // ── PASS 1: Strict Deterministic Matching ──────────────────────────────
        let strictMatches = allActiveProperties.filter((property) => {
            // 1. City Filter
            if (criteria.city) {
                const propCity = (property.city || '').trim().toLowerCase();
                if (propCity !== criteria.city.trim().toLowerCase()) return false;
            }

            // 2. Address/Neighborhood Filter (Substring match)
            if (criteria.address) {
                const searchStr = criteria.address.trim().toLowerCase();
                const matchedAddress = [
                    property.street || '',
                    property.neighborhood || '',
                    property.address || ''
                ].some(val => val.toLowerCase().includes(searchStr));

                if (!matchedAddress) return false;
            }

            // 3. Maximum Price (Strict)
            if (criteria.maxPrice !== null && criteria.maxPrice > 0) {
                if ((property.price ?? Infinity) > criteria.maxPrice) return false;
            }

            // 4. Exact Rooms (Strict)
            if (criteria.rooms !== null && criteria.rooms > 0) {
                if ((property.rooms ?? 0) !== criteria.rooms) return false;
            }

            return true;
        });

        if (strictMatches.length > 0) {
            console.log(`[AI Bot] Found ${strictMatches.length} properties via PASS 1 (Strict).`);
            return finalizeMatches(strictMatches);
        }

        // ── PASS 2: Relaxed "Smart" Matching ───────────────────────────────────
        // Triggered only if PASS 1 yields 0 results.
        // Relaxations: price +20%, rooms ±1, ignore city and address entirely.
        console.log('[AI Bot] PASS 1 failed. Attempting PASS 2 (Relaxed mode: +20% budget, ±1 room, unconstrained region).');

        let relaxedMatches = allActiveProperties.filter((property) => {
            // 1. Budget: up to +20% of the requested maxPrice
            if (criteria.maxPrice !== null && criteria.maxPrice > 0) {
                const expandedMaxPrice = criteria.maxPrice * 1.20;
                if ((property.price ?? Infinity) > expandedMaxPrice) return false;
            }

            // 2. Rooms: exact requested amount, or one less, or one more
            if (criteria.rooms !== null && criteria.rooms > 0) {
                const actualRooms = property.rooms ?? 0;
                const allowedRooms = [criteria.rooms - 1, criteria.rooms, criteria.rooms + 1];
                if (!allowedRooms.includes(actualRooms)) return false;
            }

            // Notice we do NOT check city or address in PASS 2.
            return true;
        });

        if (relaxedMatches.length > 0) {
            console.log(`[AI Bot] Found ${relaxedMatches.length} properties via PASS 2 (Relaxed).`);
            return finalizeMatches(relaxedMatches);
        }

        // ── PASS 3 (Fallback) ──────────────────────────────────────────────────
        console.log('[AI Bot] No matches found in Pass 1 or 2. Using PASS 3 fallback: latest 5 active properties.');
    } catch (err) {
        console.warn('[AI Bot] Property match execution failed, falling back:', err);
    }

    // ── Fallback ────────────────────────────────────────────────────────────
    const fallbackSnap = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();

    return fallbackSnap.docs.map((d) => d.id);
}

// ─── Helper: Create Shared Catalog ───────────────────────────────────────────

async function createSharedCatalog(
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
    return catalogRef.id;
}

// ─── Helper: Send Green API Message ──────────────────────────────────────────

async function sendGreenApiMessage(
    creds: GreenApiCreds,
    waChatId: string,
    message: string
): Promise<void> {
    // ── INJECT YOUR GREEN API CREDENTIALS HERE (loaded from Firestore secrets) ─
    // idInstance and apiTokenInstance come from the agency's private_credentials
    // sub-collection and are decrypted server-side — never exposed to the client.
    // ───────────────────────────────────────────────────────────────────────────
    const sendUrl = `https://api.green-api.com/waInstance${creds.idInstance}/sendMessage/${creds.apiTokenInstance}`;

    await axios.post(
        sendUrl,
        { chatId: waChatId, message },
        { timeout: 15_000 }
    );
}

// ─── Helper: Upsert Lead ──────────────────────────────────────────────────────

async function upsertLead(
    agencyId: string,
    phone: string
): Promise<{ leadId: string; leadName: string; isNew: boolean; isBotActive: boolean }> {
    const snap = await db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .where('phone', '==', phone)
        .limit(1)
        .get();

    if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        return {
            leadId: docSnap.id,
            leadName: data.name || 'לקוח',
            isNew: false,
            // Default to true for existing leads that pre-date this feature
            isBotActive: data.isBotActive !== false,
        };
    }

    // ── Create a new lead ─────────────────────────────────────────────────────
    const leadRef = db.collection('leads').doc();
    const leadName = 'ליד מוואטסאפ (לא ידוע)';

    await leadRef.set({
        agencyId,
        phone,
        name: leadName,
        type: 'buyer',
        status: 'new',
        source: 'WhatsApp Bot',
        isBotActive: true, // ← Bot starts active for all new WhatsApp leads
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[AI Bot] New lead created: ${leadRef.id} for phone ${phone}`);
    return { leadId: leadRef.id, leadName, isNew: true, isBotActive: true };
}

// ─── Main Cloud Function ──────────────────────────────────────────────────────

/**
 * webhookWhatsAppAI
 *
 * HTTP endpoint — register this URL in your Green API instance settings under:
 *   "Notifications" → "Incoming Messages" webhook URL
 *
 * Deployed URL pattern:
 *   https://europe-west1-<project-id>.cloudfunctions.net/webhookWhatsAppAI
 *
 * This function is intentionally NOT namespaced under the `whatsapp` export group
 * so the URL stays clean and is easy to paste into Green API settings.
 */
export const webhookWhatsAppAI = onRequest(
    {
        region: REGION,
        // Secrets are injected as env vars at runtime by the Functions runtime
        secrets: [geminiApiKey, masterKey],
    },
    async (req, res) => {
        // ── 1. ACK immediately to prevent Green API retries ───────────────────────
        res.status(200).send('OK');

        try {
            const body = req.body;
            const typeWebhook: string = body?.typeWebhook || '';
            const idInstance: string | undefined = body?.idInstance?.toString();

            if (!idInstance) {
                console.warn('[AI Bot] No idInstance in payload, skipping.');
                return;
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIREWALL A: Human-Answered Auto-Mute
            // When a human agent replies directly from the WA phone/web,
            // Green API fires `outgoingMessageReceived`.
            // We catch it here and mute the bot for that lead automatically.
            // NOTE: `outgoingAPIMessageReceived` = the bot's own reply — ignore it.
            // ═══════════════════════════════════════════════════════════════════
            if (typeWebhook === 'outgoingMessageReceived') {
                console.log('[AI Bot] Outgoing message detected — checking if human-sent.');

                // Green API: recipient phone lives in chatData.chatId or senderData.chatId
                const recipientRawId: string =
                    body?.chatData?.chatId || body?.senderData?.chatId || '';

                if (recipientRawId && recipientRawId.endsWith('@c.us')) {
                    // Resolve agency
                    const muteAgencyId = await resolveAgencyByInstance(idInstance);
                    if (muteAgencyId) {
                        const { localPhone: recipientPhone } = normalisePhone(recipientRawId);
                        const leadSnap = await db.collection('leads')
                            .where('agencyId', '==', muteAgencyId)
                            .where('phone', '==', recipientPhone)
                            .limit(1).get();

                        if (!leadSnap.empty) {
                            await leadSnap.docs[0].ref.update({ isBotActive: false });
                            console.log(`[AI Bot] 🤫 Bot auto-muted for lead ${leadSnap.docs[0].id} (human replied).`);
                        }
                    }
                }
                return; // Done — do not process further
            }

            // ── 2. Only handle inbound DMs from here on ────────────────────────
            if (typeWebhook !== 'incomingMessageReceived') {
                console.log(`[AI Bot] Skipping non-message event: ${typeWebhook}`);
                return;
            }

            // ── 3. Extract Green API payload fields ────────────────────────────
            const senderData = body?.senderData || {};
            const messageData = body?.messageData || {};

            const rawSender: string = senderData.sender || senderData.chatId || '';
            const chatId: string = senderData.chatId || '';
            const textMessage: string = messageData.textMessageData?.textMessage || '';
            const idMessage: string | undefined = body?.idMessage;

            // ── 4. Safety guards ───────────────────────────────────────────────
            if (!rawSender || !textMessage) {
                console.log('[AI Bot] Empty sender or message, skipping.');
                return;
            }
            if (chatId.endsWith('@c.us') === false) {
                console.log(`[AI Bot] Non-DM chat type (${chatId}), skipping.`);
                return;
            }
            // Outbound echo loop-guard (belt-and-suspenders)
            if (senderData.senderName === 'me') {
                console.log('[AI Bot] Outbound echo, skipping.');
                return;
            }

            console.log(`[AI Bot] Processing DM from ${rawSender} on instance ${idInstance}`);

            // ── 5. Resolve agency from idInstance ──────────────────────────────────
            const agencyId = await resolveAgencyByInstance(idInstance);
            if (!agencyId) {
                console.warn(`[AI Bot] No agency found for instance ${idInstance}. Is it registered?`);
                return;
            }

            // ── 6. Fetch agency branding data ──────────────────────────────────────
            const agencyDoc = await db.collection('agencies').doc(agencyId).get();
            const agencyData = agencyDoc.data() || {};

            // ── 7. Normalise phone ─────────────────────────────────────────────────
            const { localPhone, waChatId } = normalisePhone(rawSender);

            // ── 8. Idempotency guard — skip if this exact message was already processed
            if (idMessage) {
                // Check across all leads for this message ID to prevent duplicate catalog creation
                const dupCheck = await db
                    .collectionGroup('messages')
                    .where('idMessage', '==', idMessage)
                    .limit(1)
                    .get();
                if (!dupCheck.empty) {
                    console.log(`[AI Bot] Duplicate message ${idMessage} detected, skipping.`);
                    return;
                }
            }

            // ── 9. Upsert lead ─────────────────────────────────────────────────
            const { leadId, leadName, isNew, isBotActive } = await upsertLead(agencyId, localPhone);
            if (isNew) {
                console.log(`[AI Bot] Created new lead ${leadId} for ${localPhone} (bot active).`);
            } else {
                console.log(`[AI Bot] Existing lead ${leadId} for ${localPhone} | isBotActive: ${isBotActive}`);
            }

            // ═══════════════════════════════════════════════════════════════════
            // FIREWALL B: isBotActive Check
            // If a human agent has taken over the conversation (or manually muted
            // the bot), we still log the message for CRM history but do NOT
            // call Gemini, do NOT generate a catalog, do NOT auto-reply.
            // ═══════════════════════════════════════════════════════════════════
            if (!isBotActive) {
                console.log(`[AI Bot] 🔇 Bot is muted for lead ${leadId}. Logging message only.`);
                await db.collection(`leads/${leadId}/messages`).add({
                    idMessage: idMessage || null,
                    text: textMessage,
                    direction: 'inbound',
                    senderPhone: localPhone,
                    source: 'whatsapp_ai_bot',
                    botMuted: true,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false,
                });
                return;
            }

            // ── 10. AI: Extract search criteria via Gemini ─────────────────────────
            // Replace geminiApiKey.value() with your own key source if needed.
            // The GEMINI_API_KEY secret is already set up in this project.
            const apiKey = geminiApiKey.value();
            const criteria = await extractSearchCriteria(textMessage, apiKey);
            console.log('[AI Bot] Extracted criteria:', JSON.stringify(criteria));

            // ── 11. needsHuman check — Human Handoff (Firewall C) ──────────────
            if (criteria.needsHuman) {
                console.log(`[AI Bot] 🤝 Lead ${leadId} requested a human agent. Handing off.`);
                const handoffCreds = await getGreenApiCredentials(agencyId, masterKey.value());
                if (handoffCreds) {
                    await sendGreenApiMessage(handoffCreds, waChatId, criteria.replyMessage);
                }
                // Mute the bot — a real agent will continue from the WhatsApp app
                await db.collection('leads').doc(leadId).update({ isBotActive: false });
                // Log both messages
                const handoffMsgsRef = db.collection(`leads/${leadId}/messages`);
                await handoffMsgsRef.add({
                    idMessage: idMessage || null,
                    text: textMessage,
                    direction: 'inbound',
                    senderPhone: localPhone,
                    source: 'whatsapp_ai_bot',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false,
                });
                if (handoffCreds) {
                    await handoffMsgsRef.add({
                        text: criteria.replyMessage,
                        direction: 'outbound',
                        senderPhone: 'bot',
                        source: 'whatsapp_ai_bot',
                        needsHuman: true,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        isRead: true,
                    });
                }
                return;
            }

            // ── 12. Off-topic guard (security guardrail) ───────────────────────
            // If Gemini flagged the message as non-real-estate (e.g. buyer asked
            // about internal revenues, agents, etc.), send the polite deflection
            // reply and stop — no catalog is created, no internal data is exposed.
            if (criteria.isOffTopic) {
                console.log(`[AI Bot] Off-topic message from ${localPhone} — sending deflection, no catalog.`);
                const offTopicCreds = await getGreenApiCredentials(agencyId, masterKey.value());
                if (offTopicCreds) {
                    await sendGreenApiMessage(offTopicCreds, waChatId, criteria.replyMessage);
                }
                await db.collection(`leads/${leadId}/messages`).add({
                    idMessage: idMessage || null,
                    text: textMessage,
                    direction: 'inbound',
                    senderPhone: localPhone,
                    source: 'whatsapp_ai_bot',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false,
                });
                if (offTopicCreds) {
                    await db.collection(`leads/${leadId}/messages`).add({
                        text: criteria.replyMessage,
                        direction: 'outbound',
                        senderPhone: 'bot',
                        source: 'whatsapp_ai_bot',
                        isOffTopic: true,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        isRead: true,
                    });
                }
                return;
            }

            // ── 12. Find matching properties ───────────────────────────────────────
            const propertyIds = await findMatchingProperties(agencyId, criteria);

            if (propertyIds.length === 0) {
                console.log('[AI Bot] No active properties found for this agency. Aborting reply.');
                // Still log the inbound message even if we cannot build a catalog
                await db.collection(`leads/${leadId}/messages`).add({
                    idMessage: idMessage || null,
                    text: textMessage,
                    direction: 'inbound',
                    senderPhone: localPhone,
                    source: 'whatsapp_ai_bot',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: false,
                });
                return;
            }

            // ── 12. Create shared catalog ──────────────────────────────────────────
            const catalogId = await createSharedCatalog(
                agencyId,
                agencyData,
                leadId,
                leadName,
                propertyIds
            );
            const catalogUrl = `${CATALOG_BASE_URL}/${catalogId}`;

            // ── 13. Inject catalog URL into Gemini-generated reply ────────────────
            // Gemini writes the personalised Hebrew reply and marks where the URL
            // should go with the placeholder [CATALOG_URL].
            const replyMessage = criteria.replyMessage.replace('[CATALOG_URL]', catalogUrl);

            // ── 14. Retrieve agency Green API credentials & send reply ─────────────
            // Credentials are decrypted server-side using the ENCRYPTION_MASTER_KEY secret.
            // They are NEVER exposed to the client or logged.
            const creds = await getGreenApiCredentials(agencyId, masterKey.value());
            if (!creds) {
                console.error(`[AI Bot] Could not retrieve Green API credentials for agency ${agencyId}. Cannot send reply.`);
            } else {
                await sendGreenApiMessage(creds, waChatId, replyMessage);
                console.log(`[AI Bot] Reply sent to ${waChatId} with catalog ${catalogId}`);
            }

            // ── 15. Log conversation to the lead's message thread ─────────────────
            const messagesRef = db.collection(`leads/${leadId}/messages`);

            // Log inbound message
            await messagesRef.add({
                idMessage: idMessage || null,
                text: textMessage,
                direction: 'inbound',
                senderPhone: localPhone,
                source: 'whatsapp_ai_bot',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: false,
            });

            // Log outbound bot reply
            if (creds) {
                await messagesRef.add({
                    text: replyMessage,
                    direction: 'outbound',
                    senderPhone: 'bot',
                    source: 'whatsapp_ai_bot',
                    catalogId,
                    catalogUrl,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: true,
                });
            }

            console.log(`[AI Bot] ✅ Pipeline complete — Lead: ${leadId}, Catalog: ${catalogId}`);
        } catch (err) {
            console.error('[AI Bot] Fatal error in pipeline:', err);
            // res already sent 200, so we just log — Green API will NOT retry.
        }
    }
);
