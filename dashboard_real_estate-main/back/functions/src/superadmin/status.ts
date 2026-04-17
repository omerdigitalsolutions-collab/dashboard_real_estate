import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * superAdminSetAgencyStatus
 * 
 * Toggles an agency's status between 'active' and 'suspended'.
 * If suspended, all users in that agency are also deactivated.
 */
export const superAdminSetAgencyStatus = functions.https.onCall({ cors: true }, async (request) => {
    // 1. Security: Strict Super Admin check
    if (!request.auth || (request.auth.token.superAdmin !== true && request.auth.token.role !== 'superadmin')) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'You must be a Super Admin to perform this action.'
        );
    }

    const { agencyId, status } = request.data as { agencyId: string, status: 'active' | 'suspended' };

    if (!agencyId || !status) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required parameters: agencyId and status.'
        );
    }

    const db = getFirestore();
    const agencyRef = db.collection('agencies').doc(agencyId);

    try {
        const batch = db.batch();

        // Update Agency status
        batch.update(agencyRef, { status: status });

        // 2. Cascading Logic: If suspended, deactivate all users in this agency
        if (status === 'suspended') {
            const usersSnap = await db.collection('users').where('agencyId', '==', agencyId).get();
            usersSnap.forEach((userDoc) => {
                batch.update(userDoc.ref, { isActive: false });
            });
        } else if (status === 'active') {
             // Optional: Reactivate all users? Usually, it's safer to let admin decide,
             // but if the whole agency is back, maybe we should reactivate them.
             // For now, let's just reactivate them so they can work again.
             const usersSnap = await db.collection('users').where('agencyId', '==', agencyId).get();
             usersSnap.forEach((userDoc) => {
                 batch.update(userDoc.ref, { isActive: true });
             });
        }

        await batch.commit();

        return { 
            success: true, 
            message: `Agency ${agencyId} status updated to ${status}.${status === 'suspended' ? ' All users deactivated.' : ' All users reactivated.'}` 
        };
    } catch (error: any) {
        console.error('[superAdminSetAgencyStatus] Error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to update agency status.');
    }
});

/**
 * superAdminSetUserStatus
 * 
 * Toggles an individual user's isActive status.
 */
export const superAdminSetUserStatus = functions.https.onCall({ cors: true }, async (request) => {
    // 1. Security: Strict Super Admin check
    if (!request.auth || (request.auth.token.superAdmin !== true && request.auth.token.role !== 'superadmin')) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'You must be a Super Admin to perform this action.'
        );
    }

    const { userId, isActive } = request.data as { userId: string, isActive: boolean };

    if (!userId || typeof isActive !== 'boolean') {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required parameters: userId and isActive.'
        );
    }

    const db = getFirestore();
    const userRef = db.collection('users').doc(userId);

    try {
        await userRef.update({ isActive: isActive });

        return { 
            success: true, 
            message: `User ${userId} status set to ${isActive ? 'active' : 'inactive'}.` 
        };
    } catch (error: any) {
        console.error('[superAdminSetUserStatus] Error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to update user status.');
    }
});
