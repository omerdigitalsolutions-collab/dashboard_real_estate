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
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPropertyLiked = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const whatsappService_1 = require("../whatsappService");
const db = admin.firestore();
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
const ALGORITHM = 'aes-256-cbc';
function decryptToken(encryptedData, ivText, secret) {
    const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
    const iv = Buffer.from(ivText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
exports.onPropertyLiked = (0, https_1.onCall)({ cors: true, region: 'europe-west1', secrets: [masterKey] }, async (request) => {
    var _a, _b, _c, _d, _e, _f;
    const { catalogId, propertyId, propertyAddress } = request.data;
    if (!catalogId || !propertyId)
        return { success: false };
    const catalogSnap = await db.collection('shared_catalogs').doc(catalogId).get();
    if (!catalogSnap.exists)
        return { success: false };
    const catalog = catalogSnap.data();
    const agencyId = catalog.agencyId;
    const leadId = (_a = catalog.leadId) !== null && _a !== void 0 ? _a : null;
    const leadName = catalog.leadName || 'לקוח';
    const addr = (propertyAddress === null || propertyAddress === void 0 ? void 0 : propertyAddress.trim()) || 'הנכס';
    if (!agencyId)
        return { success: false };
    // ─── Resolve assigned agent from property document ───────────────────────
    let assignedAgentId = null;
    const propertyIds = catalog.propertyIds || [];
    const propertyEntry = propertyIds.find((p) => (typeof p === 'string' ? p : p.id) === propertyId);
    const collectionPath = typeof propertyEntry === 'object' && (propertyEntry === null || propertyEntry === void 0 ? void 0 : propertyEntry.collectionPath)
        ? propertyEntry.collectionPath
        : `agencies/${agencyId}/properties`;
    try {
        const propertySnap = await db.doc(`${collectionPath}/${propertyId}`).get();
        if (propertySnap.exists) {
            assignedAgentId = ((_b = propertySnap.data().management) === null || _b === void 0 ? void 0 : _b.assignedAgentId) || null;
        }
    }
    catch (e) {
        console.warn('[onPropertyLiked] property lookup failed:', e);
    }
    // ─── Legacy CRM notification (kept for backwards compatibility) ──────────
    db.collection('notifications').add({
        agencyId,
        leadId: leadId !== null && leadId !== void 0 ? leadId : null,
        leadName,
        type: 'catalog_like',
        propertyId,
        propertyAddress: addr,
        message: `${leadName} סימן עניין בנכס ב${addr}`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((e) => console.warn('[onPropertyLiked] notification write failed:', e.message));
    // ─── Fetch agency admins ──────────────────────────────────────────────────
    const adminSnap = await db.collection('users')
        .where('agencyId', '==', agencyId)
        .where('role', '==', 'admin')
        .get();
    const alertBase = {
        agencyId,
        leadId: leadId !== null && leadId !== void 0 ? leadId : null,
        leadName,
        type: 'catalog_like',
        title: '❤️ לייק מהקטלוג!',
        message: `${leadName} לחץ על "אהבתי" על הנכס ב${addr}`,
        link: leadId ? `/dashboard/leads/${leadId}` : `/dashboard/properties`,
        propertyId,
        propertyAddress: addr,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Alert for the assigned agent
    if (assignedAgentId) {
        db.collection('alerts').add(Object.assign(Object.assign({}, alertBase), { targetAgentId: assignedAgentId })).catch((e) => console.warn('[onPropertyLiked] agent alert write failed:', e.message));
    }
    // Alerts for admins (skip if admin is the assigned agent to avoid duplicates)
    let hasAdmins = false;
    for (const adminDoc of adminSnap.docs) {
        hasAdmins = true;
        if (adminDoc.id === assignedAgentId)
            continue;
        db.collection('alerts').add(Object.assign(Object.assign({}, alertBase), { targetAgentId: adminDoc.id })).catch((e) => console.warn('[onPropertyLiked] admin alert write failed:', e.message));
    }
    // Fallback: broadcast to all if no agent and no admins found
    if (!assignedAgentId && !hasAdmins) {
        db.collection('alerts').add(Object.assign(Object.assign({}, alertBase), { targetAgentId: 'all' })).catch((e) => console.warn('[onPropertyLiked] broadcast alert write failed:', e.message));
    }
    // ─── WhatsApp credentials ─────────────────────────────────────────────────
    const credsDoc = await db
        .collection('agencies').doc(agencyId)
        .collection('private_credentials').doc('whatsapp')
        .get();
    if (!credsDoc.exists)
        return { success: true };
    const credsData = credsDoc.data();
    if (!credsData.idInstance || !credsData.encryptedToken || !credsData.iv)
        return { success: true };
    let apiTokenInstance;
    try {
        apiTokenInstance = decryptToken(credsData.encryptedToken, credsData.iv, masterKey.value());
    }
    catch (_g) {
        console.warn(`[onPropertyLiked] Failed to decrypt creds for agency ${agencyId}`);
        return { success: true };
    }
    const integration = { idInstance: credsData.idInstance, apiTokenInstance, isConnected: true };
    const staffMessage = `❤️ *לייק מהקטלוג!*\n${leadName} לחץ על "אהבתי" על הנכס ב${addr}.\n\nכדאי ליצור קשר בקרוב! 😊`;
    // ─── WhatsApp to assigned agent ───────────────────────────────────────────
    let agentPhone = null;
    if (assignedAgentId) {
        try {
            const agentDoc = await db.collection('users').doc(assignedAgentId).get();
            agentPhone = ((_c = agentDoc.data()) === null || _c === void 0 ? void 0 : _c.phone) || ((_d = agentDoc.data()) === null || _d === void 0 ? void 0 : _d.phoneNumber) || null;
            if (agentPhone) {
                await (0, whatsappService_1.sendWhatsAppMessage)(integration, agentPhone, staffMessage);
                console.log(`[onPropertyLiked] ✅ WA sent to agent ${assignedAgentId}`);
            }
        }
        catch (e) {
            console.warn('[onPropertyLiked] Failed to send WA to agent:', e);
        }
    }
    // ─── WhatsApp to admins ───────────────────────────────────────────────────
    for (const adminDoc of adminSnap.docs) {
        const adminPhone = ((_e = adminDoc.data()) === null || _e === void 0 ? void 0 : _e.phone) || ((_f = adminDoc.data()) === null || _f === void 0 ? void 0 : _f.phoneNumber);
        if (!adminPhone)
            continue;
        if (adminPhone === agentPhone)
            continue; // skip if same person
        try {
            await (0, whatsappService_1.sendWhatsAppMessage)(integration, adminPhone, staffMessage);
            console.log(`[onPropertyLiked] ✅ WA sent to admin ${adminDoc.id}`);
        }
        catch (e) {
            console.warn('[onPropertyLiked] Failed to send WA to admin:', e);
        }
    }
    // ─── WhatsApp to lead (only for catalogs tied to a specific lead) ─────────
    if (!leadId)
        return { success: true };
    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists)
        return { success: true };
    const phone = leadSnap.data().phone;
    if (!phone)
        return { success: true };
    const leadMessage = `היי ${leadName}! 🏠 ראינו שאהבת את הנכס ב${addr}. נציג שלנו יחזור אליך בקרוב – תודה על ההתעניינות! 😊`;
    try {
        const sent = await (0, whatsappService_1.sendWhatsAppMessage)(integration, phone, leadMessage);
        if (sent) {
            db.collection(`leads/${leadId}/messages`).add({
                text: leadMessage,
                direction: 'outbound',
                senderPhone: 'bot',
                source: 'whatsapp_ai_bot',
                botSentAt: Date.now(),
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: true,
            }).catch((e) => console.warn('[onPropertyLiked] message log failed:', e.message));
            console.log(`[onPropertyLiked] ✅ WA sent to lead ${leadId}`);
        }
    }
    catch (err) {
        console.warn(`[onPropertyLiked] Failed to send WA to lead ${leadId}:`, err);
    }
    return { success: true };
});
//# sourceMappingURL=onPropertyLiked.js.map