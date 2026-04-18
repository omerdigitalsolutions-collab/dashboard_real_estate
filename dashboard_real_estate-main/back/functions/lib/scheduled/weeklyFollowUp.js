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
exports.weeklyFollowUp = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const whatsappService_1 = require("../whatsappService");
const db = admin.firestore();
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
const ALGORITHM = 'aes-256-cbc';
const FOLLOW_UP_MESSAGE = 'שלום! 😊 רק רצינו לוודא שאנחנו עדיין כאן בשבילך. האם המשכת בחיפוש הנכס? אנחנו שמחים לעזור!';
function decryptToken(encryptedData, ivText, secret) {
    const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
    const iv = Buffer.from(ivText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
exports.weeklyFollowUp = (0, scheduler_1.onSchedule)({
    schedule: '0 10 * * 0',
    timeZone: 'Asia/Jerusalem',
    secrets: [masterKey],
}, async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    // Fetch all active bot agencies
    const agenciesSnap = await db.collection('agencies')
        .where('weBotConfig.isActive', '==', true)
        .get();
    for (const agencyDoc of agenciesSnap.docs) {
        const agencyId = agencyDoc.id;
        // Decrypt Green API credentials
        const credsDoc = await db
            .collection('agencies').doc(agencyId)
            .collection('private_credentials').doc('whatsapp')
            .get();
        if (!credsDoc.exists)
            continue;
        const credsData = credsDoc.data();
        if (!credsData.idInstance || !credsData.encryptedToken || !credsData.iv)
            continue;
        let apiTokenInstance;
        try {
            apiTokenInstance = decryptToken(credsData.encryptedToken, credsData.iv, masterKey.value());
        }
        catch (_a) {
            console.warn(`[WeeklyFollowUp] Failed to decrypt creds for agency ${agencyId}`);
            continue;
        }
        const integration = { idInstance: credsData.idInstance, apiTokenInstance, isConnected: true };
        // Query searching leads with bot active and stale interaction
        const leadsSnap = await db.collection('leads')
            .where('agencyId', '==', agencyId)
            .where('status', '==', 'searching')
            .where('isBotActive', '==', true)
            .get();
        for (const leadDoc of leadsSnap.docs) {
            const lead = leadDoc.data();
            const leadId = leadDoc.id;
            // Skip if interacted recently (within 7 days)
            const lastInteraction = lead.lastInteraction;
            if (lastInteraction && lastInteraction.toDate() > sevenDaysAgo)
                continue;
            // Skip if already sent a follow-up within 6 days (anti-double-send)
            const lastFollowUpAt = lead.lastFollowUpAt;
            if (lastFollowUpAt && lastFollowUpAt.toDate() > sixDaysAgo)
                continue;
            const phone = lead.phone;
            if (!phone)
                continue;
            try {
                const sent = await (0, whatsappService_1.sendWhatsAppMessage)(integration, phone, FOLLOW_UP_MESSAGE);
                if (sent) {
                    await db.collection(`leads/${leadId}/messages`).add({
                        text: FOLLOW_UP_MESSAGE,
                        direction: 'outbound',
                        senderPhone: 'bot',
                        source: 'whatsapp_ai_bot',
                        botSentAt: Date.now(),
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        isRead: true,
                    });
                    await db.collection('leads').doc(leadId).update({
                        lastFollowUpAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`[WeeklyFollowUp] ✅ Follow-up sent to lead ${leadId} (${phone})`);
                }
            }
            catch (err) {
                console.warn(`[WeeklyFollowUp] Failed to send to lead ${leadId}:`, err);
            }
        }
    }
    console.log('[WeeklyFollowUp] ✅ Weekly follow-up run complete.');
});
//# sourceMappingURL=weeklyFollowUp.js.map