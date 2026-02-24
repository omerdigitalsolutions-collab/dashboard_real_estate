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
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

const VALID_STATUSES = ['new', 'contacted', 'meeting_set', 'lost', 'won'];

export const getLiveLeads = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { agencyId, statusFilter } = request.data as {
        agencyId?: string;
        statusFilter?: string;
    };

    if (!agencyId?.trim()) {
        throw new HttpsError('invalid-argument', 'agencyId is required.');
    }

    // Validate optional statusFilter
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
        throw new HttpsError(
            'invalid-argument',
            `Invalid statusFilter. Must be one of: ${VALID_STATUSES.join(', ')}`
        );
    }

    // ── Agency membership check ─────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || callerDoc.data()?.agencyId !== agencyId) {
        throw new HttpsError('permission-denied', 'Access denied to this agency.');
    }

    // ── Query ───────────────────────────────────────────────────────────────────
    // Uses index: agencyId ASC, createdAt DESC
    let query = db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .orderBy('createdAt', 'desc');

    const snapshot = await query.get();

    let leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filter by status client-side to avoid requiring a 3-field composite index
    if (statusFilter) {
        leads = leads.filter((l: any) => l.status === statusFilter);
    }

    return { leads };
});
