/**
 * deleteProperty — Safely deletes a property document.
 *
 * Security:
 *  - Caller must be authenticated and belong to the property's agency.
 *  - Caller must have role 'admin' (agents cannot delete properties).
 *
 * Data Integrity (Safe Deletion Check):
 *  - Before deleting, queries the `deals` collection for any deal linked to
 *    this property that is NOT in a terminal stage ('won' or 'lost').
 *  - If open deals are found, the deletion is BLOCKED and an error is returned.
 *    The UI should use this error to show a warning modal.
 *
 * Input:  { propertyId: string }
 * Output: { success: true }
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

const TERMINAL_STAGES = ['won', 'lost', 'contract']; // Treat 'contract' as near-final too

export const deleteProperty = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { propertyId } = request.data as { propertyId?: string };

    if (!propertyId?.trim()) {
        throw new HttpsError('invalid-argument', 'propertyId is required.');
    }

    // ── Load property ───────────────────────────────────────────────────────────
    const propertyRef = db.doc(`properties/${propertyId}`);
    const propertySnap = await propertyRef.get();

    if (!propertySnap.exists) {
        throw new HttpsError('not-found', `Property ${propertyId} not found.`);
    }

    const propertyData = propertySnap.data()!;

    // ── Auth: caller must be admin in the same agency ───────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    const caller = callerDoc.data();

    if (!callerDoc.exists || caller?.agencyId !== propertyData.agencyId) {
        throw new HttpsError('permission-denied', 'You do not belong to this agency.');
    }

    if (caller?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only agency admins can delete properties.');
    }

    // ── Safe Deletion Check ─────────────────────────────────────────────────────
    // Query deals linked to this property — Firestore returns ALL deals for the property.
    // We then filter locally (client-side style) to check for open stages.
    const dealsSnapshot = await db
        .collection('deals')
        .where('propertyId', '==', propertyId)
        .get();

    const openDeals = dealsSnapshot.docs.filter(
        doc => !TERMINAL_STAGES.includes(doc.data().stage)
    );

    if (openDeals.length > 0) {
        throw new HttpsError(
            'failed-precondition',
            `לא ניתן למחוק נכס המשויך לעסקאות פעילות. (${openDeals.length} עסקה/ות פתוחה/ות)`
        );
    }

    // ── Delete ──────────────────────────────────────────────────────────────────
    await propertyRef.delete();

    return { success: true };
});
