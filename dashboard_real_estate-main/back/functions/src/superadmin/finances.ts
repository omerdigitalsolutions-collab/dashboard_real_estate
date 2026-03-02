import * as functions from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const superAdminUpdateExpenses = functions.https.onCall(async (request) => {
    // Auth: Must verify request.auth.token.superAdmin === true
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }

    const { type, action, data } = request.data;
    // Payload: { type: 'fixed' | 'variable' | 'marketing', action: 'add' | 'remove', data: any }

    if (!['fixed', 'variable', 'marketing'].includes(type) || !['add', 'remove'].includes(action) || !data) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters.');
    }

    const db = getFirestore();
    const docRef = db.collection('admin_settings').doc('finances');

    let updateField = '';
    if (type === 'fixed') updateField = 'fixedSubscriptions';
    else if (type === 'variable') updateField = 'variableCosts';
    else if (type === 'marketing') updateField = 'marketingCosts';

    const updateAction = action === 'add' ? FieldValue.arrayUnion(data) : FieldValue.arrayRemove(data);

    try {
        await docRef.set({
            [updateField]: updateAction
        }, { merge: true });

        return { success: true };
    } catch (error: any) {
        console.error('[superAdminUpdateExpenses] Error:', error);
        throw new functions.https.HttpsError('internal', 'Internal server error updating expenses.');
    }
});
