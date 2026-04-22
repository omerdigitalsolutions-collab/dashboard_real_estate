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
 *   6. Property-specific routing (exclusive → agent, other → admin)
 *   7. Delegate to handleWeBotReply
 *   8. Audit log every interaction
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
    const ref = db.collection('whatsapp_sessions').doc(phone);
    const now = admin.firestore.Timestamp.now();
    const snap = await ref.get();
    if (snap.exists) {
        await ref.update({ lastMessageAt: now });
        return Object.assign({ id: snap.id }, snap.data());
    }
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + SESSION_TTL_MS);
    const session = { phone, agencyId, createdAt: now, lastMessageAt: now, expiresAt, status: 'active' };
    await ref.set(session);
    return Object.assign({ id: phone }, session);
}
// ─── Property-specific routing ─────────────────────────────────────────────────
// Returns true if the message was handled (conversation should not continue to AI bot).
async function handlePropertyRouting(phone, waChatId, text, agencyId, creds) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const propertyKeywords = ['רחוב', 'כתובת', 'נכס ב', 'דירה ב', 'הנכס ב', 'פרויקט', 'מגדל', 'גוש', 'חלקה', 'קומה'];
    if (!propertyKeywords.some((kw) => text.includes(kw)))
        return false;
    const words = text.split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0)
        return false;
    const propSnap = await db
        .collection('agencies').doc(agencyId).collection('properties')
        .where('status', '==', 'active')
        .limit(50)
        .get();
    const matched = propSnap.docs.find((doc) => {
        const d = doc.data();
        const addrObj = d.address;
        const haystack = [
            typeof addrObj === 'object' ? addrObj === null || addrObj === void 0 ? void 0 : addrObj.fullAddress : addrObj,
            addrObj === null || addrObj === void 0 ? void 0 : addrObj.street,
            addrObj === null || addrObj === void 0 ? void 0 : addrObj.city,
            addrObj === null || addrObj === void 0 ? void 0 : addrObj.neighborhood,
        ].filter(Boolean).join(' ').toLowerCase();
        return words.some((w) => haystack.includes(w.toLowerCase()));
    });
    if (!matched)
        return false;
    const prop = matched.data();
    const assignedAgentId = ((_a = prop.management) === null || _a === void 0 ? void 0 : _a.assignedAgentId) || prop.agentId || null;
    const toIntl = (p) => `${p.replace(/^0/, '972')}@c.us`;
    if (prop.isExclusive && assignedAgentId) {
        const agentDoc = await db.collection('users').doc(assignedAgentId).get();
        const agentPhone = ((_b = agentDoc.data()) === null || _b === void 0 ? void 0 : _b.phone) || ((_c = agentDoc.data()) === null || _c === void 0 ? void 0 : _c.phoneNumber) || null;
        if (agentPhone) {
            const desc = ((_d = prop.address) === null || _d === void 0 ? void 0 : _d.fullAddress) || ((_e = prop.address) === null || _e === void 0 ? void 0 : _e.city) || prop.city || 'נכס';
            await sendDirect(creds, toIntl(agentPhone), `🏠 *פנייה ישירה לנכס — מהבוט*\nטלפון לקוח: ${phone}\nשאל על: ${desc}\n\nהודעה:\n"${text}"`);
            await sendDirect(creds, waChatId, 'מעביר אותך לסוכן שאחראי על הנכס — הוא יחזור אליך בהקדם. 🏡');
            return true;
        }
    }
    // Non-exclusive or no agent phone → admin + create lead notification
    const adminSnap = await db
        .collection('users')
        .where('agencyId', '==', agencyId)
        .where('role', '==', 'admin')
        .where('isActive', '==', true)
        .limit(1)
        .get();
    if (!adminSnap.empty) {
        const adminPhone = ((_f = adminSnap.docs[0].data()) === null || _f === void 0 ? void 0 : _f.phone) || ((_g = adminSnap.docs[0].data()) === null || _g === void 0 ? void 0 : _g.phoneNumber) || null;
        if (adminPhone) {
            await sendDirect(creds, toIntl(adminPhone), `🏠 *ליד חדש מהבוט*\nטלפון: ${phone}\nשאל על: ${((_h = prop.address) === null || _h === void 0 ? void 0 : _h.fullAddress) || ((_j = prop.address) === null || _j === void 0 ? void 0 : _j.city) || prop.city || 'נכס'}\n\nהודעה:\n"${text}"`);
        }
    }
    await sendDirect(creds, waChatId, 'פנינו לנציג שיחזור אליך בהקדם. 🏡');
    return true;
}
// ─── Main export ──────────────────────────────────────────────────────────────
async function processInboundMessage(params) {
    var _a, _b, _c;
    const { phone, waChatId, text, agencyId, leadId, geminiApiKey, creds, idMessage, inboundMsgDocId } = params;
    // 1. Blocklist
    if (await (0, blocklist_1.checkBlocklist)(phone)) {
        await writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'blocklist' });
        return;
    }
    // 2. Rate limit
    if (!(await (0, rateLimiter_1.checkRateLimit)(phone))) {
        await sendDirect(creds, waChatId, RATE_LIMITED_MSG);
        await writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'rate_limit' });
        return;
    }
    // 3. Sanitize
    const sanitized = (0, sanitizeInput_1.sanitizeInput)(text);
    // 4. Injection detection
    const { isInjection, score } = (0, detectInjection_1.detectInjection)(sanitized);
    if (isInjection) {
        const suspRef = db.collection('whatsapp_suspicious').doc(phone);
        const suspSnap = await suspRef.get();
        const prev = suspSnap.exists ? ((_a = suspSnap.data().score) !== null && _a !== void 0 ? _a : 0) : 0;
        const newScore = prev + score;
        await suspRef.set({ phone, agencyId, score: newScore, lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        if (newScore >= 3) {
            await (0, blocklist_1.blockPhone)(phone, `injection_attempts_score_${newScore}`);
            await writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'auto_block_injection', score: newScore });
            return;
        }
        await writeAuditLog(phone, agencyId, 'inbound', sanitized, { injectionScore: newScore, flagged: true });
        // Continue — system prompt handles the injection attempt gracefully
    }
    else {
        await writeAuditLog(phone, agencyId, 'inbound', sanitized);
    }
    // 5. Security session TTL (rolling 24h — expires 24h after last message, not after creation)
    const session = await getOrCreateSession(phone, agencyId);
    const lastActive = session.lastMessageAt
        ? session.lastMessageAt.toMillis()
        : 0;
    const isExpired = session.status === 'expired' ||
        (Date.now() - lastActive > SESSION_TTL_MS);
    if (isExpired) {
        const agencyDoc = await db.collection('agencies').doc(agencyId).get();
        const agencyPhone = ((_b = agencyDoc.data()) === null || _b === void 0 ? void 0 : _b.phone) || ((_c = agencyDoc.data()) === null || _c === void 0 ? void 0 : _c.phoneNumber) || '';
        await sendDirect(creds, waChatId, `השיחה פגה. לחידוש פנה ל: ${agencyPhone}`);
        await db.collection('whatsapp_sessions').doc(phone).delete();
        return;
    }
    // 6. Property-specific routing
    const wasRouted = await handlePropertyRouting(phone, waChatId, sanitized, agencyId, creds);
    if (wasRouted) {
        await writeAuditLog(phone, agencyId, 'outbound', '[property routing]', { routed: true });
        return;
    }
    // 7. Delegate to existing AI bot
    await (0, handleWeBotReply_1.handleWeBotReply)(agencyId, leadId, phone, sanitized, geminiApiKey, creds, idMessage, inboundMsgDocId);
}
//# sourceMappingURL=botPipeline.js.map