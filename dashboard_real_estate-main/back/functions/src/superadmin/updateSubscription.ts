import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

export const superAdminUpdateAgencyPlan = functions.https.onCall({ cors: true }, async (request) => {
    // Auth: Must verify request.auth.token.superAdmin === true
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'You must be a Super Admin to perform this action.'
        );
    }

    const { agencyId, newPlanId } = request.data as { agencyId: string, newPlanId: string };

    if (!agencyId || !newPlanId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required parameters: agencyId and newPlanId.'
        );
    }

    const validPlans = ['free', 'starter', 'pro', 'boutique', 'enterprise', 'basic', 'advanced', 'premium'];
    if (!validPlans.includes(newPlanId.toLowerCase())) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid plan ID provided.'
        );
    }

    const db = getFirestore();
    const agencyRef = db.collection('agencies').doc(agencyId);

    try {
        await agencyRef.update({
            planId: newPlanId.toLowerCase(),
            subscriptionTier: newPlanId.toLowerCase() // Legacy support if needed somewhere else
        });

        return { success: true, message: `Agency plan updated to ${newPlanId}` };
    } catch (error: any) {
        console.error('[superAdminUpdateAgencyPlan] Error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to update agency plan.');
    }
});
