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
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

const VALID_STATUSES = ['new', 'contacted', 'meeting_set', 'lost', 'won', 'potential_seller', 'searching'];
const IMMUTABLE_FIELDS = ['agencyId', 'createdAt', 'id'];

export const updateLead = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);

    const { leadId, updates } = request.data as {
        leadId?: string;
        updates?: Record<string, unknown>;
    };

    if (!leadId?.trim()) throw new HttpsError('invalid-argument', 'leadId is required.');
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'updates must be a non-empty object.');
    }

    // ── Validate status value if provided ──────────────────────────────────────
    if (updates.status && !VALID_STATUSES.includes(updates.status as string)) {
        throw new HttpsError(
            'invalid-argument',
            `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
        );
    }

    // ── Load lead and verify access ────────────────────────────────────────────
    const leadRef = db.doc(`leads/${leadId}`);
    const leadSnap = await leadRef.get();

    if (!leadSnap.exists) {
        throw new HttpsError('not-found', `Lead ${leadId} not found.`);
    }

    const leadAgencyId = leadSnap.data()?.agencyId;

    if (authData.agencyId !== leadAgencyId) {
        throw new HttpsError('permission-denied', 'You do not have access to this lead.');
    }

    // ── Strip immutable fields ─────────────────────────────────────────────────
    const safeUpdates = { ...updates };
    for (const field of IMMUTABLE_FIELDS) {
        delete safeUpdates[field];
    }

    await leadRef.update(safeUpdates);

    return { success: true };
});
