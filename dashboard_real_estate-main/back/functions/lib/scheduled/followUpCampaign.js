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
exports.followUpCampaign = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const whatsappService_1 = require("../whatsappService");
const db = admin.firestore();
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
const ALGORITHM = 'aes-256-cbc';
const STEP_DELAYS_MS = {
    1: 3 * 24 * 60 * 60 * 1000,
    2: 4 * 24 * 60 * 60 * 1000,
    3: 7 * 24 * 60 * 60 * 1000,
    4: 7 * 24 * 60 * 60 * 1000,
};
const CAMPAIGN_MESSAGES = {
    1: 'שלום! 😊 רצינו לבדוק אם אתם עדיין מחפשים נכס. אנחנו כאן לכל שאלה!',
    2: 'היי! יש כמה נכסים חדשים שנכנסו לאחרונה שעשויים להתאים לכם. רוצים שנשלח לכם?',
    3: 'שלום שוב, אנחנו לא רוצים להפריע – רק שתדעו שאנחנו כאן כשתהיו מוכנים. 🏠',
    4: 'זוהי הודעה אחרונה שלנו בינתיים. אם תרצו לחדש את החיפוש, פשוט שלחו לנו הודעה! להסרה מרשימת ההודעות שלחו: *הסר*',
};
const ACTIVE_CHAT_STATES = new Set([
    'COLLECTING_NAME',
    'COLLECTING_REQS',
    'ASKING_EXTRA_CRITERIA',
    'SCHEDULING_CALL',
    'COLLECTING_SELLER_INFO',
    'SCHEDULING_SELLER_CALL',
    'CLOSED',
]);
function decryptToken(encryptedData, ivText, secret) {
    const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
    const iv = Buffer.from(ivText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
exports.followUpCampaign = (0, scheduler_1.onSchedule)({
    schedule: '0 9 * * *',
    timeZone: 'Asia/Jerusalem',
    secrets: [masterKey],
}, async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const now = Date.now();
    const agenciesSnap = await db.collection('agencies')
        .where('weBotConfig.isActive', '==', true)
        .get();
    for (const agencyDoc of agenciesSnap.docs) {
        const agencyId = agencyDoc.id;
        const agencyData = agencyDoc.data();
        if (((_a = agencyData.weBotConfig) === null || _a === void 0 ? void 0 : _a.followUpEnabled) === false)
            continue;
        const maxSteps = (_c = (_b = agencyData.weBotConfig) === null || _b === void 0 ? void 0 : _b.followUpSteps) !== null && _c !== void 0 ? _c : 4;
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
        catch (_m) {
            console.warn(`[FollowUpCampaign] Failed to decrypt creds for agency ${agencyId}`);
            continue;
        }
        const integration = { idInstance: credsData.idInstance, apiTokenInstance, isConnected: true };
        const leadsSnap = await db.collection('leads')
            .where('agencyId', '==', agencyId)
            .where('isBotActive', '==', true)
            .get();
        for (const leadDoc of leadsSnap.docs) {
            const lead = leadDoc.data();
            const leadId = leadDoc.id;
            // Skip opted-out leads
            if (lead.followUpOptedOut === true)
                continue;
            // Skip leads in an active conversation state
            const chatState = lead.chatState;
            const currentState = (_d = chatState === null || chatState === void 0 ? void 0 : chatState.state) !== null && _d !== void 0 ? _d : 'IDLE';
            if (ACTIVE_CHAT_STATES.has(currentState))
                continue;
            const currentStep = (_e = lead.followUpCampaignStep) !== null && _e !== void 0 ? _e : 0;
            if (currentStep >= maxSteps)
                continue;
            const lastInteractionMs = (_j = (_g = (_f = lead.lastInteraction) === null || _f === void 0 ? void 0 : _f.toDate().getTime()) !== null && _g !== void 0 ? _g : (_h = lead.createdAt) === null || _h === void 0 ? void 0 : _h.toDate().getTime()) !== null && _j !== void 0 ? _j : 0;
            const lastCampaignSentMs = (_l = (_k = lead.followUpCampaignLastSentAt) === null || _k === void 0 ? void 0 : _k.toDate().getTime()) !== null && _l !== void 0 ? _l : 0;
            // Use the more recent of the two timestamps as the "last activity"
            const lastActivityMs = Math.max(lastInteractionMs, lastCampaignSentMs);
            const nextStep = currentStep + 1;
            const requiredDelay = STEP_DELAYS_MS[nextStep];
            if (now - lastActivityMs < requiredDelay)
                continue;
            const phone = lead.phone;
            if (!phone)
                continue;
            const message = CAMPAIGN_MESSAGES[nextStep];
            try {
                const sent = await (0, whatsappService_1.sendWhatsAppMessage)(integration, phone, message);
                if (sent) {
                    await db.collection(`leads/${leadId}/messages`).add({
                        text: message,
                        direction: 'outbound',
                        senderPhone: 'bot',
                        source: 'whatsapp_ai_bot',
                        botSentAt: Date.now(),
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        isRead: true,
                    });
                    await db.collection('leads').doc(leadId).update({
                        followUpCampaignStep: nextStep,
                        followUpCampaignLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`[FollowUpCampaign] ✅ Step ${nextStep} sent to lead ${leadId} (${phone})`);
                }
            }
            catch (err) {
                console.warn(`[FollowUpCampaign] Failed to send to lead ${leadId}:`, err);
            }
        }
    }
    console.log('[FollowUpCampaign] ✅ Daily follow-up campaign run complete.');
});
//# sourceMappingURL=followUpCampaign.js.map