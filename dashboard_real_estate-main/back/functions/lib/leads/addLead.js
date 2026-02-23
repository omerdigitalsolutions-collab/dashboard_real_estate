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
const db = (0, firestore_1.getFirestore)();
exports.addLead = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const data = request.data;
    // ── Validation ──────────────────────────────────────────────────────────────
    if (!((_a = data.agencyId) === null || _a === void 0 ? void 0 : _a.trim()))
        throw new https_1.HttpsError('invalid-argument', 'agencyId is required.');
    if (!((_b = data.name) === null || _b === void 0 ? void 0 : _b.trim()))
        throw new https_1.HttpsError('invalid-argument', 'name is required.');
    if (!((_c = data.phone) === null || _c === void 0 ? void 0 : _c.trim()))
        throw new https_1.HttpsError('invalid-argument', 'phone is required.');
    // ── Agency membership check ─────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || ((_d = callerDoc.data()) === null || _d === void 0 ? void 0 : _d.agencyId) !== data.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not belong to this agency.');
    }
    // ── Create lead ─────────────────────────────────────────────────────────────
    const leadRef = db.collection('leads').doc();
    await leadRef.set({
        agencyId: data.agencyId,
        name: data.name.trim(),
        phone: data.phone.trim(),
        email: (_f = (_e = data.email) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : null,
        source: (_h = (_g = data.source) === null || _g === void 0 ? void 0 : _g.trim()) !== null && _h !== void 0 ? _h : 'manual',
        requirements: {
            desiredCity: (_k = (_j = data.requirements) === null || _j === void 0 ? void 0 : _j.desiredCity) !== null && _k !== void 0 ? _k : [],
            maxBudget: (_m = (_l = data.requirements) === null || _l === void 0 ? void 0 : _l.maxBudget) !== null && _m !== void 0 ? _m : null,
            minRooms: (_p = (_o = data.requirements) === null || _o === void 0 ? void 0 : _o.minRooms) !== null && _p !== void 0 ? _p : null,
            propertyType: (_r = (_q = data.requirements) === null || _q === void 0 ? void 0 : _q.propertyType) !== null && _r !== void 0 ? _r : [],
        },
        assignedAgentId: request.auth.uid, // auto-assign to the creating agent
        notes: null,
        status: 'new', // always server-injected
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { success: true, leadId: leadRef.id };
});
//# sourceMappingURL=addLead.js.map