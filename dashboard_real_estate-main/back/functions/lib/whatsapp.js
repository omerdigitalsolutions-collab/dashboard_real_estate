"use strict";
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
exports.whatsappWebhook = exports.disconnectWhatsApp = exports.sendWhatsappMessage = exports.checkWhatsAppStatus = exports.generateWhatsAppQR = exports.disconnectAgencyWhatsApp = exports.connectAgencyWhatsApp = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
/**
 * ─── WhatsApp Managed Architecture (WAHA / Green API) ───────────────────────
 *
 * ALL credentials live server-side only.
 * The frontend never sees apiToken / instanceId / sessionName.
 *
 * Environment variables required (set via `firebase functions:secrets:set`):
 *   WAHA_BASE_URL   – e.g. https://your-waha-server.com or https://api.greenapi.com
 *   WAHA_MASTER_KEY – master Bearer token for WAHA, OR ignored for Green API flow
 *
 * Green API flow  → each agency gets its own idInstance + apiToken stored in Firestore.
 * WAHA flow       → each agency gets a session named `agency_{agencyId}`.
 *
 * This file supports BOTH by detecting `WAHA_MASTER_KEY` presence:
 *   - If present  → WAHA self-hosted (session-based)
 *   - If absent   → Green API (instance-based)
 */
