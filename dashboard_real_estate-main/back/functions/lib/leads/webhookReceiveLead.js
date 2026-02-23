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
exports.webhookReceiveLead = void 0;
/**
 * webhookReceiveLead — Public HTTPS endpoint for receiving leads from external
 * marketing platforms (e.g., Facebook Lead Ads via Make.com).
 *
 * Security Design:
 *  - Uses `crypto.timingSafeEqual()` to validate a shared secret key from request headers.
 *  - Returns HTTP 200 on ALL responses (including invalid secret) to prevent endpoint discovery.
 *  - Logs all invalid attempts internally without exposing any information to the caller.
 *
 * URL format: POST /webhookReceiveLead?agencyId=<id>
 * Headers:    x-webhook-secret: <WEBHOOK_SECRET env var>
 *
 * Body (JSON):
 *   {
 *     name?: string,
 *     phone?: string,
 *     email?: string,
 *     source?: string,
 *     requirements?: { desiredCity?: string[], maxBudget?: number, minRooms?: number, propertyType?: string[] }
 *   }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const crypto = __importStar(require("crypto"));
const db = (0, firestore_1.getFirestore)();
exports.webhookReceiveLead = (0, https_1.onRequest)(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    // ── Only accept POST ─────────────────────────────────────────────────────────
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    // ── Extract agencyId from query params ───────────────────────────────────────
    const agencyId = typeof req.query.agencyId === 'string' ? req.query.agencyId.trim() : '';
    if (!agencyId) {
        // Stealth: return 200 but log the problem internally
        console.error('[webhookReceiveLead] Missing agencyId in query params. Request ignored.');
        res.status(200).json({ success: true });
        return;
    }
    // ── Timing-safe secret validation ────────────────────────────────────────────
    const incomingSecret = req.headers['x-webhook-secret'];
    const expectedSecret = (_a = process.env.WEBHOOK_SECRET) !== null && _a !== void 0 ? _a : '';
    let secretValid = false;
    try {
        if (typeof incomingSecret === 'string' &&
            expectedSecret.length > 0 &&
            incomingSecret.length === expectedSecret.length) {
            secretValid = crypto.timingSafeEqual(Buffer.from(incomingSecret, 'utf8'), Buffer.from(expectedSecret, 'utf8'));
        }
    }
    catch (_t) {
        secretValid = false;
    }
    if (!secretValid) {
        // Stealth response — do NOT hint at auth failure
        console.warn(`[webhookReceiveLead] Invalid secret for agencyId="${agencyId}". IP: ${req.ip}`);
        res.status(200).json({ success: true });
        return;
    }
    // ── Parse incoming lead data ─────────────────────────────────────────────────
    let body;
    try {
        body = req.body || {};
    }
    catch (_u) {
        res.status(200).json({ success: true });
        return;
    }
    // ── Write to Firestore ───────────────────────────────────────────────────────
    try {
        await db.collection('leads').add({
            agencyId,
            name: (_c = (_b = body.name) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : null,
            phone: (_e = (_d = body.phone) === null || _d === void 0 ? void 0 : _d.trim()) !== null && _e !== void 0 ? _e : null,
            email: (_g = (_f = body.email) === null || _f === void 0 ? void 0 : _f.trim()) !== null && _g !== void 0 ? _g : null,
            source: (_j = (_h = body.source) === null || _h === void 0 ? void 0 : _h.trim()) !== null && _j !== void 0 ? _j : 'webhook',
            requirements: {
                desiredCity: (_l = (_k = body.requirements) === null || _k === void 0 ? void 0 : _k.desiredCity) !== null && _l !== void 0 ? _l : [],
                maxBudget: (_o = (_m = body.requirements) === null || _m === void 0 ? void 0 : _m.maxBudget) !== null && _o !== void 0 ? _o : null,
                minRooms: (_q = (_p = body.requirements) === null || _p === void 0 ? void 0 : _p.minRooms) !== null && _q !== void 0 ? _q : null,
                propertyType: (_s = (_r = body.requirements) === null || _r === void 0 ? void 0 : _r.propertyType) !== null && _s !== void 0 ? _s : [],
            },
            assignedAgentId: null,
            notes: null,
            status: 'new', // Always injected server-side
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        console.info(`[webhookReceiveLead] Lead created for agencyId="${agencyId}".`);
        res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('[webhookReceiveLead] Firestore write failed:', err);
        // We can either stealth error or 500 here. 
        // Returning 200 with success: true is strict stealth.
        res.status(200).json({ success: true });
    }
});
//# sourceMappingURL=webhookReceiveLead.js.map