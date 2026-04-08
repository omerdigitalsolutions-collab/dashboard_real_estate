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
exports.whatsappWebhook = exports.disconnectWhatsApp = exports.getGroups = exports.syncLeadChat = exports.sendWhatsappMessage = exports.checkWhatsAppStatus = exports.generateWhatsAppQR = exports.disconnectAgencyWhatsApp = exports.connectAgencyWhatsApp = void 0;
exports.sendSystemWhatsappMessage = sendSystemWhatsappMessage;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const featureGuard_1 = require("./config/featureGuard");
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
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
 * removes it from the pool, then immediately fetches and returns the QR code.
 *
 * The agency status is set to PENDING_SCAN until the user scans the QR.
 * Only checkWhatsAppStatus (called by the frontend poller) will update it to CONNECTED.
 */
exports.connectAgencyWhatsApp = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: [masterKey],
}, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const credsRef = db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp');
    const agencyRef = db.collection('agencies').doc(agencyId);
    // Check if agency already has keys in the private vault
    const credsDoc = await credsRef.get();
    const existingInstance = credsDoc.exists && ((_a = credsDoc.data()) === null || _a === void 0 ? void 0 : _a.idInstance) ? credsDoc.data().idInstance : null;
    // If already CONNECTED in Firestore, block re-allocation
    const agencyDoc = await agencyRef.get();
    const currentStatus = (_d = (_c = (_b = agencyDoc.data()) === null || _b === void 0 ? void 0 : _b.whatsappIntegration) === null || _c === void 0 ? void 0 : _c.status) === null || _d === void 0 ? void 0 : _d.toUpperCase();
    if (currentStatus === 'CONNECTED' && ((_e = agencyDoc.data()) === null || _e === void 0 ? void 0 : _e.isWhatsappConnected) === true) {
        throw new https_1.HttpsError('already-exists', 'WhatsApp is already connected. Disconnect first.');
    }
    let instanceId;
    let instanceToken;
    if (existingInstance) {
        // Instance already allocated (PENDING_SCAN state) — reuse it without touching the pool
        console.log(`[WhatsApp] Reusing already-allocated instance ${existingInstance} for agency ${agencyId}`);
        const creds = await getGreenApiCredentials(agencyId, masterKey.value());
        if (!(creds === null || creds === void 0 ? void 0 : creds.idInstance) || !(creds === null || creds === void 0 ? void 0 : creds.apiTokenInstance)) {
            throw new https_1.HttpsError('internal', 'Could not decrypt existing instance credentials.');
        }
        instanceId = creds.idInstance;
        instanceToken = creds.apiTokenInstance;
    }
    else {
        // Allocate a new instance from the pool
        const availableSnap = await db.collection('available_instances').limit(1).get();
        if (availableSnap.empty) {
            throw new https_1.HttpsError('resource-exhausted', 'No available WhatsApp instances at the moment. Please contact support.');
        }
        const instanceDoc = availableSnap.docs[0];
        const instanceData = instanceDoc.data();
        instanceId = instanceData.idInstance;
        instanceToken = instanceData.apiTokenInstance;
        // Encrypt the token
        const { encryptedToken, iv } = encryptToken(instanceToken, masterKey.value());
        // ✅ FIX 1: FieldValue.delete() is NOT allowed inside set({}, {merge:true}).
        //           We use set() for new fields, then update() separately for deletions.
        await db.runTransaction(async (t) => {
            t.set(credsRef, {
                idInstance: instanceId,
                encryptedToken,
                iv,
                assignedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Set only new/updated fields — no FieldValue.delete() here
            t.set(agencyRef, {
                whatsappIntegration: {
                    status: 'PENDING_SCAN',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }
            }, { merge: true });
            // Separate update() call to safely delete legacy greenApiKeys field
            t.update(agencyRef, {
                greenApiKeys: admin.firestore.FieldValue.delete()
            });
            t.delete(instanceDoc.ref);
        });
        console.log(`[WhatsApp] Allocated new instance ${instanceId} to agency ${agencyId}`);
    }
    // Now fetch the QR code immediately so the frontend only needs ONE call
    const qrUrl = `https://7105.api.greenapi.com/waInstance${instanceId}/qr/${instanceToken}`;
    try {
        console.log(`[WhatsApp] Fetching QR for instance ${instanceId}...`);
        const resp = await axios_1.default.get(qrUrl, { timeout: 40000 });
        if (((_f = resp.data) === null || _f === void 0 ? void 0 : _f.type) === 'alreadyLogged') {
            // Instance is already authorised — mark as connected immediately
            await db.collection('agencies').doc(agencyId).set({
                isWhatsappConnected: true,
                whatsappIntegration: {
                    status: 'CONNECTED',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
            }, { merge: true });
            return { success: true, alreadyConnected: true, qrCode: null };
        }
        if (((_g = resp.data) === null || _g === void 0 ? void 0 : _g.type) !== 'qrCode' || !((_h = resp.data) === null || _h === void 0 ? void 0 : _h.message)) {
            throw new https_1.HttpsError('internal', `Green API unexpected response: ${JSON.stringify(resp.data)}`);
        }
        // ✅ FIX 3: Return fetchedAt so the frontend can calculate QR TTL (~20s)
        //           and trigger a refresh before it expires.
        return {
            success: true,
            alreadyConnected: false,
            qrCode: resp.data.message,
            fetchedAt: Date.now(),
        };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', `Failed to fetch QR: ${err.message}`);
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
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const credsRef = db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp');
    const agencyRef = db.collection('agencies').doc(agencyId);
    let keys = await getGreenApiCredentials(agencyId, masterKey.value());
    const agencyDoc = await agencyRef.get();
    const legacyKeys = (_a = agencyDoc.data()) === null || _a === void 0 ? void 0 : _a.greenApiKeys;
    // Fallback: If no encrypted keys exist, check if the agency has legacy plain-text keys
    if (!keys && (legacyKeys === null || legacyKeys === void 0 ? void 0 : legacyKeys.idInstance) && (legacyKeys === null || legacyKeys === void 0 ? void 0 : legacyKeys.apiTokenInstance)) {
        keys = {
            idInstance: legacyKeys.idInstance,
            apiTokenInstance: legacyKeys.apiTokenInstance
        };
    }
    if (!(keys === null || keys === void 0 ? void 0 : keys.idInstance) || !(keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        // If credentials are already missing but the agency doc still has metadata, clear it anyway
        if (((_b = agencyDoc.data()) === null || _b === void 0 ? void 0 : _b.whatsappIntegration) || legacyKeys) {
            await agencyRef.update({
                isWhatsappConnected: false,
                whatsappIntegration: admin.firestore.FieldValue.delete(),
                greenApiKeys: admin.firestore.FieldValue.delete()
            });
            // CRITICAL: Always delete the private credentials doc to allow reconnecting
            await credsRef.delete();
            return { success: true, message: 'Cleaned up agency metadata and private credentials (keys were missing/invalid).' };
        }
        throw new https_1.HttpsError('not-found', 'No encrypted instance allocated to this agency.');
    }
    // 1. Send LogOut to Green API to clear the current WhatsApp session
    try {
        await axios_1.default.get(`https://7105.api.greenapi.com/waInstance${keys.idInstance}/LogOut/${keys.apiTokenInstance}`, { timeout: 10000 });
        console.log(`[WhatsApp] Logged out instance ${keys.idInstance}`);
    }
    catch (err) {
        console.warn(`[WhatsApp] Failed to cleanly logout instance ${keys.idInstance}:`, err === null || err === void 0 ? void 0 : err.message);
        // Continue anyway to recycle it
    }
    // 2. Transaction: Return to pool, remove from private subcollection and agency doc
    // NOTE: FieldValue.delete() is NOT allowed inside set({}, {merge:true}).
    //       We must use update() for fields we want to delete, and set() only for new data.
    try {
        await db.runTransaction(async (t) => {
            // Return plain-text keys to the pool (idInstance as doc ID ensures uniqueness)
            const poolRef = db.collection('available_instances').doc(keys.idInstance);
            t.set(poolRef, {
                idInstance: keys.idInstance,
                apiTokenInstance: keys.apiTokenInstance,
                returnedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            // Delete the private credentials sub-document
            t.delete(credsRef);
            // Clear the agency doc: update() correctly supports FieldValue.delete()
            t.update(agencyRef, {
                isWhatsappConnected: false,
                whatsappIntegration: admin.firestore.FieldValue.delete(),
                greenApiKeys: admin.firestore.FieldValue.delete()
            });
        });
        console.log(`[WhatsApp] Instance ${keys.idInstance} successfully returned to pool for agency ${agencyId}`);
        return { success: true, message: 'Disconnected and safely returned instance to pool.' };
    }
    catch (err) {
        console.error('[WhatsApp] Failed to disconnect/recycle instance:', err);
        throw new https_1.HttpsError('internal', `Internal error while recycling instance: ${(err === null || err === void 0 ? void 0 : err.message) || 'unknown'}`);
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
    secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY', masterKey],
}, async (request) => {
    var _a, _b, _c;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    // 1. Try Green API Credentials first
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if ((keys === null || keys === void 0 ? void 0 : keys.idInstance) && (keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        const qrUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/qr/${keys.apiTokenInstance}`;
        try {
            console.log(`[WhatsApp] Fetching Green API QR for instance ${keys.idInstance}...`);
            const resp = await axios_1.default.get(qrUrl, { timeout: 40000 });
            // ✅ FIX 2: Instead of throwing, gracefully handle alreadyLogged
            //           and return a success response — consistent with connectAgencyWhatsApp.
            if (((_a = resp.data) === null || _a === void 0 ? void 0 : _a.type) === 'alreadyLogged') {
                await db.collection('agencies').doc(agencyId).set({
                    isWhatsappConnected: true,
                    whatsappIntegration: {
                        status: 'CONNECTED',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    },
                }, { merge: true });
                return { qrCode: null, alreadyConnected: true };
            }
            if (((_b = resp.data) === null || _b === void 0 ? void 0 : _b.type) !== 'qrCode' || !((_c = resp.data) === null || _c === void 0 ? void 0 : _c.message)) {
                throw new https_1.HttpsError('internal', `Green API unexpected response: ${JSON.stringify(resp.data)}`);
            }
            await updateStatus(agencyId, 'PENDING_SCAN');
            // ✅ FIX 3: Return fetchedAt timestamp so frontend can manage QR TTL
            return {
                qrCode: resp.data.message,
                alreadyConnected: false,
                fetchedAt: Date.now(),
            };
        }
        catch (err) {
            console.error('[WhatsApp] Green API QR fetch failed:', err.message);
            if (err instanceof https_1.HttpsError)
                throw err;
            throw new https_1.HttpsError('internal', `Failed to fetch QR from Green API: ${err.message}. Try again or check instance status.`);
        }
    }
    // 2. Try WAHA
    const baseUrl = process.env.WAHA_BASE_URL;
    if (baseUrl) {
        const sessionName = `agency_${agencyId}`;
        const qrUrl = `${baseUrl.replace(/\/$/, '')}/api/${sessionName}/auth/qr`;
        try {
            const headers = {};
            if (process.env.WAHA_MASTER_KEY)
                headers['Authorization'] = `Bearer ${process.env.WAHA_MASTER_KEY}`;
            const resp = await axios_1.default.get(qrUrl, { headers, responseType: 'arraybuffer', timeout: 40000 });
            // WAHA returns a PNG image for QR. We convert it to base64.
            const base64 = Buffer.from(resp.data, 'binary').toString('base64');
            const dataUrl = `data:image/png;base64,${base64}`;
            await updateStatus(agencyId, 'PENDING_SCAN');
            // ✅ FIX 3: Include fetchedAt for WAHA too
            return { qrCode: dataUrl, alreadyConnected: false, fetchedAt: Date.now() };
        }
        catch (err) {
            console.error('[WhatsApp] WAHA QR fetch failed:', err.message);
            throw new https_1.HttpsError('internal', `Failed to fetch QR from WAHA: ${err.message}`);
        }
    }
    throw new https_1.HttpsError('failed-precondition', 'No WhatsApp instance allocated. Call connectAgencyWhatsApp first.');
});
async function updateStatus(agencyId, status) {
    await db.collection('agencies').doc(agencyId).set({
        whatsappIntegration: {
            status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
    }, { merge: true });
}
// ─── 2. checkWhatsAppStatus ──────────────────────────────────────────────────
/**
 * Checks WhatsApp status cleanly reading keys from the dynamically assigned greenApiKeys
 */
exports.checkWhatsAppStatus = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: [masterKey],
}, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if (!(keys === null || keys === void 0 ? void 0 : keys.idInstance) || !(keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        return { status: 'DISCONNECTED' };
    }
    const statusUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getStateInstance/${keys.apiTokenInstance}`;
    console.log(`[WhatsApp Status Check] Agency: ${agencyId}, Instance: ${keys.idInstance}`);
    try {
        const resp = await axios_1.default.get(statusUrl, { timeout: 10000 });
        const state = (_a = resp.data) === null || _a === void 0 ? void 0 : _a.stateInstance;
        console.log(`[WhatsApp Status Check] Green API response state: ${state}`);
        let mappedStatus = 'DISCONNECTED';
        if (state === 'authorized')
            mappedStatus = 'CONNECTED';
        else if (state === 'notAuthorized' || state === 'starting' || state === 'online')
            mappedStatus = 'PENDING_SCAN';
        else if (state === 'blocked')
            mappedStatus = 'BLOCKED';
        // Update the agency doc if status changed
        const currentStatus = (_c = (_b = agencyDoc.data()) === null || _b === void 0 ? void 0 : _b.whatsappIntegration) === null || _c === void 0 ? void 0 : _c.status;
        if (currentStatus !== mappedStatus) {
            console.log(`[WhatsApp Status Check] Status changing from ${currentStatus} to ${mappedStatus}`);
            if (mappedStatus === 'CONNECTED') {
                // ✅ FIX 4: Fetch and persist the connected phone number when status becomes CONNECTED
                let connectedPhone = null;
                try {
                    const infoUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getWaSettings/${keys.apiTokenInstance}`;
                    const infoResp = await axios_1.default.get(infoUrl, { timeout: 8000 });
                    // Green API returns the phone in wid field e.g. "972501234567@c.us"
                    const rawWid = ((_d = infoResp.data) === null || _d === void 0 ? void 0 : _d.wid) || '';
                    connectedPhone = rawWid.replace('@c.us', '') || null;
                    console.log(`[WhatsApp Status Check] Connected phone: ${connectedPhone}`);
                }
                catch (e) {
                    console.warn('[WhatsApp Status Check] Could not fetch connected phone number:', e);
                }
                await db.collection('agencies').doc(agencyId).set({
                    isWhatsappConnected: true,
                    whatsappIntegration: {
                        status: 'CONNECTED',
                        connectedPhone, // ← stored for UI display e.g. "+972501234567"
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    },
                }, { merge: true });
            }
            else {
                await db.collection('agencies').doc(agencyId).set({
                    isWhatsappConnected: mappedStatus === 'CONNECTED',
                    whatsappIntegration: {
                        status: mappedStatus,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    },
                }, { merge: true });
            }
        }
        return { status: mappedStatus, greenApiState: state };
    }
    catch (err) {
        console.warn(`[WhatsApp Status Check] Network/timeout issue: ${err.message}`, (_e = err.response) === null || _e === void 0 ? void 0 : _e.data);
        return { status: ((_g = (_f = agencyDoc.data()) === null || _f === void 0 ? void 0 : _f.whatsappIntegration) === null || _g === void 0 ? void 0 : _g.status) || 'PENDING_SCAN' };
    }
});
// ─── 3. sendWhatsappMessage ──────────────────────────────────────────────────
const whatsappService_1 = require("./whatsappService");
/**
 * Secure message dispatch. Frontend sends only { phone, message } — never any tokens.
 * The function resolves the agency's WAHA credentials server-side.
 */
exports.sendWhatsappMessage = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY', masterKey]
}, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const { phone, message, isBroadcast, fileUrl, fileName } = request.data;
    if (!phone || !message)
        throw new https_1.HttpsError('invalid-argument', 'phone and message are required.');
    // Check feature guard if it's a broadcast
    if (isBroadcast) {
        await (0, featureGuard_1.requireFeatureAccess)(request, 'WHATSAPP_BROADCAST');
    }
    const agencyId = await getAgencyId(request.auth.uid);
    const wa = await getAgencyWhatsApp(agencyId);
    if (!wa || ((_a = wa.status) === null || _a === void 0 ? void 0 : _a.toUpperCase()) !== 'CONNECTED') {
        throw new https_1.HttpsError('failed-precondition', 'WhatsApp is not connected. Please connect first in Settings.');
    }
    // ── Green API mode via dynamic keys ───────────────────────────────────────────────────────
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if ((keys === null || keys === void 0 ? void 0 : keys.idInstance) && (keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        if (fileUrl) {
            const sendFileUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/sendFileByUrl/${keys.apiTokenInstance}`;
            await axios_1.default.post(sendFileUrl, {
                chatId: toWaId(phone),
                urlFile: fileUrl,
                fileName: fileName || 'file',
                caption: message
            }, { timeout: 20000 });
            console.log(`[Green API] File message sent to ${phone}`);
        }
        else {
            const sendUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/sendMessage/${keys.apiTokenInstance}`;
            await axios_1.default.post(sendUrl, {
                chatId: toWaId(phone),
                message: message
            }, { timeout: 10000 });
            console.log(`[Green API] Message sent to ${phone}`);
        }
        return { success: true };
    }
    throw new https_1.HttpsError('failed-precondition', 'Session not found.');
});
/**
 * Raw helper for sending system alerts (from cron jobs, webhooks, etc)
 * using the Super Admin's GreenAPI credentials directly.
 */
async function sendSystemWhatsappMessage(phone, message, masterSecret) {
    try {
        // 1. Find the Super Admin agency to use its WhatsApp connection
        const usersSnap = await db.collection('users').where('email', '==', 'omerdigitalsolutions@gmail.com').limit(1).get();
        if (usersSnap.empty) {
            console.error('[System WhatsApp] Could not find Super Admin user.');
            return false;
        }
        const superAdminAgencyId = usersSnap.docs[0].data().agencyId;
        if (!superAdminAgencyId)
            return false;
        // 2. Fetch the Green API credentials for the Super Admin agency
        const keys = await getGreenApiCredentials(superAdminAgencyId, masterSecret);
        if (!(keys === null || keys === void 0 ? void 0 : keys.idInstance) || !(keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
            console.error('[System WhatsApp] Super Admin WhatsApp is not connected.');
            return false;
        }
        // 3. Send the message
        const sendUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/sendMessage/${keys.apiTokenInstance}`;
        await axios_1.default.post(sendUrl, {
            chatId: toWaId(phone),
            message: message
        }, { timeout: 10000 });
        return true;
    }
    catch (err) {
        console.error('[System WhatsApp] Error sending message:', err.message);
        return false;
    }
}
exports.syncLeadChat = (0, https_1.onCall)({
    region: REGION,
    secrets: [masterKey]
}, async (request) => {
    const { agencyId, leadId, phone } = request.data;
    if (!agencyId || !leadId || !phone) {
        throw new https_1.HttpsError('invalid-argument', 'Missing parameters');
    }
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if (!(keys === null || keys === void 0 ? void 0 : keys.idInstance) || !(keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        throw new https_1.HttpsError('failed-precondition', 'WhatsApp is not connected.');
    }
    // Import locally to avoid circular dependencies if any
    const { syncChatHistory } = require('./whatsappService');
    await syncChatHistory(db, agencyId, leadId, phone, keys, 15);
    return { success: true };
});
/**
 * 5. getGroups:
 * Fetches the list of all contacts (including groups) and filters for groups.
 */
exports.getGroups = (0, https_1.onCall)({
    region: REGION,
    cors: true,
    secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY', masterKey],
}, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Must be logged in.');
    const agencyId = await getAgencyId(request.auth.uid);
    // 1. Try Green API Credentials first (Instance mode)
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if ((keys === null || keys === void 0 ? void 0 : keys.idInstance) && (keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        const contactsUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getContacts/${keys.apiTokenInstance}`;
        const chatsUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getChats/${keys.apiTokenInstance}`;
        try {
            console.log(`[WhatsApp] Fetching contacts & chats for agency ${agencyId}...`);
            // Parallel fetch for speed
            const [contactsResp, chatsResp] = await Promise.allSettled([
                axios_1.default.get(contactsUrl, { timeout: 15000 }),
                axios_1.default.get(chatsUrl, { timeout: 15000 })
            ]);
            const allGroupsMap = new Map();
            // Process Contacts
            if (contactsResp.status === 'fulfilled' && Array.isArray(contactsResp.value.data)) {
                console.log(`[WhatsApp] Contacts fetched: ${contactsResp.value.data.length}`);
                contactsResp.value.data.forEach((c) => {
                    const rawId = c.id || c.chatId;
                    const isGroup = c.type === 'group' || (rawId && rawId.endsWith('@g.us'));
                    if (isGroup && rawId) {
                        allGroupsMap.set(rawId, { id: rawId, name: c.name || rawId.split('@')[0] });
                    }
                });
            }
            else if (contactsResp.status === 'rejected') {
                console.error(`[WhatsApp] Contacts fetch failed:`, (_a = contactsResp.reason) === null || _a === void 0 ? void 0 : _a.message);
            }
            // Process Chats (often contains more recent groups even if unsaved)
            if (chatsResp.status === 'fulfilled' && Array.isArray(chatsResp.value.data)) {
                console.log(`[WhatsApp] Chats fetched: ${chatsResp.value.data.length}`);
                chatsResp.value.data.forEach((c) => {
                    var _a;
                    if ((_a = c.chatId) === null || _a === void 0 ? void 0 : _a.endsWith('@g.us')) {
                        allGroupsMap.set(c.chatId, {
                            id: c.chatId,
                            name: c.name || c.chatId.split('@')[0]
                        });
                    }
                });
            }
            else if (chatsResp.status === 'rejected') {
                console.error(`[WhatsApp] Chats fetch failed:`, (_b = chatsResp.reason) === null || _b === void 0 ? void 0 : _b.message);
            }
            const groups = Array.from(allGroupsMap.values());
            console.log(`[WhatsApp] Final unique groups count: ${groups.length}`);
            return {
                success: true,
                groups
            };
        }
        catch (err) {
            console.error('[WhatsApp] Green API getGroups failed:', err.message);
            // Fall through...
        }
    }
    // 2. Try WAHA (Session mode)
    const baseUrl = process.env.WAHA_BASE_URL;
    const masterKeyVal = process.env.WAHA_MASTER_KEY;
    if (baseUrl) {
        const sessionName = `agency_${agencyId}`;
        const chatsUrl = `${baseUrl.replace(/\/$/, '')}/api/chats?session=${sessionName}`;
        try {
            const headers = {};
            if (masterKeyVal)
                headers['Authorization'] = `Bearer ${masterKeyVal}`;
            const resp = await axios_1.default.get(chatsUrl, { headers, timeout: 20000 });
            const chats = resp.data;
            if (!Array.isArray(chats))
                throw new Error('Invalid format');
            return {
                success: true,
                groups: chats
                    .filter((c) => { var _a; return ((_a = c.id) === null || _a === void 0 ? void 0 : _a.server) === 'g.us' || c.isGroup === true; })
                    .map((c) => {
                    var _a, _b;
                    return ({
                        id: ((_a = c.id) === null || _a === void 0 ? void 0 : _a.id) || c.id || '',
                        name: c.name || ((_b = c.id) === null || _b === void 0 ? void 0 : _b.user) || 'קבוצה ללא שם'
                    });
                })
            };
        }
        catch (err) {
            console.error('[WhatsApp] WAHA getGroups failed:', err.message);
        }
    }
    throw new https_1.HttpsError('failed-precondition', 'WhatsApp connection details not found.');
});
// ─── 6. disconnectWhatsApp ───────────────────────────────────────────────────
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
    secrets: ['WAHA_WEBHOOK_SECRET', geminiApiKey]
}, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    // Always ACK first to prevent retries
    const secret = req.headers['x-webhook-secret'] || req.headers['x-greenapi-webhook-secret'] || '';
    const expected = process.env.WAHA_WEBHOOK_SECRET || '';
    if (!expected || secret !== expected) {
        console.error(`Webhook: Unauthorized access attempt. Incoming secret: '${secret}'.`);
        res.status(401).send('Unauthorized');
        return;
    }
    // ACK only after authorization check
    res.status(200).send('OK');
    console.log(`Webhook: Authorized request.`);
    try {
        const body = req.body;
        const typeWebhook = (body === null || body === void 0 ? void 0 : body.typeWebhook) || (body === null || body === void 0 ? void 0 : body.event) || '';
        const idMessage = body === null || body === void 0 ? void 0 : body.idMessage;
        // Support both Green API and WAHA event formats
        // We now ALSO handle outgoing messages so human replies from phone/web show up in CRM.
        const isRelevantEvent = typeWebhook === 'incomingMessageReceived' || // Green API Inbound
            typeWebhook === 'outgoingMessageReceived' || // Green API Human Outbound
            typeWebhook === 'outgoingAPIMessageReceived' || // Green API Bot Outbound (for idempotency)
            typeWebhook === 'message'; // WAHA
        console.log(`Webhook: Received event type '${typeWebhook}'. isRelevantEvent: ${isRelevantEvent}`);
        if (!isRelevantEvent)
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
            console.log(`Webhook: No agency found for instance ${idInstance} or session ${sessionName}. Ignored.`);
            return;
        }
        const agencyDoc = await db.collection('agencies').doc(agencyId).get();
        const agencyData = agencyDoc.data() || {};
        // Support both old string[] and new {id, name}[] structure
        const monitoredGroupsRaw = ((_b = agencyData.whatsappIntegration) === null || _b === void 0 ? void 0 : _b.monitoredGroups) || [];
        const monitoredGroupIds = monitoredGroupsRaw.map(g => typeof g === 'string' ? g : g.id);
        // ── Extract sender and message text ────────────────────────────────────
        const senderData = (body === null || body === void 0 ? void 0 : body.senderData) || {};
        const messageData = (body === null || body === void 0 ? void 0 : body.messageData) || {};
        // Determine chat type and actual sender
        const chatId = senderData.chatId || '';
        const isGroup = chatId.endsWith('@g.us');
        const isDirect = chatId.endsWith('@c.us');
        // For outgoing messages, the recipient is the chatId
        const isOutbound = typeWebhook === 'outgoingMessageReceived' || typeWebhook === 'outgoingAPIMessageReceived';
        const rawSender = isOutbound ? (((_c = body === null || body === void 0 ? void 0 : body.chatData) === null || _c === void 0 ? void 0 : _c.chatId) || ((_d = body === null || body === void 0 ? void 0 : body.senderData) === null || _d === void 0 ? void 0 : _d.chatId)) : (senderData.sender || chatId);
        // Support various content types for Green API
        let textMessage = ((_e = messageData.textMessageData) === null || _e === void 0 ? void 0 : _e.textMessage) || '';
        const caption = ((_f = messageData.extendedTextMessageData) === null || _f === void 0 ? void 0 : _f.text) ||
            ((_g = messageData.imageMessageData) === null || _g === void 0 ? void 0 : _g.caption) ||
            ((_h = messageData.videoMessageData) === null || _h === void 0 ? void 0 : _h.caption) ||
            ((_j = messageData.fileMessageData) === null || _j === void 0 ? void 0 : _j.caption) || '';
        // If it's a media message without text, use a generic label
        if (!textMessage && !caption) {
            if (messageData.typeMessage === 'imageMessage')
                textMessage = '[תמונה]';
            else if (messageData.typeMessage === 'videoMessage')
                textMessage = '[סרטון]';
            else if (messageData.typeMessage === 'audioMessage')
                textMessage = '[הודעה קולית]';
            else if (messageData.typeMessage === 'fileMessage')
                textMessage = '[קובץ]';
            else if (messageData.typeMessage === 'locationMessage')
                textMessage = '[מיקום]';
            else if (messageData.typeMessage === 'contactMessage')
                textMessage = '[איש קשר]';
        }
        else {
            textMessage = textMessage || caption;
        }
        console.log(`Webhook: Agency ${agencyId} | ChatId: ${chatId} | isGroup: ${isGroup} | Sender: ${rawSender}`);
        if (textMessage)
            console.log(`Webhook: Message text preview: ${textMessage.substring(0, 50)}...`);
        if (!rawSender || !textMessage) {
            console.log('Webhook: No text content or sender, skipping.');
            return;
        }
        // ── Normalise phone ─────────────────────────────────────────────────────
        let cleanPhone = rawSender.replace('@c.us', '');
        if (cleanPhone.startsWith('972'))
            cleanPhone = '0' + cleanPhone.substring(3);
        // ============================================================================
        // 1. B2B GROUP MESSAGES (Property Hunting)
        // ============================================================================
        if (isGroup) {
            console.log(`Webhook (Group): Checking if ${chatId} is monitored...`);
            console.log(`Webhook (Group): Monitored list -> ${JSON.stringify(monitoredGroupIds)}`);
            if (!monitoredGroupIds.includes(chatId)) {
                console.log(`Webhook (Group): Chat ${chatId} is NOT in the monitored list. Ignoring.`);
                return; // Skip if not a monitored group
            }
            console.log(`Webhook (Group): Chat ${chatId} IS monitored. Proceeding matching logic with Gemini...`);
            const apiKey = geminiApiKey.value();
            if (!apiKey) {
                console.error("GEMINI API KEY MISSING for B2B Property Extraction");
                return;
            }
            try {
                const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
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
                        externalAgentPhone: cleanPhone,
                        rawDescription: textMessage,
                        city: parsed.city || null,
                        price: parsed.price || 0,
                        rooms: parsed.rooms || null,
                        type: parsed.type || 'sale',
                        listingType: 'external',
                        status: 'draft', // Requires manual approval in dashboard
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`Webhook: AI parsed external property from group ${chatId} by ${cleanPhone}`);
                }
            }
            catch (e) {
                console.error('Gemini extraction failed for B2B group message:', e);
            }
            return; // Done
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
                // Unknown number - Use Gemini to scan and summarize
                const apiKey = geminiApiKey.value();
                let aiTriage = { isRealEstateLead: false, summary: '', intent: 'inquiry' };
                if (apiKey) {
                    try {
                        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
                        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
                        const prompt = `You are a real estate AI triage assistant. Analyze this inbound WhatsApp message.
        Message: "${textMessage}"
        
        Determine if this is a potential real estate lead (buyer, seller, or interested in a property).
        Return ONLY a JSON object:
        {
          "isRealEstateLead": boolean,
          "summary": "a short 3-7 word summary in Hebrew",
          "intent": "buy" | "rent" | "sell" | "inquiry"
        }`;
                        const result = await model.generateContent(prompt);
                        const responseText = result.response.text().trim();
                        const cleanJson = responseText.replace(/```json|```/g, '').trim();
                        aiTriage = JSON.parse(cleanJson);
                    }
                    catch (e) {
                        console.error('Gemini Triage Error:', e);
                        // Fallback to basic keyword check if AI fails
                        const leadKeywords = ['נכס', 'דירה', 'מחיר', 'למכירה', 'להשכרה', 'פרטים', 'תיווך'];
                        const hasKeyword = leadKeywords.some(kw => textMessage.toLowerCase().includes(kw));
                        if (hasKeyword)
                            aiTriage = { isRealEstateLead: true, summary: 'ליד חדש מוואטסאפ (זיהוי מילות מפתח)', intent: 'inquiry' };
                    }
                }
                if (!aiTriage.isRealEstateLead) {
                    console.log(`Webhook: Ignored spam/irrelevant DM from ${cleanPhone}`);
                    return;
                }
                // Check for existing pending lead to avoid duplicates
                const pendingSnap = await db.collection('pending_leads')
                    .where('agencyId', '==', agencyId)
                    .where('phone', '==', cleanPhone)
                    .limit(1).get();
                if (pendingSnap.empty) {
                    const expireDate = new Date();
                    expireDate.setDate(expireDate.getDate() + 14);
                    const expiresAt = admin.firestore.Timestamp.fromDate(expireDate);
                    await db.collection('pending_leads').add({
                        agencyId,
                        phone: cleanPhone,
                        initialMessage: textMessage,
                        aiSummary: aiTriage.summary,
                        aiIntent: aiTriage.intent,
                        status: 'pending',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        expiresAt: expiresAt,
                    });
                    console.log(`Webhook: New pending lead created for ${cleanPhone} (AI Summary: ${aiTriage.summary})`);
                    // Create notification for the agency
                    await db.collection('alerts').add({
                        agencyId,
                        targetAgentId: 'all',
                        type: 'new_pending_lead',
                        title: 'ליד חדש זוהה מ-WhatsApp ✨',
                        message: `${aiTriage.summary || 'הודעה חדשה'} ממספר לא מוכר (${cleanPhone}).`,
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
                direction: isOutbound ? 'outbound' : 'inbound',
                senderPhone: isOutbound ? 'human_outbound' : cleanPhone,
                source: isOutbound ? 'whatsapp_human' : 'whatsapp_web',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: isOutbound,
            });
            // ── Trigger history sync for new/active interaction ─────────────────────
            if (isDirect && !isOutbound) {
                // Run in background
                const keys = await getGreenApiCredentials(agencyId, masterKey.value());
                if ((keys === null || keys === void 0 ? void 0 : keys.idInstance) && (keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
                    (0, whatsappService_1.syncChatHistory)(db, agencyId, leadId, cleanPhone, keys).catch(e => console.error('Sync failed:', e));
                }
            }
            console.log(`Webhook: message routed to lead ${leadId} | direction: ${isOutbound ? 'outbound' : 'inbound'}`);
        }
    }
    catch (err) {
        console.error('Webhook fatal error:', err);
    }
});
//# sourceMappingURL=whatsapp.js.map