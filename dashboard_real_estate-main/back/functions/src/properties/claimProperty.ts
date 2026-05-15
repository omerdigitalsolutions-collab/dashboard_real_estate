import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

export const claimProperty = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);
    const { propertyId } = request.data as { propertyId?: string };

    if (!propertyId?.trim()) throw new HttpsError('invalid-argument', 'propertyId is required.');

    const agencyId = authData.agencyId;
    const propertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc(propertyId);

    // Fetch agent name outside transaction
    const userSnap = await db.collection('users').doc(authData.uid).get();
    const agentName = userSnap.data()?.name ?? '';

    // Use transaction to ensure atomicity: check + claim together
    await db.runTransaction(async (transaction) => {
        const propertySnap = await transaction.get(propertyRef);

        if (!propertySnap.exists) throw new HttpsError('not-found', 'Property not found.');

        const data = propertySnap.data()!;
        if (data.agencyId !== agencyId) throw new HttpsError('permission-denied', 'Access denied.');
        if (data.management?.assignedAgentId) throw new HttpsError('already-exists', 'Property already claimed.');

        transaction.update(propertyRef, {
            'management.assignedAgentId': authData.uid,
            'management.assignedAgentName': agentName,
            updatedAt: FieldValue.serverTimestamp(),
        });
    });

    return { success: true };
});
