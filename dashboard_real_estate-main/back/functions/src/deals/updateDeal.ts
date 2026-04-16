import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

export const updateDeal = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);

    const { dealId, updates } = request.data as {
        dealId: string;
        updates: Record<string, any>;
    };

    if (!dealId) {
        throw new HttpsError('invalid-argument', 'dealId is required.');
    }

    if (!updates || typeof updates !== 'object') {
        throw new HttpsError('invalid-argument', 'updates object is required.');
    }

    const docRef = db.collection('deals').doc(dealId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        throw new HttpsError('not-found', 'Deal not found.');
    }

    const dealData = docSnap.data();
    if (dealData?.agencyId !== authData.agencyId) {
        throw new HttpsError('permission-denied', 'You do not have access to this deal.');
    }

    // Strip protected fields
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.agencyId;
    delete safeUpdates.createdAt;

    try {
        await docRef.update({
            ...safeUpdates,
            updatedAt: FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error: any) {
        console.error('[updateDeal] Error:', error);
        throw new HttpsError('internal', error.message || 'Failed to update deal.');
    }
});

export const deleteDeal = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);

    const { dealId } = request.data as { dealId: string };

    if (!dealId) {
        throw new HttpsError('invalid-argument', 'dealId is required.');
    }

    const docRef = db.collection('deals').doc(dealId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
        throw new HttpsError('not-found', 'Deal not found.');
    }

    const dealData = docSnap.data();
    if (dealData?.agencyId !== authData.agencyId) {
        throw new HttpsError('permission-denied', 'You do not have access to this deal.');
    }

    try {
        await docRef.delete();
        return { success: true };
    } catch (error: any) {
        console.error('[deleteDeal] Error:', error);
        throw new HttpsError('internal', error.message || 'Failed to delete deal.');
    }
});
