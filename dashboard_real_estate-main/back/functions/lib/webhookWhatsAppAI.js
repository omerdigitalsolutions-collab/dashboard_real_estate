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
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
const webhookSecret = (0, params_1.defineSecret)('WAHA_WEBHOOK_SECRET');
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
// ─── Helper: Send Green API Message ──────────────────────────────────────────
async function sendGreenApiMessage(creds, waChatId, message) {
    const sendUrl = `https://7105.api.greenapi.com/waInstance${creds.idInstance}/sendMessage/${creds.apiTokenInstance}`;
    await axios_1.default.post(sendUrl, { chatId: waChatId, message }, { timeout: 15000 });
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
        type: 'buyer',
        status: 'new',
        source: 'WhatsApp Bot',
        isBotActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[AI Bot] New lead created: ${leadRef.id} for phone ${phone}`);
    return { leadId: leadRef.id, leadName, isNew: true, isBotActive: true };
}
// ─── Main Cloud Function ──────────────────────────────────────────────────────
exports.webhookWhatsAppAI = (0, https_1.onRequest)({
    region: REGION,
    secrets: [geminiApiKey, masterKey, webhookSecret],
    timeoutSeconds: 300,
    memory: '1GiB'
}, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    // 1. ACK immediately
    res.status(200).send('OK');
    try {
        const body = req.body;
        const typeWebhook = (body === null || body === void 0 ? void 0 : body.typeWebhook) || (body === null || body === void 0 ? void 0 : body.event) || '';
        const idInstance = ((_a = body === null || body === void 0 ? void 0 : body.idInstance) === null || _a === void 0 ? void 0 : _a.toString()) || ((_c = (_b = body === null || body === void 0 ? void 0 : body.instanceData) === null || _b === void 0 ? void 0 : _b.idInstance) === null || _c === void 0 ? void 0 : _c.toString());
        if (!idInstance) {
            console.error(`[Webhook] ❌ Missing idInstance`);
            return;
        }
        const isRelevant = ['incomingMessageReceived', 'outgoingMessageReceived', 'message'].includes(typeWebhook);
        if (!isRelevant)
            return;
        // Resolve Agency
        const agencyId = await resolveAgencyByInstance(idInstance);
        if (!agencyId) {
            console.error(`[Webhook] ❌ Could not resolve agency for instance ${idInstance}`);
            return;
        }
        const agencyDoc = await db.collection('agencies').doc(agencyId).get();
        if (!agencyDoc.exists)
            return;
        const agencyData = agencyDoc.data();
        const newLeadPolicy = ((_d = agencyData.weBotConfig) === null || _d === void 0 ? void 0 : _d.newLeadPolicy) || 'auto';
        // Extract data
        const senderData = (body === null || body === void 0 ? void 0 : body.senderData) || {};
        const messageData = (body === null || body === void 0 ? void 0 : body.messageData) || {};
        const chatId = senderData.chatId || '';
        const senderName = senderData.senderName || '';
        const isGroup = chatId.endsWith('@g.us');
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
        if (!rawSender || !textMessage)
            return;
        const { localPhone } = normalisePhone(rawSender);
        // Scenario A: Groups
        if (isGroup) {
            const monitoredGroupsRaw = ((_j = agencyData.whatsappIntegration) === null || _j === void 0 ? void 0 : _j.monitoredGroups) || [];
            const monitoredGroupIds = monitoredGroupsRaw.map(g => typeof g === 'string' ? g : g.id);
            if (monitoredGroupIds.includes(chatId) && geminiApiKey.value()) {
                try {
                    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
                    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                    const prompt = `You are a real estate parser for B2B WhatsApp groups in Israel. Message: "${textMessage}". Output JSON: {"isProperty": boolean, "type": "sale"|"rent", "city": string, "price": number, "rooms": number}`;
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
            }
            return;
        }
        // Scenario C: Inbound DM
        if (idMessage) {
            const dup = await db.collectionGroup('messages').where('idMessage', '==', idMessage).limit(1).get();
            if (!dup.empty)
                return;
        }
        const leadSnapCheck = await db.collection('leads').where('agencyId', '==', agencyId).where('phone', '==', localPhone).limit(1).get();
        let leadId;
        let isBotActive;
        if (!leadSnapCheck.empty) {
            leadId = leadSnapCheck.docs[0].id;
            isBotActive = leadSnapCheck.docs[0].data().isBotActive !== false;
        }
        else {
            if (newLeadPolicy === 'manual') {
                const apiKey = geminiApiKey.value();
                if (apiKey) {
                    try {
                        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
                        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                        const prompt = `Analyze: "${textMessage}". Is potential Real Estate lead? Return JSON: {"isRealEstateLead": boolean, "summary": "Hebrew summary", "intent": "buy"|"rent"|"sell"|"inquiry"}`;
                        const result = await model.generateContent(prompt);
                        const triage = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
                        if (triage.isRealEstateLead) {
                            await db.collection('pending_leads').add({
                                agencyId,
                                phone: localPhone,
                                name: senderName || null,
                                initialMessage: textMessage,
                                aiSummary: triage.summary,
                                aiIntent: triage.intent,
                                status: 'pending',
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            });
                            await db.collection('alerts').add({
                                agencyId,
                                targetAgentId: 'all',
                                type: 'new_pending_lead',
                                title: 'ליד חדש מ-WhatsApp ✨',
                                message: `${triage.summary || 'הודעה חדשה'} (${localPhone}).`,
                                isRead: false,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                link: '/dashboard/leads?tab=pending'
                            });
                        }
                    }
                    catch (e) {
                        console.error('Triage error:', e);
                    }
                }
                return;
            }
            else {
                const res = await upsertLead(agencyId, localPhone, senderName);
                leadId = res.leadId;
                isBotActive = res.isBotActive;
                const keys = await getGreenApiCredentials(agencyId, masterKey.value());
                if (keys)
                    await (0, whatsappService_1.syncChatHistory)(db, agencyId, leadId, localPhone, keys).catch(e => console.error(e));
            }
        }
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
        if (isBotActive) {
            const creds = await getGreenApiCredentials(agencyId, masterKey.value());
            if (creds)
                await (0, handleWeBotReply_1.handleWeBotReply)(agencyId, leadId, localPhone, textMessage, geminiApiKey.value(), creds, idMessage);
        }
    }
    catch (err) {
        console.error('[Webhook] Fatal:', err);
    }
});
//# sourceMappingURL=webhookWhatsAppAI.js.map