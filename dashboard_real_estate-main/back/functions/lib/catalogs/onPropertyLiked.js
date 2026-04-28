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
    var _a;
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
    // CRM notification (always, even for general catalogs without a lead)
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
    // WhatsApp to lead — only if catalog is tied to a specific lead
    if (!leadId)
        return { success: true };
    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists)
        return { success: true };
    const phone = leadSnap.data().phone;
    if (!phone)
        return { success: true };
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
    catch (_b) {
        console.warn(`[onPropertyLiked] Failed to decrypt creds for agency ${agencyId}`);
        return { success: true };
    }
    const integration = { idInstance: credsData.idInstance, apiTokenInstance, isConnected: true };
    const message = `היי ${leadName}! 🏠 ראינו שאהבת את הנכס ב${addr}. נציג שלנו יחזור אליך בקרוב – תודה על ההתעניינות! 😊`;
    try {
        const sent = await (0, whatsappService_1.sendWhatsAppMessage)(integration, phone, message);
        if (sent) {
            db.collection(`leads/${leadId}/messages`).add({
                text: message,
                direction: 'outbound',
                senderPhone: 'bot',
                source: 'whatsapp_ai_bot',
                botSentAt: Date.now(),
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: true,
            }).catch((e) => console.warn('[onPropertyLiked] message log failed:', e.message));
            console.log(`[onPropertyLiked] ✅ Sent like confirmation to lead ${leadId} (${phone})`);
        }
    }
    catch (err) {
        console.warn(`[onPropertyLiked] Failed to send WA to lead ${leadId}:`, err);
    }
    return { success: true };
});
//# sourceMappingURL=onPropertyLiked.js.map