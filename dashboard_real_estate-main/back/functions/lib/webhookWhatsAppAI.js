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
 * flow:
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
exports.webhookWhatsAppAI = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const botPipeline_1 = require("./whatsapp/botPipeline");
// ─── Firebase Secrets ─────────────────────────────────────────────────────────
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
const webhookSecret = (0, params_1.defineSecret)('WAHA_WEBHOOK_SECRET');
const googleClientId = (0, params_1.defineSecret)('GOOGLE_CLIENT_ID');
const googleClientSecret = (0, params_1.defineSecret)('GOOGLE_CLIENT_SECRET');
const googleRedirectUri = (0, params_1.defineSecret)('GOOGLE_REDIRECT_URI');
const resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
const db = admin.firestore();
const REGION = 'europe-west1';
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
function normalisePhone(rawSender) {
    let digits = rawSender.replace(/\D/g, '');
    const waChatId = `${digits}@c.us`;
    if (digits.startsWith('972')) {
        digits = '0' + digits.substring(3);
    }
    return { localPhone: digits, waChatId };
}
// ─── Helper: Resolve agencyId from idInstance ─────────────────────────────────
// Warm-instance cache — eliminates repeated Firestore reads for the same instance
const instanceAgencyCache = new Map();
async function resolveAgencyByInstance(idInstance) {
    var _a;
    const cached = instanceAgencyCache.get(idInstance);
    if (cached)
        return cached;
    const doc = await db.collection('available_instances').doc(idInstance).get();
    const agencyId = (doc.exists && ((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.isActive)) ? doc.data().agencyId : null;
    if (agencyId)
        instanceAgencyCache.set(idInstance, agencyId);
    return agencyId;
}
// ─── Helper: Upsert Lead ──────────────────────────────────────────────────────
async function upsertLead(agencyId, phone, rawName) {
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
            leadName: data.name || rawName || 'לקוח',
            isNew: false,
            isBotActive: data.isBotActive !== false,
        };
    }
    const leadRef = db.collection('leads').doc();
    const leadName = rawName || 'ליד מוואטסאפ (לא ידוע)';
    await leadRef.set({
        agencyId,
        phone,
        name: leadName,
        type: 'new',
        status: 'new',
        source: 'WhatsApp Bot',
        isBotActive: true,
        lastInteraction: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[AI Bot] New lead created: ${leadRef.id} for phone ${phone}`);
    return { leadId: leadRef.id, leadName, isNew: true, isBotActive: true };
}
// ─── Main Cloud Function ──────────────────────────────────────────────────────
exports.webhookWhatsAppAI = (0, https_1.onRequest)({
    region: REGION,
    secrets: [geminiApiKey, masterKey, webhookSecret, googleClientId, googleClientSecret, googleRedirectUri, resendApiKey],
    timeoutSeconds: 300,
    memory: '1GiB',
    cpu: 1,
    minInstances: 1, // מונע cold-start — שמרן אחד חם תמיד, חוסך 5–30s לכל הודעה ראשונה אחרי השקטה
    concurrency: 40, // אינסטנס יחיד מטפל במספר הודעות במקביל
}, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    // Process synchronously so Cloud Run CPU stays active throughout.
    // res.status(200).send('OK') is deferred to the finally block —
    // this eliminates the 2-5 minute CPU-throttle delay that happened
    // when we ACKed early and then ran Gemini/Firestore async.
    try {
        const body = req.body;
        const typeWebhook = (body === null || body === void 0 ? void 0 : body.typeWebhook) || (body === null || body === void 0 ? void 0 : body.event) || '';
        const idInstance = ((_a = body === null || body === void 0 ? void 0 : body.idInstance) === null || _a === void 0 ? void 0 : _a.toString()) || ((_c = (_b = body === null || body === void 0 ? void 0 : body.instanceData) === null || _b === void 0 ? void 0 : _b.idInstance) === null || _c === void 0 ? void 0 : _c.toString());
        console.log(`[Webhook] 📥 type=${typeWebhook} instance=${idInstance !== null && idInstance !== void 0 ? idInstance : 'undefined'}`);
        if (!idInstance) {
            console.error(`[Webhook] ❌ Missing idInstance. Body keys: ${Object.keys(body || {}).join(',')}`);
            return;
        }
        const isRelevant = ['incomingMessageReceived', 'outgoingMessageReceived', 'message'].includes(typeWebhook);
        if (!isRelevant) {
            console.log(`[Webhook] ⏭️ Skipping irrelevant type: ${typeWebhook}`);
            return;
        }
        // Idempotency: atomically claim this message ID before processing.
        // Using create() (fails if document exists) prevents race conditions
        // when Green API retries a webhook we're still processing.
        const idMessageEarly = body === null || body === void 0 ? void 0 : body.idMessage;
        if (idMessageEarly) {
            const processedRef = db.collection('processed_messages').doc(idMessageEarly);
            try {
                await processedRef.create({
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    instance: idInstance,
                });
            }
            catch (e) {
                // code 6 = gRPC ALREADY_EXISTS — duplicate delivery, skip
                if ((e === null || e === void 0 ? void 0 : e.code) === 6 || ((_d = e === null || e === void 0 ? void 0 : e.message) === null || _d === void 0 ? void 0 : _d.includes('ALREADY_EXISTS')))
                    return;
                console.warn('[Webhook] processed_messages create failed (non-fatal):', e === null || e === void 0 ? void 0 : e.message);
            }
        }
        // Resolve Agency
        const agencyId = await resolveAgencyByInstance(idInstance);
        if (!agencyId) {
            console.error(`[Webhook] ❌ Could not resolve agency for instance ${idInstance}. Check Firestore indexes and private_credentials docs.`);
            return;
        }
        console.log(`[Webhook] ✅ Resolved agency=${agencyId} for instance=${idInstance}`);
        const agencyDoc = await db.collection('agencies').doc(agencyId).get();
        if (!agencyDoc.exists)
            return;
        const agencyData = agencyDoc.data();
        // Extract data
        const senderData = (body === null || body === void 0 ? void 0 : body.senderData) || {};
        const messageData = (body === null || body === void 0 ? void 0 : body.messageData) || {};
        const chatId = senderData.chatId || '';
        const senderName = senderData.senderName || '';
        // Exclude groups, broadcast lists, status updates, and WhatsApp channels
        const isGroup = chatId.endsWith('@g.us') || chatId.includes('@broadcast') || chatId.includes('@newsletter');
        const isOutbound = typeWebhook === 'outgoingMessageReceived';
        const rawSender = isOutbound ? (((_e = body === null || body === void 0 ? void 0 : body.chatData) === null || _e === void 0 ? void 0 : _e.chatId) || senderData.chatId) : (senderData.sender || chatId);
        const idMessage = body === null || body === void 0 ? void 0 : body.idMessage;
        let textMessage = ((_f = messageData.textMessageData) === null || _f === void 0 ? void 0 : _f.textMessage) ||
            ((_g = messageData.extendedTextMessageData) === null || _g === void 0 ? void 0 : _g.text) ||
            ((_h = messageData.imageMessageData) === null || _h === void 0 ? void 0 : _h.caption) || '';
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
        if (!rawSender || !textMessage) {
            console.log(`[Webhook] ⏭️ Skipping — rawSender: '${rawSender}', type: '${messageData.typeMessage}', textMessage: '${textMessage === null || textMessage === void 0 ? void 0 : textMessage.substring(0, 30)}'`);
            return;
        }
        const { localPhone } = normalisePhone(rawSender);
        // Scenario A: Groups
        if (isGroup) {
            const monitoredGroupsRaw = ((_j = agencyData.whatsappIntegration) === null || _j === void 0 ? void 0 : _j.monitoredGroups) || [];
            const monitoredGroupIds = monitoredGroupsRaw.map(g => typeof g === 'string' ? g : g.id);
            if (monitoredGroupIds.includes(chatId) && geminiApiKey.value()) {
                try {
                    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
                    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
                    // Sanitize textMessage to prevent prompt injection
                    // Escape special characters that could break the prompt string
                    const escapedMessage = textMessage
                        .replace(/\\/g, '\\\\') // Escape backslashes first
                        .replace(/"/g, '\\"') // Escape double quotes
                        .replace(/`/g, '\\`') // Escape backticks
                        .replace(/\n/g, ' ') // Replace newlines with spaces (prevent new instructions)
                        .substring(0, 2000); // Truncate to prevent excessive prompt size
                    const prompt = `You are a real estate listing parser for Israeli B2B WhatsApp agent groups. Extract structured data from the following Hebrew/English message.

Message: "${escapedMessage}"

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "isProperty": boolean,         // true only if this is a real estate listing
  "type": "sale" | "rent",       // transaction type
  "city": string,                // city name in Hebrew, e.g. "תל אביב"
  "neighborhood": string | null, // neighborhood/area if mentioned
  "street": string | null,       // street name and number if mentioned, e.g. "רחוב הרצל 12"
  "price": number | null,        // numeric price (remove commas/symbols)
  "rooms": number | null,        // number of rooms (can be 2.5, 3, 4 etc.)
  "floor": number | null,        // floor number if mentioned
  "sqm": number | null,          // square meters if mentioned
  "description": string | null   // short summary of notable features (elevator, parking, balcony, condition etc.) in Hebrew
}`;
                    const result = await model.generateContent(prompt);
                    const cleanJson = result.response.text().replace(/```json|```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    if (parsed.isProperty) {
                        const address = [parsed.street, parsed.city].filter(Boolean).join(', ') || parsed.city || null;
                        await db.collection('agencies').doc(agencyId).collection('whatsappProperties').add({
                            agencyId,
                            source: 'whatsapp_group',
                            groupId: chatId,
                            // Agent contact info (sender of the WhatsApp message)
                            externalAgentPhone: localPhone,
                            externalAgentName: senderName || null,
                            rawDescription: textMessage,
                            // Parsed fields
                            address,
                            city: parsed.city || null,
                            neighborhood: parsed.neighborhood || null,
                            street: parsed.street || null,
                            price: parsed.price || 0,
                            rooms: parsed.rooms || null,
                            floor: (_k = parsed.floor) !== null && _k !== void 0 ? _k : null,
                            sqm: (_l = parsed.sqm) !== null && _l !== void 0 ? _l : null,
                            description: parsed.description || null,
                            type: parsed.type || 'sale',
                            listingType: 'external',
                            isExclusive: false,
                            status: 'draft',
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
                catch (e) {
                    console.error('B2B Error:', e);
                }
            }
            return;
        }
        // Scenario B: Outbound
        if (isOutbound) {
            const leadSnap = await db.collection('leads').where('agencyId', '==', agencyId).where('phone', '==', localPhone).limit(1).get();
            if (!leadSnap.empty) {
                const leadId = leadSnap.docs[0].id;
                // If the bot sent a message in the last 60s, this outbound webhook is for it — skip
                const sixtySecondsAgo = Date.now() - 60000;
                const recentBotSnap = await db.collection(`leads/${leadId}/messages`)
                    .where('botSentAt', '>=', sixtySecondsAgo)
                    .limit(1).get();
                if (!recentBotSnap.empty)
                    return;
                // Human agent sent manually — log it
                await db.collection(`leads/${leadId}/messages`).add({
                    idMessage: idMessage || null,
                    text: textMessage,
                    direction: 'outbound',
                    senderPhone: 'human_outbound',
                    source: 'whatsapp_human',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    isRead: true,
                });
            }
            return;
        }
        // Scenario C: Inbound DM
        const leadSnapCheck = await db.collection('leads').where('agencyId', '==', agencyId).where('phone', '==', localPhone).limit(1).get();
        let leadId;
        let isBotActive;
        if (!leadSnapCheck.empty) {
            leadId = leadSnapCheck.docs[0].id;
            isBotActive = leadSnapCheck.docs[0].data().isBotActive !== false;
            // Idempotency: check for duplicate within this lead's messages (no collectionGroup index needed)
            if (idMessage) {
                const dup = await db.collection(`leads/${leadId}/messages`).where('idMessage', '==', idMessage).limit(1).get();
                if (!dup.empty)
                    return;
            }
        }
        else {
            // Always create a lead for anyone who messages — never initiate outbound
            const upserted = await upsertLead(agencyId, localPhone, senderName);
            leadId = upserted.leadId;
            isBotActive = upserted.isBotActive;
        }
        // Reset follow-up campaign step on any real reply (not opt-out)
        const isOptOutMsg = ['הסר', 'הסירו', 'הסר אותי', 'הפסיקו', 'stop', 'unsubscribe']
            .some(kw => textMessage.trim().toLowerCase() === kw.toLowerCase()
            || textMessage.trim().toLowerCase().startsWith(kw.toLowerCase() + ' '));
        if (!isOptOutMsg) {
            db.collection('leads').doc(leadId).update({ followUpCampaignStep: 0 })
                .catch((e) => console.warn('[Webhook] campaign reset failed:', e === null || e === void 0 ? void 0 : e.message));
        }
        const inboundMsgRef = await db.collection(`leads/${leadId}/messages`).add({
            idMessage: idMessage || null,
            text: textMessage,
            direction: 'inbound',
            senderPhone: localPhone,
            source: 'whatsapp_web',
            botMuted: !isBotActive,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false,
        });
        if (isBotActive) {
            const creds = await getGreenApiCredentials(agencyId, masterKey.value());
            if (creds) {
                const { waChatId } = normalisePhone(rawSender);
                await (0, botPipeline_1.processInboundMessage)({
                    phone: localPhone,
                    waChatId,
                    text: textMessage,
                    agencyId,
                    leadId,
                    geminiApiKey: geminiApiKey.value(),
                    resendApiKey: resendApiKey.value(),
                    creds,
                    idMessage,
                    inboundMsgDocId: inboundMsgRef.id,
                });
            }
        }
    }
    catch (err) {
        console.error('[Webhook] ❌ Fatal error:', err);
    }
    finally {
        // Always ACK Green API — whether we processed, skipped, or errored.
        // Deferred to here (not line 1) so CPU stays fully allocated throughout
        // Gemini + Firestore work. Early-ACK caused Cloud Run to throttle CPU
        // to near-zero after res.send(), turning 10s jobs into 3+ minute waits.
        res.status(200).send('OK');
    }
});
//# sourceMappingURL=webhookWhatsAppAI.js.map