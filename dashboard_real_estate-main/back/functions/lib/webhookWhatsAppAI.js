"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookWhatsAppAI = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const handleWeBotReply_1 = require("./handleWeBotReply");
const whatsappService_1 = require("./whatsappService");
const generative_ai_1 = require("@google/generative-ai");
// ─── Firebase Secrets ─────────────────────────────────────────────────────────
// These secrets must be provisioned with:
//   firebase functions:secrets:set GEMINI_API_KEY
//   firebase functions:secrets:set ENCRYPTION_MASTER_KEY
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
const webhookSecret = (0, params_1.defineSecret)('WAHA_WEBHOOK_SECRET');
const db = admin.firestore();
const REGION = 'europe-west1';
const CATALOG_BASE_URL = 'https://homer.management/catalog';
// ─── Crypto Helpers (mirrors whatsapp.ts — AES-256-CBC) ───────────────────────
const ALGORITHM = 'aes-256-cbc';
function decryptToken(encryptedData, ivText, secret) {
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
async function getGreenApiCredentials(agencyId, secretValue) {
    const doc = await db
        .collection('agencies')
        .doc(agencyId)
        .collection('private_credentials')
        .doc('whatsapp')
        .get();
    if (!doc.exists)
        return null;
    const data = doc.data();
    if (!data.idInstance || !data.encryptedToken || !data.iv)
        return null;
    try {
        const apiTokenInstance = decryptToken(data.encryptedToken, data.iv, secretValue);
        return { idInstance: data.idInstance, apiTokenInstance };
    }
    catch (err) {
        console.error(`[AI Bot] Failed to decrypt credentials for agency ${agencyId}`, err);
        return null;
    }
}
// ─── Helper: Normalise Israeli phone ─────────────────────────────────────────
// Converts "972501234567@c.us" → "0501234567" (local Israeli format)
// and back to WA chatId format for sending: "972501234567@c.us"
function normalisePhone(rawSender) {
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
async function resolveAgencyByInstance(idInstance) {
    var _a, _b;
    const snap = await db
        .collectionGroup('private_credentials')
        .where('idInstance', '==', idInstance)
        .limit(1)
        .get();
    if (snap.empty)
        return null;
    return (_b = (_a = snap.docs[0].ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
}
// NOTE: fetchBotConfig, fetchActivePropertiesForRag, extractSearchCriteria
// were moved to handleWeBotReply.ts — this file now delegates the full
// AI pipeline to handleWeBotReply() after resolving credentials.
// ─── Helper: Query Matching Properties ───────────────────────────────────────
async function findMatchingProperties(agencyId, criteria) {
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
        const allActiveProperties = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        // Helper to sort and slice results
        const finalizeMatches = (matches) => {
            matches.sort((a, b) => {
                var _a, _b;
                const aTime = ((_a = a.createdAt) === null || _a === void 0 ? void 0 : _a.toMillis()) || 0;
                const bTime = ((_b = b.createdAt) === null || _b === void 0 ? void 0 : _b.toMillis()) || 0;
                return bTime - aTime;
            });
            return matches.slice(0, 10).map((m) => m.id);
        };
        // ── PASS 1: Strict Deterministic Matching ──────────────────────────────
        let strictMatches = allActiveProperties.filter((property) => {
            var _a, _b;
            // 1. City Filter
            if (criteria.city) {
                const propCity = (property.city || '').trim().toLowerCase();
                if (propCity !== criteria.city.trim().toLowerCase())
                    return false;
            }
            // 2. Address/Neighborhood Filter (Substring match)
            if (criteria.address) {
                const searchStr = criteria.address.trim().toLowerCase();
                const matchedAddress = [
                    property.street || '',
                    property.neighborhood || '',
                    property.address || ''
                ].some(val => val.toLowerCase().includes(searchStr));
                if (!matchedAddress)
                    return false;
            }
            // 3. Maximum Price (Strict)
            if (criteria.maxPrice !== null && criteria.maxPrice > 0) {
                if (((_a = property.price) !== null && _a !== void 0 ? _a : Infinity) > criteria.maxPrice)
                    return false;
            }
            // 4. Exact Rooms (Strict)
            if (criteria.rooms !== null && criteria.rooms > 0) {
                if (((_b = property.rooms) !== null && _b !== void 0 ? _b : 0) !== criteria.rooms)
                    return false;
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
            var _a, _b;
            // 1. Budget: up to +20% of the requested maxPrice
            if (criteria.maxPrice !== null && criteria.maxPrice > 0) {
                const expandedMaxPrice = criteria.maxPrice * 1.20;
                if (((_a = property.price) !== null && _a !== void 0 ? _a : Infinity) > expandedMaxPrice)
                    return false;
            }
            // 2. Rooms: exact requested amount, or one less, or one more
            if (criteria.rooms !== null && criteria.rooms > 0) {
                const actualRooms = (_b = property.rooms) !== null && _b !== void 0 ? _b : 0;
                const allowedRooms = [criteria.rooms - 1, criteria.rooms, criteria.rooms + 1];
                if (!allowedRooms.includes(actualRooms))
                    return false;
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
    }
    catch (err) {
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
// ─── Helper: Send Green API Message ──────────────────────────────────────────
async function sendGreenApiMessage(creds, waChatId, message) {
    // ── INJECT YOUR GREEN API CREDENTIALS HERE (loaded from Firestore secrets) ─
    // idInstance and apiTokenInstance come from the agency's private_credentials
    // sub-collection and are decrypted server-side — never exposed to the client.
    // ───────────────────────────────────────────────────────────────────────────
    const sendUrl = `https://7105.api.greenapi.com/waInstance${creds.idInstance}/sendMessage/${creds.apiTokenInstance}`;
    await axios_1.default.post(sendUrl, { chatId: waChatId, message }, { timeout: 15000 });
}
// ─── Helper: Upsert Lead ──────────────────────────────────────────────────────
async function upsertLead(agencyId, phone) {
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
exports.webhookWhatsAppAI = (0, https_1.onRequest)({
    region: REGION,
    secrets: [geminiApiKey, masterKey, webhookSecret],
    timeoutSeconds: 300,
    memory: '1GiB'
}, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    // 1. ACK immediately to prevent Green API retries
    res.status(200).send('OK');
    // 2. Security Validation (Now Optional if not provided by sender)
    const incomingSecret = req.headers['x-webhook-secret'] || req.headers['x-greenapi-webhook-secret'] || '';
    const expectedSecret = webhookSecret.value();
    if (expectedSecret && incomingSecret && incomingSecret !== expectedSecret) {
        console.error(`[Webhook] ❌ AUTH FAILED. Incoming secret doesn't match expected secret.`);
        return;
    }
    if (expectedSecret && !incomingSecret) {
        console.warn(`[Webhook] ⚠️ No secret provided in headers. Proceeding anyway for compatibility, but recommend setting x-webhook-secret in Green API.`);
    }
    try {
        const body = req.body;
        const typeWebhook = (body === null || body === void 0 ? void 0 : body.typeWebhook) || (body === null || body === void 0 ? void 0 : body.event) || '';
        const idInstance = ((_a = body === null || body === void 0 ? void 0 : body.idInstance) === null || _a === void 0 ? void 0 : _a.toString()) || ((_c = (_b = body === null || body === void 0 ? void 0 : body.instanceData) === null || _b === void 0 ? void 0 : _b.idInstance) === null || _c === void 0 ? void 0 : _c.toString());
        console.log(`[Webhook] 📥 Received ${typeWebhook} from instance ${idInstance}`);
        if (!idInstance) {
            console.error(`[Webhook] ❌ Missing idInstance in body. Full body: ${JSON.stringify(body)}`);
            return;
        }
        // 🚨 FILTER: Ignore 'outgoingAPIMessageReceived' to prevent duplicate CRM/Bot logs
        const isRelevant = ['incomingMessageReceived', 'outgoingMessageReceived', 'message'].includes(typeWebhook);
        if (!isRelevant) {
            console.log(`[Webhook] ℹ️ Ignoring irrelevant event type: ${typeWebhook}`);
            return;
        }
        const agencyId = await resolveAgencyByInstance(idInstance);
        if (!agencyId) {
            console.error(`[Webhook] ❌ Could not resolve agency for instance ${idInstance}`);
            return;
        }
        // Extract sender and message data
        const senderData = (body === null || body === void 0 ? void 0 : body.senderData) || {};
        const messageData = (body === null || body === void 0 ? void 0 : body.messageData) || {};
        const chatId = senderData.chatId || '';
        const isGroup = chatId.endsWith('@g.us');
        const isOutbound = typeWebhook === 'outgoingMessageReceived';
        const rawSender = isOutbound ? (((_d = body === null || body === void 0 ? void 0 : body.chatData) === null || _d === void 0 ? void 0 : _d.chatId) || senderData.chatId) : (senderData.sender || chatId);
        const idMessage = body === null || body === void 0 ? void 0 : body.idMessage;
        let textMessage = ((_e = messageData.textMessageData) === null || _e === void 0 ? void 0 : _e.textMessage) ||
            ((_f = messageData.extendedTextMessageData) === null || _f === void 0 ? void 0 : _f.text) ||
            ((_g = messageData.imageMessageData) === null || _g === void 0 ? void 0 : _g.caption) || '';
        if (!textMessage) {
            if (messageData.typeMessage === 'imageMessage')
                textMessage = '[תמונה]';
            else if (messageData.typeMessage === 'videoMessage')
                textMessage = '[סרטון]';
            else if (messageData.typeMessage === 'audioMessage')
                textMessage = '[הודעה קולית]';
            else if (messageData.typeMessage === 'fileMessage')
                textMessage = '[קובץ]';
        }
        if (!rawSender || !textMessage)
            return;
        const { localPhone, waChatId } = normalisePhone(rawSender);
        // ============================================================================
        // Scenario A: B2B Group Messages (Property Extraction)
        // ============================================================================
        if (isGroup) {
            const agencyDoc = await db.collection('agencies').doc(agencyId).get();
            const monitoredGroupsRaw = ((_j = (_h = agencyDoc.data()) === null || _h === void 0 ? void 0 : _h.whatsappIntegration) === null || _j === void 0 ? void 0 : _j.monitoredGroups) || [];
            const monitoredGroupIds = monitoredGroupsRaw.map(g => typeof g === 'string' ? g : g.id);
            if (monitoredGroupIds.includes(chatId) && geminiApiKey.value()) {
                console.log(`[Webhook] Group msg detected in monitored group: ${chatId}`);
                try {
                    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
                    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
                    const prompt = `You are a real estate parser for B2B WhatsApp groups in Israel.
Scan this message for property listings (for sale or rent).
If it's NOT a real estate listing (e.g., just chat), return {"isProperty": false}.
If it IS a listing, extract the details. Prices are usually in NIS.
Message: "${textMessage}"

Output strict JSON:
{
  "isProperty": boolean,
  "type": "sale" | "rent",
  "city": string | null,
  "price": number | null,
  "rooms": number | null
}`;
                    const result = await model.generateContent(prompt);
                    const cleanJson = result.response.text().replace(/```json|```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    if (parsed.isProperty) {
                        await db.collection('properties').add({
                            agencyId,
                            source: 'whatsapp_group',
                            groupId: chatId,
                            externalAgentPhone: localPhone,
                            rawDescription: textMessage,
                            city: parsed.city || null,
                            price: parsed.price || 0,
                            rooms: parsed.rooms || null,
                            type: parsed.type || 'sale',
                            listingType: 'external',
                            status: 'draft',
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[Webhook] AI parsed external property from group ${chatId}`);
                    }
                }
                catch (e) {
                    console.error('[Webhook] B2B Extraction error:', e);
                }
            }
            return;
        }
        // ============================================================================
        // Scenario B: Human Reply (Firewall & Logging)
        // ============================================================================
        if (isOutbound) {
            const leadSnap = await db.collection('leads')
                .where('agencyId', '==', agencyId)
                .where('phone', '==', localPhone)
                .limit(1).get();
            if (!leadSnap.empty) {
                const leadId = leadSnap.docs[0].id;
                // Auto-mute bot when human takes over
                await leadSnap.docs[0].ref.update({ isBotActive: false });
                await db.collection(`leads/${leadId}/messages`).add({
                    idMessage: idMessage || null,
                    text: textMessage,
                    direction: 'outbound',
                    senderPhone: 'human_outbound',
                    source: 'whatsapp_human',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: true,
                });
                console.log(`[Webhook] Human reply logged for lead ${leadId}. Bot muted.`);
            }
            return;
        }
        // ============================================================================
        // Scenario C: Inbound DM (AI Bot + Lead Processing)
        // ============================================================================
        // Idempotency: Skip if message already processed
        if (idMessage) {
            const dupCheck = await db.collectionGroup('messages').where('idMessage', '==', idMessage).limit(1).get();
            if (!dupCheck.empty)
                return;
        }
        // Upsert lead
        const { leadId, isNew, isBotActive } = await upsertLead(agencyId, localPhone);
        // 🚨 FIX: Mandatory AWAIT for history sync to ensure it completes before function freezes
        if (isNew) {
            const keys = await getGreenApiCredentials(agencyId, masterKey.value());
            if (keys) {
                console.log(`[Webhook] New lead ${leadId}. Syncing last 10 messages...`);
                await (0, whatsappService_1.syncChatHistory)(db, agencyId, leadId, localPhone, keys).catch(e => console.error('Sync failed:', e));
            }
        }
        // Log inbound message
        await db.collection(`leads/${leadId}/messages`).add({
            idMessage: idMessage || null,
            text: textMessage,
            direction: 'inbound',
            senderPhone: localPhone,
            source: 'whatsapp_web',
            botMuted: !isBotActive,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false,
        });
        // Trigger AI Bot reply if active
        if (isBotActive) {
            const greenApiCreds = await getGreenApiCredentials(agencyId, masterKey.value());
            if (greenApiCreds) {
                await (0, handleWeBotReply_1.handleWeBotReply)(agencyId, leadId, localPhone, textMessage, geminiApiKey.value(), greenApiCreds, idMessage);
            }
        }
    }
    catch (err) {
        console.error('[Webhook] Fatal error in pipeline:', err);
    }
});
//# sourceMappingURL=webhookWhatsAppAI.js.map