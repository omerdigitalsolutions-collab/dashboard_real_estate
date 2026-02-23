"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateLead = void 0;
/**
 * updateLead — Partial update for a lead document.
 *
 * Allowed updates: status, assignedAgentId, notes, requirements, name, phone, email.
 * Forbidden updates: agencyId, createdAt (stripped server-side).
 *
 * Security: Caller must be authenticated and belong to the same agency as the lead.
 *
 * Input:
 *   {
 *     leadId: string,
 *     updates: Partial<Lead>
 *   }
 *
 * Output: { success: true }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
const VALID_STATUSES = ['new', 'contacted', 'meeting_set', 'lost', 'won'];
const IMMUTABLE_FIELDS = ['agencyId', 'createdAt', 'id'];
exports.updateLead = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { leadId, updates } = request.data;
    if (!(leadId === null || leadId === void 0 ? void 0 : leadId.trim()))
        throw new https_1.HttpsError('invalid-argument', 'leadId is required.');
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'updates must be a non-empty object.');
    }
    // ── Validate status value if provided ──────────────────────────────────────
    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    // ── Load lead and verify access ────────────────────────────────────────────
    const leadRef = db.doc(`leads/${leadId}`);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
        throw new https_1.HttpsError('not-found', `Lead ${leadId} not found.`);
    }
    const leadAgencyId = (_a = leadSnap.data()) === null || _a === void 0 ? void 0 : _a.agencyId;
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || ((_b = callerDoc.data()) === null || _b === void 0 ? void 0 : _b.agencyId) !== leadAgencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not have access to this lead.');
    }
    // ── Strip immutable fields ─────────────────────────────────────────────────
    const safeUpdates = Object.assign({}, updates);
    for (const field of IMMUTABLE_FIELDS) {
        delete safeUpdates[field];
    }
    await leadRef.update(safeUpdates);
    return { success: true };
});
//# sourceMappingURL=updateLead.js.map