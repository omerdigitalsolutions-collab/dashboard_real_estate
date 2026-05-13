"use strict";
/**
 * ─── Homer Sales Bot Webhook ──────────────────────────────────────────────────
 *
 * HTTP Cloud Function that receives Green API webhooks for Homer's own WhatsApp
 * number and routes inbound messages to the sales bot.
 *
 * Homer's integration credentials + bot settings are stored in:
 *   homer_settings/salesBot  {
 *     isActive: boolean
 *     mode: 'agents' | 'demo'
 *     idInstance: string
 *     apiTokenInstance: string
 *     updatedAt: Timestamp
 *     updatedBy: string
 *   }
 *
 * Endpoint: POST /webhookHomerSalesBot
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
exports.webhookHomerSalesBot = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
const homerSalesBot_1 = require("./homerSalesBot");
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
const db = admin.firestore();
// ─── Idempotency guard ────────────────────────────────────────────────────────
async function markProcessed(msgId) {
    const ref = db.collection('homer_processed_messages').doc(msgId);
    try {
        await ref.create({ processedAt: admin.firestore.FieldValue.serverTimestamp() });
        return true;
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) === 6 /* ALREADY_EXISTS */)
            return false;
        throw err;
    }
}
// ─── Phone normaliser ─────────────────────────────────────────────────────────
function normalisePhone(rawSender) {
    let digits = rawSender.replace(/\D/g, '');
    if (digits.startsWith('972'))
        digits = '0' + digits.substring(3);
    return digits;
}
// ─── Cloud Function ───────────────────────────────────────────────────────────
exports.webhookHomerSalesBot = (0, https_1.onRequest)({
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 120,
    concurrency: 20,
    minInstances: 0,
    secrets: [geminiApiKey],
}, async (req, res) => {
    var _a, _b, _c, _d;
    // Always ACK immediately so Green API doesn't retry
    res.status(200).send('ok');
    try {
        const body = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        const { typeWebhook, idMessage, senderData, messageData } = body;
        // Only handle inbound DMs
        if (typeWebhook !== 'incomingMessageReceived')
            return;
        if (!(senderData === null || senderData === void 0 ? void 0 : senderData.sender) || ((_b = senderData.chatId) === null || _b === void 0 ? void 0 : _b.endsWith('@g.us')))
            return;
        const text = ((_c = messageData === null || messageData === void 0 ? void 0 : messageData.textMessageData) === null || _c === void 0 ? void 0 : _c.textMessage) ||
            ((_d = messageData === null || messageData === void 0 ? void 0 : messageData.extendedTextMessageData) === null || _d === void 0 ? void 0 : _d.text) ||
            '';
        if (!text.trim())
            return;
        const msgId = idMessage || `${senderData.sender}-${Date.now()}`;
        // Idempotency
        const isNew = await markProcessed(msgId);
        if (!isNew) {
            console.log(`[HomerSalesBot] Duplicate message ${msgId}, skipping`);
            return;
        }
        // Load bot settings
        const settingsSnap = await db.collection('homer_settings').doc('salesBot').get();
        if (!settingsSnap.exists) {
            console.log('[HomerSalesBot] homer_settings/salesBot not found, bot inactive');
            return;
        }
        const settings = settingsSnap.data();
        if (!settings.isActive) {
            console.log('[HomerSalesBot] Bot is inactive');
            return;
        }
        const { idInstance, apiTokenInstance, mode } = settings;
        if (!idInstance || !apiTokenInstance) {
            console.error('[HomerSalesBot] Missing Green API credentials in homer_settings/salesBot');
            return;
        }
        const phone = normalisePhone(senderData.sender);
        if (!phone)
            return;
        await (0, homerSalesBot_1.handleHomerSalesBot)({
            phone,
            text: text.trim(),
            geminiApiKey: geminiApiKey.value(),
            homerIntegration: {
                idInstance,
                apiTokenInstance,
                isConnected: true,
            },
            botMode: mode !== null && mode !== void 0 ? mode : 'agents',
        });
    }
    catch (err) {
        console.error('[HomerSalesBot] Unhandled error:', err);
    }
});
//# sourceMappingURL=webhookHomerSalesBot.js.map