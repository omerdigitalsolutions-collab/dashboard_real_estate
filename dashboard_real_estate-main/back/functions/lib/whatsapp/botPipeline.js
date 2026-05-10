"use strict";
/**
 * ─── Bot Security Pipeline ────────────────────────────────────────────────────
 *
 * Entry point for every inbound DM before reaching the AI bot.
 * Order of operations:
 *   1. Blocklist check
 *   2. Rate limit (10 msgs/min)
 *   3. Sanitize input
 *   4. Injection detection + auto-block at score ≥ 3
 *   5. 24-hour security session TTL
 *   6. Delegate to handleWeBotReply (property-specific answering + handoff
 *      live inside handleAddressQuery there — they were removed from this
 *      pipeline to avoid hijacking buyer/seller flows on messages that
 *      merely mention "רחוב" or "דירה ב…")
 *   7. Audit log every interaction
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processInboundMessage = processInboundMessage;
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const blocklist_1 = require("./security/blocklist");
const rateLimiter_1 = require("./security/rateLimiter");
const sanitizeInput_1 = require("./security/sanitizeInput");
const detectInjection_1 = require("./security/detectInjection");
const handleWeBotReply_1 = require("../handleWeBotReply");
const db = admin.firestore();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMITED_MSG = 'יותר מדי הודעות. נסה שוב בעוד דקה.';
const OPT_OUT_KEYWORDS = ['הסר', 'הסירו', 'הסר אותי', 'הפסיקו', 'stop', 'unsubscribe'];
const OPT_OUT_CONFIRM_MSG = 'הוסרת בהצלחה מרשימת ההודעות האוטומטיות שלנו. תמיד נשמח לשמוע ממך! 😊';
function isOptOutMessage(text) {
    const n = text.toLowerCase().trim();
    return OPT_OUT_KEYWORDS.some(kw => n === kw.toLowerCase() || n.startsWith(kw.toLowerCase() + ' '));
}
// ─── Internal helpers ─────────────────────────────────────────────────────────
async function sendDirect(creds, chatId, message) {
    const url = `https://7105.api.greenapi.com/waInstance${creds.idInstance}/sendMessage/${creds.apiTokenInstance}`;
    await axios_1.default
        .post(url, { chatId, message }, { timeout: 15000 })
        .catch((e) => console.warn('[Pipeline] sendDirect failed:', e.message));
}
async function writeAuditLog(phone, agencyId, direction, text, extra) {
    await db
        .collection('whatsapp_audit_log')
        .add(Object.assign(Object.assign({ phone,
        agencyId,
        direction, text: text.substring(0, 500) }, extra), { ts: admin.firestore.FieldValue.serverTimestamp() }))
        .catch((e) => console.warn('[Pipeline] audit log write failed:', e.message));
}
async function getOrCreateSession(phone, agencyId) {
    const sessionId = `${agencyId}_${phone}`;
    const ref = db.collection('whatsapp_sessions').doc(sessionId);
    const now = admin.firestore.Timestamp.now();
    const snap = await ref.get();
    if (snap.exists) {
        // Fire-and-forget — don't block the bot reply on a "lastMessageAt" stamp.
        ref.update({ lastMessageAt: now }).catch((e) => console.warn('[Pipeline] session update failed:', e.message));
        return Object.assign(Object.assign({ id: snap.id }, snap.data()), { lastMessageAt: now });
    }
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + SESSION_TTL_MS);
    const session = { phone, agencyId, createdAt: now, lastMessageAt: now, expiresAt, status: 'active' };
    await ref.set(session);
    return Object.assign({ id: sessionId }, session);
}
// ─── Main export ──────────────────────────────────────────────────────────────
async function processInboundMessage(params) {
    var _a, _b, _c, _d;
    const { phone, waChatId, text, agencyId, leadId, geminiApiKey, resendApiKey, creds, idMessage, inboundMsgDocId } = params;
    // Bypass phone — always gets a response regardless of locks/checks.
    // Set via BYPASS_PHONE env var (Firebase Functions config); no hardcoded number.
    const bypassPhone = (_a = process.env.BYPASS_PHONE) !== null && _a !== void 0 ? _a : '';
    const isBypassPhone = bypassPhone !== '' && phone === bypassPhone;
    // 1. & 2. Blocklist + Rate limit (parallel, fail-safe)
    const [isBlocked, passedRateLimit] = await Promise.all([
        (0, blocklist_1.checkBlocklist)(phone).catch(() => false), // fail-safe: assume not blocked
        (0, rateLimiter_1.checkRateLimit)(phone, agencyId).catch(() => true), // fail-safe: assume passed
    ]);
    if (!isBypassPhone && isBlocked) {
        writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'blocklist' });
        return;
    }
    if (!isBypassPhone && !passedRateLimit) {
        await sendDirect(creds, waChatId, RATE_LIMITED_MSG);
        writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'rate_limit' });
        return;
    }
    // 3. Sanitize
    const sanitized = (0, sanitizeInput_1.sanitizeInput)(text);
    // 3.5. Opt-out detection — after sanitize, before injection check
    if (!isBypassPhone && isOptOutMessage(sanitized)) {
        await db.collection('leads').doc(leadId).update({ followUpOptedOut: true });
        await sendDirect(creds, waChatId, OPT_OUT_CONFIRM_MSG);
        db.collection(`leads/${leadId}/messages`).add({
            text: OPT_OUT_CONFIRM_MSG,
            direction: 'outbound',
            senderPhone: 'bot',
            source: 'whatsapp_ai_bot',
            botSentAt: Date.now(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isRead: true,
        }).catch((e) => console.warn('[Pipeline] opt-out log failed:', e.message));
        writeAuditLog(phone, agencyId, 'outbound', OPT_OUT_CONFIRM_MSG, { optOut: true });
        return;
    }
    // 4. Injection detection
    const { isInjection, score } = (0, detectInjection_1.detectInjection)(sanitized);
    if (isInjection) {
        const suspRef = db.collection('whatsapp_suspicious').doc(phone);
        const suspSnap = await suspRef.get();
        const prev = suspSnap.exists ? ((_b = suspSnap.data().score) !== null && _b !== void 0 ? _b : 0) : 0;
        const newScore = prev + score;
        suspRef.set({ phone, agencyId, score: newScore, lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch((e) => console.warn('[Pipeline] suspicious-set failed:', e.message));
        if (!isBypassPhone && newScore >= 3) {
            await (0, blocklist_1.blockPhone)(phone, `injection_attempts_score_${newScore}`);
            writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'auto_block_injection', score: newScore });
            return;
        }
        // Never forward injection attempts to Gemini — reply generically and stop.
        await sendDirect(creds, waChatId, 'לא הצלחתי להבין את הבקשה. אשמח לעזור אם תנסח מחדש.');
        writeAuditLog(phone, agencyId, 'blocked', sanitized, { injectionScore: newScore, flagged: true, reason: 'injection_blocked_pre_ai' });
        return;
    }
    else {
        writeAuditLog(phone, agencyId, 'inbound', sanitized);
    }
    // 5. Security session TTL (rolling 24h — expires 24h after last message, not after creation)
    const session = await getOrCreateSession(phone, agencyId);
    const lastActive = session.lastMessageAt
        ? session.lastMessageAt.toMillis()
        : 0;
    const isExpired = session.status === 'expired' ||
        (Date.now() - lastActive > SESSION_TTL_MS);
    if (!isBypassPhone && isExpired) {
        const agencyDoc = await db.collection('agencies').doc(agencyId).get();
        const agencyPhone = ((_c = agencyDoc.data()) === null || _c === void 0 ? void 0 : _c.phone) || ((_d = agencyDoc.data()) === null || _d === void 0 ? void 0 : _d.phoneNumber) || '';
        await sendDirect(creds, waChatId, `השיחה פגה. לחידוש פנה ל: ${agencyPhone}`);
        await db.collection('whatsapp_sessions').doc(`${agencyId}_${phone}`).delete();
        return;
    }
    // 6. Delegate to existing AI bot. Property-specific answering + agent
    //    notification (for exclusive listings) live in handleAddressQuery
    //    inside handleWeBotReply — see the rationale at the top of this file.
    await (0, handleWeBotReply_1.handleWeBotReply)(agencyId, leadId, phone, sanitized, geminiApiKey, creds, idMessage, inboundMsgDocId, resendApiKey);
}
//# sourceMappingURL=botPipeline.js.map