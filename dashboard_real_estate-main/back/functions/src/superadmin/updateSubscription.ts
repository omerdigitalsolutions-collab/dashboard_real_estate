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

export const superAdminReactivateBilling = functions.https.onCall({ cors: true }, async (request) => {
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'You must be a Super Admin to perform this action.'
        );
    }

    const { agencyId, action } = request.data as { agencyId: string, action: 'activate' | 'extend' };

    if (!agencyId || !action) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required parameters: agencyId and action.'
        );
    }

    const db = getFirestore();
    const agencyRef = db.collection('agencies').doc(agencyId);

    try {
        if (action === 'activate') {
            await agencyRef.update({
                'billing.status': 'active',
                'status': 'active'
            });
            return { success: true, message: `Agency reactivated (Status: active).` };
        } else if (action === 'extend') {
            // Extend trial by 7 days from NOW
            const newTrialEnd = new Date();
            newTrialEnd.setDate(newTrialEnd.getDate() + 7);
            
            await agencyRef.update({
                'billing.status': 'trialing',
                'billing.trialEndsAt': Timestamp.fromDate(newTrialEnd),
                'status': 'active' // Ensure the agency itself is active
            });
            return { success: true, message: `Trial extended by 7 days until ${newTrialEnd.toLocaleDateString()}.` };
        } else {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid action.');
        }
    } catch (error: any) {
        console.error('[superAdminReactivateBilling] Error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to perform billing action.');
    }
});


