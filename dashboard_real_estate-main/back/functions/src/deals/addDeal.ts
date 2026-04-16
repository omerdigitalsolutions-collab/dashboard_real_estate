import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

export const addDeal = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);

    const {
        propertyId,
        buyerId,
        sellerId,
        agentId,
        stage,
        projectedCommission,
        isVatIncluded,
        createdBy
    } = request.data as {
        propertyId: string;
        buyerId?: string;
        sellerId?: string;
        agentId?: string;
        stage: string;
        projectedCommission: number;
        isVatIncluded: boolean;
        createdBy: string;
    };

    if (!propertyId) {
        throw new HttpsError('invalid-argument', 'propertyId is required.');
    }

    try {
        const dealData = {
            agencyId: authData.agencyId,
            propertyId,
            buyerId: buyerId || null,
            sellerId: sellerId || null,
            agentId: agentId || null,
            stage,
            projectedCommission: Number(projectedCommission) || 0,
            isVatIncluded: !!isVatIncluded,
            createdBy: createdBy || authData.uid,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('deals').add(dealData);
        return { success: true, id: docRef.id };
    } catch (error: any) {
        console.error('[addDeal] Error:', error);
        throw new HttpsError('internal', error.message || 'Failed to create deal.');
    }
});