const db = admin.firestore();
const REGION = 'europe-west1';
// Allowed CORS origins — add your production domain here when deploying
const CORS_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://dashboard-6f9d1.web.app',
    'https://dashboard-6f9d1.firebaseapp.com',
    true, // Allow all origins (for callable functions, the SDK handles auth)
];
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getWahaBaseUrl() {
    const url = process.env.WAHA_BASE_URL;
    if (!url)
        throw new https_1.HttpsError('internal', 'WAHA_BASE_URL is not configured.');
    return url.replace(/\/$/, '');
}
/** Normalise Israeli phone to international format: 0501234567 → 972501234567@c.us */
function toWaId(phone) {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0'))
        clean = '972' + clean.substring(1);
    return `${clean}@c.us`;
}
/** Resolve agencyId from uid via Firestore */
async function getAgencyId(uid) {
    var _a;
    const userDoc = await db.collection('users').doc(uid).get();
    const agencyId = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.agencyId;
    if (!agencyId)
        throw new https_1.HttpsError('failed-precondition', 'User is not linked to an agency.');
    return agencyId;
}
/** Read WhatsApp integration doc from agency */
async function getAgencyWhatsApp(agencyId) {
    var _a;
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    return (_a = agencyDoc.data()) === null || _a === void 0 ? void 0 : _a.whatsappIntegration;
}
// ─── Cryptography Helpers (AES-256-CBC) ──────────────────────────────────────
const ALGORITHM = 'aes-256-cbc';
function encryptToken(text, secret) {
    // Ensure secret is 32 bytes for aes-256
    const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encryptedToken: encrypted, iv: iv.toString('hex') };
}
function decryptToken(encryptedData, ivText, secret) {
    const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
    const iv = Buffer.from(ivText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
/** Retrieve and decrypt Green API credentials for an agency */
async function getGreenApiCredentials(agencyId, secretValue) {
    const doc = await db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp').get();
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
        console.error(`[WhatsApp] Failed to decrypt credentials for agency ${agencyId}`, err);
        return null;
    }
}
// ─── Instance Recycling (Business Plan) ──────────────────────────────────────
/**
 * connectAgencyWhatsApp:
 * Pulls an available Green API instance from the `available_instances` pool,
 * encrypts the API token, assigns it to `agencies/{agencyId}/private_credentials/whatsapp`,
 * and removes it from the pool.
 */
exports.connectAgencyWhatsApp = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: [masterKey],
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    // Check if agency already has keys in the private vault
    const credsRef = db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp');
    const agencyRef = db.collection('agencies').doc(agencyId);
    try {
        await db.runTransaction(async (t) => {
            var _a;
            const credsDoc = await t.get(credsRef);
            if (credsDoc.exists && ((_a = credsDoc.data()) === null || _a === void 0 ? void 0 : _a.idInstance)) {
                throw new https_1.HttpsError('already-exists', 'Agency already has an allocated WhatsApp instance.');
            }
            // Find an available instance
            const availableSnap = await t.get(db.collection('available_instances').limit(1));
            if (availableSnap.empty) {
                throw new https_1.HttpsError('resource-exhausted', 'No available WhatsApp instances at the moment. Please contact support.');
            }
            const instanceDoc = availableSnap.docs[0];
            const instanceData = instanceDoc.data();
            // Encrypt the token
            const { encryptedToken, iv } = encryptToken(instanceData.apiTokenInstance, masterKey.value());
            // Save encrypted credentials to private subcollection
            t.set(credsRef, {
                idInstance: instanceData.idInstance,
                encryptedToken,
                iv,
                assignedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Update agency public metadata (remove plain-text keys if any existed, and set status)
            t.set(agencyRef, {
                greenApiKeys: admin.firestore.FieldValue.delete(),
                whatsappIntegration: {
                    status: 'PENDING_SCAN', // Force them to scan QR next
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }
            }, { merge: true });
            // Remove from pool
            t.delete(instanceDoc.ref);
        });
        return { success: true, message: 'Instance allocated securely.' };
    }
    catch (err) {
        console.error('Failed to allocate instance:', err);
        throw new https_1.HttpsError(err.code || 'internal', err.message || 'Failed to allocate instance');
    }
});
/**
 * disconnectAgencyWhatsApp:
 * Removes keys from private subcollection, decrypts to send /LogOut to Green API,
 * and puts plain-text keys back in pool.
 */
exports.disconnectAgencyWhatsApp = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: [masterKey],
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const credsRef = db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp');
    const agencyRef = db.collection('agencies').doc(agencyId);
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if (!(keys === null || keys === void 0 ? void 0 : keys.idInstance) || !(keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        throw new https_1.HttpsError('not-found', 'No encrypted instance allocated to this agency.');
    }
    // 1. Send LogOut to Green API to clear the current WhatsApp session
    try {
        await axios_1.default.get(`https://api.green-api.com/waInstance${keys.idInstance}/LogOut/${keys.apiTokenInstance}`);
        console.log(`[WhatsApp] Logged out instance ${keys.idInstance}`);
    }
    catch (err) {
        console.warn(`[WhatsApp] Failed to cleanly logout instance ${keys.idInstance}:`, err === null || err === void 0 ? void 0 : err.message);
        // Continue anyway to recycle it
    }
    // 2. Transaction: Return to pool, remove from private subcollection and agency doc
    try {
        await db.runTransaction(async (t) => {
            // Put plain-text back in pool
            const poolRef = db.collection('available_instances').doc();
            t.set(poolRef, {
                idInstance: keys.idInstance,
                apiTokenInstance: keys.apiTokenInstance,
                returnedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Delete from private subcollection
            t.delete(credsRef);
            // Wipe status from agency doc
            t.set(agencyRef, {
                isWhatsappConnected: false,
                whatsappIntegration: null
            }, { merge: true });
        });
        return { success: true, message: 'Disconnected and safely returned instance to pool.' };
    }
    catch (err) {
        console.error('Failed to disconnect/recycle instance:', err);
        throw new https_1.HttpsError('internal', 'Internal error while recycling instance.');
    }
});
// ─── 1. generateWhatsAppQR ───────────────────────────────────────────────────
/**
 * Called by the frontend when the user clicks "Connect WhatsApp" / "Show QR".
 * Requires that `connectAgencyWhatsApp` was called first so the agency has `greenApiKeys`.
 */
exports.generateWhatsAppQR = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: [masterKey],
}, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if (!(keys === null || keys === void 0 ? void 0 : keys.idInstance) || !(keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        throw new https_1.HttpsError('failed-precondition', 'No WhatsApp instance allocated. Call connectAgencyWhatsApp first.');
    }
    const qrUrl = `https://api.green-api.com/waInstance${keys.idInstance}/qr/${keys.apiTokenInstance}`;
    let qrCode;
    try {
        const resp = await axios_1.default.get(qrUrl, { timeout: 15000 });
        if (((_a = resp.data) === null || _a === void 0 ? void 0 : _a.type) === 'alreadyLogged') {
            throw new https_1.HttpsError('already-exists', 'WhatsApp is already connected. Disconnect first.');
        }
        if (((_b = resp.data) === null || _b === void 0 ? void 0 : _b.type) !== 'qrCode' || !((_c = resp.data) === null || _c === void 0 ? void 0 : _c.message)) {
            throw new https_1.HttpsError('internal', `Green API unexpected response: ${JSON.stringify(resp.data)}`);
        }
        qrCode = resp.data.message;
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', `Failed to fetch QR: ${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : err}`);
    }
    // Ensure status reflects pending scan
    await db.collection('agencies').doc(agencyId).set({
        whatsappIntegration: {
            status: 'PENDING_SCAN',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
    }, { merge: true });
    return { qrCode };
});
// ─── 2. checkWhatsAppStatus ──────────────────────────────────────────────────
/**
 * Checks WhatsApp status cleanly reading keys from the dynamically assigned greenApiKeys
 */
exports.checkWhatsAppStatus = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: [masterKey],
}, async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if (!(keys === null || keys === void 0 ? void 0 : keys.idInstance) || !(keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        return { status: 'DISCONNECTED' };
    }
    const statusUrl = `https://api.green-api.com/waInstance${keys.idInstance}/getStateInstance/${keys.apiTokenInstance}`;
    try {
        const resp = await axios_1.default.get(statusUrl, { timeout: 10000 });
        const state = (_a = resp.data) === null || _a === void 0 ? void 0 : _a.stateInstance;
        let mappedStatus = 'DISCONNECTED';
        if (state === 'authorized')
            mappedStatus = 'CONNECTED';
        else if (state === 'notAuthorized')
            mappedStatus = 'PENDING_SCAN';
        // Update the agency doc if status changed
        const currentStatus = (_c = (_b = agencyDoc.data()) === null || _b === void 0 ? void 0 : _b.whatsappIntegration) === null || _c === void 0 ? void 0 : _c.status;
        if (currentStatus !== mappedStatus) {
            await db.collection('agencies').doc(agencyId).set({
                isWhatsappConnected: mappedStatus === 'CONNECTED',
                whatsappIntegration: {
                    status: mappedStatus,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
            }, { merge: true });
        }
        return { status: mappedStatus, greenApiState: state };
    }
    catch (err) {
        console.warn('Status check network/timeout issue, returning stored state.');
        return { status: ((_e = (_d = agencyDoc.data()) === null || _d === void 0 ? void 0 : _d.whatsappIntegration) === null || _e === void 0 ? void 0 : _e.status) || 'PENDING_SCAN' };
    }
});
// ─── 3. sendWhatsappMessage ──────────────────────────────────────────────────
/**
 * Secure message dispatch. Frontend sends only { phone, message } — never any tokens.
 * The function resolves the agency's WAHA credentials server-side.
 */
