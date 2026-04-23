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
exports.disconnectWhatsApp = exports.getGroups = exports.syncLeadChat = exports.sendWhatsappMessage = exports.checkWhatsAppStatus = exports.generateWhatsAppQR = exports.disconnectAgencyWhatsApp = exports.connectAgencyWhatsApp = void 0;
exports.sendSystemWhatsappMessage = sendSystemWhatsappMessage;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
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
// Allowed CORS origins
const CORS_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://dashboard-6f9d1.web.app',
    'https://dashboard-6f9d1.firebaseapp.com',
    'https://homer.management',
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
    if (phone.includes('@'))
        return phone; // Already a WaId (contact or group)
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
        // Allocate a new instance from the pool (isActive: false = free)
        const availableSnap = await db.collection('available_instances')
            .where('isActive', '==', false)
            .limit(1)
            .get();
        if (availableSnap.empty) {
            throw new https_1.HttpsError('resource-exhausted', 'No available WhatsApp instances at the moment. Please contact support.');
        }
        const instanceDoc = availableSnap.docs[0];
        const instanceData = instanceDoc.data();
        instanceId = instanceData.idInstance;
        instanceToken = instanceData.apiTokenInstance;
        // Encrypt the token
        const { encryptedToken, iv } = encryptToken(instanceToken, masterKey.value());
        await db.runTransaction(async (t) => {
            t.set(credsRef, {
                idInstance: instanceId,
                encryptedToken,
                iv,
                assignedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            t.set(agencyRef, {
                whatsappIntegration: {
                    status: 'PENDING_SCAN',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }
            }, { merge: true });
            t.update(agencyRef, {
                greenApiKeys: admin.firestore.FieldValue.delete()
            });
            // Mark instance as active in the registry (don't delete — keep for future lookups)
            t.update(instanceDoc.ref, {
                isActive: true,
                agencyId,
                assignedAt: admin.firestore.FieldValue.serverTimestamp(),
                apiTokenInstance: null,
            });
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
            // Return instance to pool by flipping isActive back to false
            const poolRef = db.collection('available_instances').doc(keys.idInstance);
            t.update(poolRef, {
                isActive: false,
                agencyId: null,
                apiTokenInstance: keys.apiTokenInstance,
                returnedAt: admin.firestore.FieldValue.serverTimestamp(),
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
    var _a, _b, _c, _d, _e, _f, _g;
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
    // ── 1. Try Green API mode via dynamic keys ───────────────────────────────────────────────────────
    const keys = await getGreenApiCredentials(agencyId, masterKey.value());
    if ((keys === null || keys === void 0 ? void 0 : keys.idInstance) && (keys === null || keys === void 0 ? void 0 : keys.apiTokenInstance)) {
        try {
            if (fileUrl) {
                const sendFileUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/sendFileByUrl/${keys.apiTokenInstance}`;
                await axios_1.default.post(sendFileUrl, {
                    chatId: toWaId(phone),
                    urlFile: fileUrl,
                    fileName: fileName || 'file',
                    caption: message
                }, { timeout: 20000 });
                console.log(`[WhatsApp] Green API: File sent to ${phone}`);
            }
            else {
                const sendUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/sendMessage/${keys.apiTokenInstance}`;
                await axios_1.default.post(sendUrl, {
                    chatId: toWaId(phone),
                    message: message
                }, { timeout: 10000 });
                console.log(`[WhatsApp] Green API: Message sent to ${phone}`);
            }
            return { success: true };
        }
        catch (err) {
            console.error(`[WhatsApp] Green API dispatch failed for agency ${agencyId}:`, ((_b = err.response) === null || _b === void 0 ? void 0 : _b.data) || err.message);
            const errorMsg = ((_d = (_c = err.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.message) || err.message || 'Unknown Green API error';
            return { success: false, error: `Green API: ${errorMsg}` };
        }
    }
    // ── 2. Try WAHA mode (Self-hosted) ───────────────────────────────────────────────────────
    // We check for WAHA if Green API keys aren't found, or as a fallback
    const waBaseUrl = process.env.WAHA_BASE_URL;
    if (waBaseUrl) {
        const sessionName = `agency_${agencyId}`;
        try {
            const headers = {};
            if (process.env.WAHA_MASTER_KEY) {
                headers['Authorization'] = `Bearer ${process.env.WAHA_MASTER_KEY}`;
            }
            const chatId = toWaId(phone);
            if (fileUrl) {
                const url = `${waBaseUrl.replace(/\/$/, '')}/api/sendRemoteFile`;
                await axios_1.default.post(url, {
                    session: sessionName,
                    chatId: chatId,
                    fileUrl: fileUrl,
                    fileName: fileName || 'file',
                    caption: message
                }, { headers, timeout: 20000 });
                console.log(`[WhatsApp] WAHA: File sent to ${phone}`);
            }
            else {
                const url = `${waBaseUrl.replace(/\/$/, '')}/api/sendText`;
                await axios_1.default.post(url, {
                    session: sessionName,
                    chatId: chatId,
                    text: message
                }, { headers, timeout: 10000 });
                console.log(`[WhatsApp] WAHA: Message sent to ${phone}`);
            }
            return { success: true };
        }
        catch (err) {
            console.error(`[WhatsApp] WAHA dispatch failed for agency ${agencyId}:`, ((_e = err.response) === null || _e === void 0 ? void 0 : _e.data) || err.message);
            const errorMsg = ((_g = (_f = err.response) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.error) || err.message || 'Unknown WAHA error';
            return { success: false, error: `WAHA: ${errorMsg}` };
        }
    }
    throw new https_1.HttpsError('failed-precondition', 'No WhatsApp session or instance found. Please reconnect in Settings.');
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
    await (0, whatsappService_1.syncChatHistory)(db, agencyId, leadId, phone, keys, 15);
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
//# sourceMappingURL=whatsapp.js.map