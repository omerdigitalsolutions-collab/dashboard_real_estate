"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLead = void 0;
/**
 * addLead — Manually creates a new lead from within the CRM.
 *
 * Used by: agents adding a lead from a phone call or walk-in.
 * Security: Caller must be authenticated and belong to the target agencyId.
 *
 * Input:
 *   {
 *     agencyId: string,
 *     name: string,
 *     phone: string,
 *     email?: string,
 *     source?: string,
 *     requirements?: { desiredCity?: string[], maxBudget?: number, minRooms?: number, propertyType?: string[] }
 *   }
 *
 * Output: { success: true, leadId: string }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
exports.addLead = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    // ── Auth & Agency validation ────────────────────────────────────────────────
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const data = request.data;
    // ── Validation ──────────────────────────────────────────────────────────────
    if (!((_a = data.name) === null || _a === void 0 ? void 0 : _a.trim()))
        throw new https_1.HttpsError('invalid-argument', 'name is required.');
    if (!((_b = data.phone) === null || _b === void 0 ? void 0 : _b.trim()))
        throw new https_1.HttpsError('invalid-argument', 'phone is required.');
    // ── Create lead ─────────────────────────────────────────────────────────────
    const leadRef = db.collection('leads').doc();
    await leadRef.set({
        agencyId: authData.agencyId,
        name: data.name.trim(),
        phone: data.phone.trim(),
        email: (_d = (_c = data.email) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : null,
        source: (_f = (_e = data.source) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : 'manual',
        requirements: {
            desiredCity: (_h = (_g = data.requirements) === null || _g === void 0 ? void 0 : _g.desiredCity) !== null && _h !== void 0 ? _h : [],
            maxBudget: (_k = (_j = data.requirements) === null || _j === void 0 ? void 0 : _j.maxBudget) !== null && _k !== void 0 ? _k : null,
            minRooms: (_m = (_l = data.requirements) === null || _l === void 0 ? void 0 : _l.minRooms) !== null && _m !== void 0 ? _m : null,
            propertyType: (_p = (_o = data.requirements) === null || _o === void 0 ? void 0 : _o.propertyType) !== null && _p !== void 0 ? _p : [],
        },
        assignedAgentId: authData.uid, // auto-assign to the creating agent
        notes: null,
        status: 'new', // always server-injected
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { success: true, leadId: leadRef.id };
});
//# sourceMappingURL=addLead.js.map