exports.sendWhatsappMessage = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY', masterKey]
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const { phone, message } = request.data;
    if (!phone || !message)
        throw new https_1.HttpsError('invalid-argument', 'phone and message are required.');
    const agencyId = await getAgencyId(request.auth.uid);
    const wa = await getAgencyWhatsApp(agencyId);
    if (!wa || wa.status !== 'connected') {
        throw new https_1.HttpsError('failed-precondition', 'WhatsApp is not connected. Please connect first in Settings.');
    }
    // ── Green API mode via dynamic keys ───────────────────────────────────────────────────────
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if ((keys === null || keys === void 0 ? void 0 : keys.idInstance) && (keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        const sendUrl = `https://api.green-api.com/waInstance${keys.idInstance}/sendMessage/${keys.apiTokenInstance}`;
        await axios_1.default.post(sendUrl, {
            chatId: toWaId(phone),
            message: message
        }, { timeout: 10000 });
        console.log(`[Green API] Message sent to ${phone}`);
        return { success: true };
    }
    throw new https_1.HttpsError('failed-precondition', 'Session not found.');
});
// ─── 4. disconnectWhatsApp ───────────────────────────────────────────────────
exports.disconnectWhatsApp = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY']
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    // Note: True recycling happens in "disconnectAgencyWhatsApp"
    // This just wipes front-end statuses
    await db.collection('agencies').doc(agencyId).set({ whatsappIntegration: { status: 'DISCONNECTED', updatedAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
    return { success: true };
});
// ─── 5. whatsappWebhook ───────────────────────────────────────────────────────
/**
 * Central inbound webhook — receives messages from Green API / WAHA.
 * Set this URL in your WAHA dashboard or in each Green API instance settings.
 *
 * Security: validates X-Webhook-Secret header against WAHA_WEBHOOK_SECRET env var.
 */
exports.whatsappWebhook = (0, https_1.onRequest)({
    region: REGION,
    secrets: ['WAHA_WEBHOOK_SECRET']
}, async (req, res) => {
    var _a, _b;
    // Always ACK first to prevent retries
    res.status(200).send('OK');
    try {
        const secret = req.headers['x-webhook-secret'] || req.headers['x-greenapi-webhook-secret'];
        if (process.env.WAHA_WEBHOOK_SECRET && secret !== process.env.WAHA_WEBHOOK_SECRET) {
            console.warn('Webhook: Invalid secret header. Request ignored.');
            return;
        }
        const body = req.body;
        const typeWebhook = (body === null || body === void 0 ? void 0 : body.typeWebhook) || (body === null || body === void 0 ? void 0 : body.event) || '';
        // Support both Green API and WAHA event formats
        const isInboundMessage = typeWebhook === 'incomingMessageReceived' || // Green API
            typeWebhook === 'message'; // WAHA
        if (!isInboundMessage)
            return;
        // ── Extract idInstance (Green API) or sessionName (WAHA) ─────────────
        const idInstance = body === null || body === void 0 ? void 0 : body.idInstance;
        const sessionName = body === null || body === void 0 ? void 0 : body.session;
        // ── Find the agency ───────────────────────────────────────────────────
        let agencyId;
        if (idInstance) {
            const snap = await db.collectionGroup('private_credentials')
                .where('idInstance', '==', idInstance)
                .limit(1).get();
            if (!snap.empty) {
                agencyId = (_a = snap.docs[0].ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
            }
        }
        else if (sessionName) {
            const snap = await db.collection('agencies')
                .where('whatsappIntegration.sessionName', '==', sessionName)
                .limit(1).get();
            if (!snap.empty)
                agencyId = snap.docs[0].id;
        }
        if (!agencyId) {
            console.log('Webhook: No agency found for this instance/session. Ignored.');
            return;
        }
        // ── Extract sender and message text ────────────────────────────────────
        const senderData = (body === null || body === void 0 ? void 0 : body.senderData) || {};
        const messageData = (body === null || body === void 0 ? void 0 : body.messageData) || {};
        // Determine chat type and actual sender
        const chatId = senderData.chatId || '';
        const isGroup = chatId.endsWith('@g.us');
        const isDirect = chatId.endsWith('@c.us');
        // Real sender is the person who sent the message (in a group, it's senderData.sender. In direct, it's the chatId itself)
        const rawSender = senderData.sender || chatId || '';
        const textMessage = ((_b = messageData.textMessageData) === null || _b === void 0 ? void 0 : _b.textMessage) || '';
        const idMessage = body === null || body === void 0 ? void 0 : body.idMessage;
        if (!rawSender || !textMessage)
            return;
        // ── Normalise phone ─────────────────────────────────────────────────────
        let cleanPhone = rawSender.replace('@c.us', '');
        if (cleanPhone.startsWith('972'))
            cleanPhone = '0' + cleanPhone.substring(3);
        // ============================================================================
        // 1. B2B GROUP MESSAGES (Property Hunting)
        // ============================================================================
        if (isGroup) {
            const propertyKeywords = ['למכירה', 'להשכרה', 'נכס', 'דירה', 'מ"ר', 'חדרים', 'מחיר'];
            const textLower = textMessage.toLowerCase();
            // Basic heuristic: must contain at least two property-related words
            const matches = propertyKeywords.filter(kw => textLower.includes(kw));
            if (matches.length >= 2) {
                // Create draft property
                await db.collection('properties').add({
                    agencyId,
                    source: 'whatsapp_group',
                    groupId: chatId,
                    externalAgentPhone: cleanPhone,
                    rawDescription: textMessage,
                    status: 'draft', // Waiting for manual approval
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Webhook: Parsed draft property from group ${chatId} by ${cleanPhone}`);
            }
            return; // Done with group message
        }
        // ============================================================================
        // 2. DIRECT MESSAGES (Smart Lead Detection)
        // ============================================================================
        if (isDirect) {
            // ── Find existing lead ───────────────────────────────────────────────────
            const leadsSnap = await db.collection('leads')
                .where('agencyId', '==', agencyId)
                .where('phone', '==', cleanPhone)
                .limit(1).get();
            if (leadsSnap.empty) {
                // Unknown number - scan for lead keywords
                const leadKeywords = ['נכס', 'דירה', 'מחיר', 'למכירה', 'להשכרה', 'פרטים', 'תיווך'];
                const textLower = textMessage.toLowerCase();
                const hasKeyword = leadKeywords.some(kw => textLower.includes(kw));
                if (!hasKeyword) {
                    console.log(`Webhook: Ignored spam/irrelevant DM from ${cleanPhone}`);
                    return;
                }
                // Check for existing pending lead to avoid duplicates
                const pendingSnap = await db.collection('pending_leads')
                    .where('agencyId', '==', agencyId)
                    .where('phone', '==', cleanPhone)
                    .limit(1).get();
                if (pendingSnap.empty) {
                    // Calculate exactly 14 days from now as a proper Firestore Timestamp for TTL
                    const expireDate = new Date();
                    expireDate.setDate(expireDate.getDate() + 14);
                    const expiresAt = admin.firestore.Timestamp.fromDate(expireDate);
                    await db.collection('pending_leads').add({
                        agencyId,
                        phone: cleanPhone,
                        initialMessage: textMessage,
                        status: 'pending',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        expiresAt: expiresAt, // Native TTL policy field
                    });
                    console.log(`Webhook: New pending lead created for ${cleanPhone}`);
                    // Create notification for the agency
                    await db.collection('alerts').add({
                        agencyId,
                        targetAgentId: 'all', // Send to everyone in the agency
                        type: 'new_pending_lead',
                        title: 'ליד חדש זוהה מ-WhatsApp',
                        message: `הודעה חדשה ממספר לא מוכר (${cleanPhone}) ממתינה לאישורך.`,
                        isRead: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        link: '/dashboard/leads?tab=pending'
                    });
                }
                return;
            }
            // Existing lead - save message to their thread
            const leadId = leadsSnap.docs[0].id;
            // ── Idempotency ─────────────────────────────────────────────────────────
            if (idMessage) {
                const dup = await db.collection(`leads/${leadId}/messages`)
                    .where('idMessage', '==', idMessage).limit(1).get();
                if (!dup.empty) {
                    console.log('Webhook: duplicate message ignored');
                    return;
                }
            }
            await db.collection(`leads/${leadId}/messages`).add({
                idMessage: idMessage || null,
                text: textMessage,
                direction: 'inbound',
                senderPhone: cleanPhone,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: false,
            });
            console.log(`Webhook: message routed to lead ${leadId}`);
        }
    }
    catch (err) {
        console.error('Webhook fatal error:', err);
    }
});
//# sourceMappingURL=whatsapp.js.map