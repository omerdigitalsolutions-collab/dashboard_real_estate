"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiveLeads = void 0;
/**
 * getLiveLeads — Server-side read of all leads for an agency.
 *
 * ⚠️  COMPOSITE INDEXES REQUIRED:
 *   1. Collection: leads | Fields: agencyId ASC, createdAt DESC
 *   2. Collection: leads | Fields: agencyId ASC, status ASC
 *
 * NOTE: For the frontend, the real-time listener should be implemented directly
 * via the Firestore SDK on the client using onSnapshot with the same query.
 * This server-side function is useful for internal tooling, reports, and data jobs.
 *
 * Input:  { agencyId: string, statusFilter?: string }
 * Output: { leads: Lead[] }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
const VALID_STATUSES = ['new', 'contacted', 'meeting_set', 'lost', 'won'];
exports.getLiveLeads = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const agencyId = authData.agencyId;
    const { statusFilter } = request.data;
    // Validate optional statusFilter
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid statusFilter. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    // ── Query ───────────────────────────────────────────────────────────────────
    // Uses index: agencyId ASC, createdAt DESC
    let query = db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .orderBy('createdAt', 'desc');
    const snapshot = await query.get();
    let leads = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
    // Filter by status client-side to avoid requiring a 3-field composite index
    if (statusFilter) {
        leads = leads.filter((l) => l.status === statusFilter);
    }
    return { leads };
});
//# sourceMappingURL=getLiveLeads.js.map