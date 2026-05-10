"use strict";
/**
 * ─── Calendar Module — WhatsApp Notifications ────────────────────────────────
 *
 * Sends WhatsApp messages after a calendar event is created:
 *   - To the assigned agent (if they have a phone number)
 *   - To the lead/client (if relatedTo.type === 'lead' and they have a phone)
 *
 * Credentials are loaded from agencies/{agencyId}/private_credentials/whatsapp
 * and decrypted with the ENCRYPTION_MASTER_KEY secret (same AES-256-CBC pattern
 * used by the scheduled follow-up jobs).
 *
 * All failures are non-fatal — errors are logged but never thrown so they
 * cannot block the primary createEvent response.
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
exports.sendCalendarNotifications = sendCalendarNotifications;
const crypto = __importStar(require("crypto"));
const firestore_1 = require("firebase-admin/firestore");
const whatsappService_1 = require("../whatsappService");
const ALGORITHM = 'aes-256-cbc';
function decryptToken(encryptedData, ivText, secret) {
    const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
    const iv = Buffer.from(ivText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let dec = decipher.update(encryptedData, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
}
async function sendCalendarNotifications(params) {
    const { agencyId, htmlLink, eventSummary, assignedAgentId, relatedTo, encryptionMasterKey } = params;
    const db = (0, firestore_1.getFirestore)();
    // ── Load and decrypt Green API credentials ─────────────────────────────
    let integration = null;
    try {
        const credsDoc = await db
            .collection('agencies').doc(agencyId)
            .collection('private_credentials').doc('whatsapp')
            .get();
        if (credsDoc.exists) {
            const c = credsDoc.data();
            if (c.idInstance && c.encryptedToken && c.iv) {
                integration = {
                    idInstance: c.idInstance,
                    apiTokenInstance: decryptToken(c.encryptedToken, c.iv, encryptionMasterKey),
                    isConnected: true,
                };
            }
        }
    }
    catch (err) {
        console.warn('[calendar/notify] Failed to load WhatsApp credentials:', err);
        return;
    }
    if (!integration) {
        console.log(`[calendar/notify] No WhatsApp credentials for agency ${agencyId} — skipping`);
        return;
    }
    const sends = [];
    // ── Notify assigned agent ──────────────────────────────────────────────
    if (assignedAgentId) {
        sends.push((async () => {
            var _a;
            try {
                const agentDoc = await db.collection('users').doc(assignedAgentId).get();
                const phone = (_a = agentDoc.data()) === null || _a === void 0 ? void 0 : _a.phone;
                if (!phone)
                    return;
                await (0, whatsappService_1.sendWhatsAppMessage)(integration, phone, `📅 *נקבעה פגישה חדשה ביומן שלך*\n${eventSummary}\n\nלצפייה ביומן:\n${htmlLink}`);
                console.log(`[calendar/notify] Agent notification sent (uid=${assignedAgentId})`);
            }
            catch (err) {
                console.warn(`[calendar/notify] Agent notification failed (uid=${assignedAgentId}):`, err);
            }
        })());
    }
    // ── Notify lead (client) ───────────────────────────────────────────────
    if ((relatedTo === null || relatedTo === void 0 ? void 0 : relatedTo.type) === 'lead') {
        sends.push((async () => {
            var _a;
            try {
                const leadDoc = await db.collection('leads').doc(relatedTo.id).get();
                const phone = (_a = leadDoc.data()) === null || _a === void 0 ? void 0 : _a.phone;
                if (!phone)
                    return;
                await (0, whatsappService_1.sendWhatsAppMessage)(integration, phone, `שלום ${relatedTo.name} 😊\nהפגישה שלנו נקבעה בהצלחה!\n\nלצפייה ביומן Google:\n${htmlLink}`);
                console.log(`[calendar/notify] Lead notification sent (leadId=${relatedTo.id})`);
            }
            catch (err) {
                console.warn(`[calendar/notify] Lead notification failed (leadId=${relatedTo.id}):`, err);
            }
        })());
    }
    await Promise.all(sends);
}
//# sourceMappingURL=notifications.js.map