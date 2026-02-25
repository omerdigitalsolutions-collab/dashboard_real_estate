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
exports.whatsappWebhook = exports.disconnectWhatsApp = exports.sendWhatsappMessage = exports.checkWhatsAppStatus = exports.generateWhatsAppQR = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
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
// ─── 1. generateWhatsAppQR ───────────────────────────────────────────────────
/**
 * Called by the frontend when the user clicks "Connect WhatsApp".
 * Creates / restarts a WAHA session (or fetches QR from Green API) and
 * returns ONLY the QR code string — never any tokens.
 */
exports.generateWhatsAppQR = (0, https_1.onCall)({ region: REGION }, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const wahaBase = getWahaBaseUrl();
    const masterKey = process.env.WAHA_MASTER_KEY;
    // ── Green API mode (no master key) ───────────────────────────────────────
    if (!masterKey) {
        const wa = await getAgencyWhatsApp(agencyId);
        const idInstance = wa === null || wa === void 0 ? void 0 : wa.idInstance;
        const apiToken = wa === null || wa === void 0 ? void 0 : wa.apiTokenInstance;
        if (!idInstance || !apiToken) {
            throw new https_1.HttpsError('failed-precondition', 'Green API credentials not configured for this agency. Contact support.');
        }
        const url = `${wahaBase}/waInstance${idInstance}/qr/${apiToken}`;
        const resp = await axios_1.default.get(url);
        if (((_a = resp.data) === null || _a === void 0 ? void 0 : _a.type) !== 'qrCode') {
            throw new https_1.HttpsError('internal', 'Green API did not return a QR code.');
        }
        await db.collection('agencies').doc(agencyId).set({ whatsappIntegration: { status: 'pending', updatedAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
        return { qrCode: resp.data.message };
    }
    // ── WAHA self-hosted mode ─────────────────────────────────────────────────
    const sessionName = `agency_${agencyId}`;
    // Stop existing session silently (ignore errors — might not exist yet)
    try {
        await axios_1.default.post(`${wahaBase}/api/sessions/stop`, { name: sessionName }, {
            headers: { Authorization: `Bearer ${masterKey}` }
        });
    }
    catch (_) { /* ignore */ }
    // Start (or restart) session
    await axios_1.default.post(`${wahaBase}/api/sessions/start`, {
        name: sessionName,
        config: { webhooks: [] } // webhooks configured separately on WAHA side
    }, { headers: { Authorization: `Bearer ${masterKey}` } });
    // Poll for QR (WAHA takes a few seconds to produce it)
    let qrCode = null;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
            const statusResp = await axios_1.default.get(`${wahaBase}/api/sessions/${sessionName}/qr`, {
                headers: { Authorization: `Bearer ${masterKey}` }
            });
            if ((_b = statusResp.data) === null || _b === void 0 ? void 0 : _b.value) {
                qrCode = statusResp.data.value;
                break;
            }
        }
        catch (_) { /* not ready yet */ }
    }
    if (!qrCode)
        throw new https_1.HttpsError('deadline-exceeded', 'QR code took too long to generate. Try again.');
    // Persist session name (not the key!) in Firestore
    await db.collection('agencies').doc(agencyId).set({
        whatsappIntegration: {
            sessionName,
            status: 'pending',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
    }, { merge: true });
    return { qrCode };
});
// ─── 2. checkWhatsAppStatus ──────────────────────────────────────────────────
/**
 * Polled every 5 sec by the frontend QR modal until status is 'connected'.
 * Updates the agency Firestore doc and returns the current status.
 */
exports.checkWhatsAppStatus = (0, https_1.onCall)({ region: REGION }, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const wa = await getAgencyWhatsApp(agencyId);
    if (!wa)
        return { status: 'disconnected' };
    const masterKey = process.env.WAHA_MASTER_KEY;
    // ── Green API mode ────────────────────────────────────────────────────────
    if (!masterKey) {
        const idInstance = wa.idInstance;
        const apiToken = wa.apiTokenInstance;
        if (!idInstance || !apiToken)
            return { status: 'disconnected' };
        const wahaBase = getWahaBaseUrl();
        const resp = await axios_1.default.get(`${wahaBase}/waInstance${idInstance}/getStateInstance/${apiToken}`);
        const state = ((_a = resp.data) === null || _a === void 0 ? void 0 : _a.stateInstance) || 'notAuthorized';
        const connected = state === 'authorized';
        if (connected && wa.status !== 'connected') {
            await db.collection('agencies').doc(agencyId).set({ whatsappIntegration: { status: 'connected', updatedAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
        }
        return { status: connected ? 'connected' : wa.status || 'pending' };
    }
    // ── WAHA self-hosted mode ────────────────────────────────────────────────
    const wahaBase = getWahaBaseUrl();
    const sessionName = wa.sessionName;
    if (!sessionName)
        return { status: 'disconnected' };
    const resp = await axios_1.default.get(`${wahaBase}/api/sessions/${sessionName}`, {
        headers: { Authorization: `Bearer ${masterKey}` }
    });
    const rawStatus = ((_b = resp.data) === null || _b === void 0 ? void 0 : _b.status) || 'STOPPED';
    const connected = ['WORKING', 'CONNECTED', 'AUTHORIZED'].includes(rawStatus.toUpperCase());
    if (connected && wa.status !== 'connected') {
        await db.collection('agencies').doc(agencyId).set({ whatsappIntegration: { status: 'connected', updatedAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
    }
    return { status: connected ? 'connected' : wa.status || 'pending' };
});
// ─── 3. sendWhatsappMessage ──────────────────────────────────────────────────
/**
 * Secure message dispatch. Frontend sends only { phone, message } — never any tokens.
 * The function resolves the agency's WAHA credentials server-side.
 */
exports.sendWhatsappMessage = (0, https_1.onCall)({ region: REGION }, async (request) => {
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
    const wahaBase = getWahaBaseUrl();
    const masterKey = process.env.WAHA_MASTER_KEY;
    const chatId = toWaId(phone);
    // ── Green API mode ────────────────────────────────────────────────────────
    if (!masterKey) {
        const idInstance = wa.idInstance;
        const apiToken = wa.apiTokenInstance;
        await axios_1.default.post(`${wahaBase}/waInstance${idInstance}/sendMessage/${apiToken}`, { chatId, message });
        return { success: true };
    }
    // ── WAHA self-hosted mode ─────────────────────────────────────────────────
    const sessionName = wa.sessionName;
    if (!sessionName)
        throw new https_1.HttpsError('failed-precondition', 'Session not found.');
    await axios_1.default.post(`${wahaBase}/api/sendText`, {
        session: sessionName,
        chatId,
        text: message,
    }, { headers: { Authorization: `Bearer ${masterKey}` } });
    return { success: true };
});
// ─── 4. disconnectWhatsApp ───────────────────────────────────────────────────
exports.disconnectWhatsApp = (0, https_1.onCall)({ region: REGION }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const wa = await getAgencyWhatsApp(agencyId);
    const masterKey = process.env.WAHA_MASTER_KEY;
    if (masterKey && (wa === null || wa === void 0 ? void 0 : wa.sessionName)) {
        const wahaBase = getWahaBaseUrl();
        try {
            await axios_1.default.post(`${wahaBase}/api/sessions/stop`, { name: wa.sessionName }, {
                headers: { Authorization: `Bearer ${masterKey}` }
            });
        }
        catch (_) { /* ignore */ }
    }
    await db.collection('agencies').doc(agencyId).set({ whatsappIntegration: { status: 'disconnected', updatedAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
    return { success: true };
});
// ─── 5. whatsappWebhook ───────────────────────────────────────────────────────
/**
 * Central inbound webhook — receives messages from Green API / WAHA.
 * Set this URL in your WAHA dashboard or in each Green API instance settings.
 *
 * Security: validates X-Webhook-Secret header against WAHA_WEBHOOK_SECRET env var.
 */
exports.whatsappWebhook = (0, https_1.onRequest)({ region: REGION }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
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
            const snap = await db.collection('agencies')
                .where('whatsappIntegration.idInstance', '==', idInstance)
                .limit(1).get();
            if (!snap.empty)
                agencyId = snap.docs[0].id;
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
        const rawSender = ((_a = body === null || body === void 0 ? void 0 : body.senderData) === null || _a === void 0 ? void 0 : _a.sender) || // Green API
            ((_b = body === null || body === void 0 ? void 0 : body.payload) === null || _b === void 0 ? void 0 : _b.from) || // WAHA
            '';
        const textMessage = ((_d = (_c = body === null || body === void 0 ? void 0 : body.messageData) === null || _c === void 0 ? void 0 : _c.textMessageData) === null || _d === void 0 ? void 0 : _d.textMessage) || // Green API
            ((_e = body === null || body === void 0 ? void 0 : body.payload) === null || _e === void 0 ? void 0 : _e.body) || // WAHA
            '';
        const idMessage = (body === null || body === void 0 ? void 0 : body.idMessage) || ((_f = body === null || body === void 0 ? void 0 : body.payload) === null || _f === void 0 ? void 0 : _f.id);
        if (!rawSender || !textMessage)
            return;
        // ── Normalise phone ─────────────────────────────────────────────────────
        let cleanPhone = rawSender.replace('@c.us', '');
        if (cleanPhone.startsWith('972'))
            cleanPhone = '0' + cleanPhone.substring(3);
        // ── Find lead ───────────────────────────────────────────────────────────
        const leadsSnap = await db.collection('leads')
            .where('agencyId', '==', agencyId)
            .where('phone', '==', cleanPhone)
            .limit(1).get();
        if (leadsSnap.empty) {
            console.log(`Webhook: No lead for phone ${cleanPhone} in agency ${agencyId}`);
            return;
        }
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
        // ── Save inbound message ─────────────────────────────────────────────────
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
    catch (err) {
        console.error('Webhook fatal error:', err);
    }
});
//# sourceMappingURL=whatsapp.js.map