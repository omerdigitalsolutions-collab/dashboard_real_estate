import * as functions from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Temporary function to grant superAdmin custom claims to authorized users.
 * Checks if the user's UID exists in the 'superAdmins' Firestore collection.
 */
export const setupSuperAdmin = functions.https.onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const uid = request.auth.uid;
    const db = getFirestore();
    const superAdminRef = db.collection('superAdmins').doc(uid);
    const docSnap = await superAdminRef.get();

    if (!docSnap.exists) {
        throw new functions.https.HttpsError('permission-denied', 'User is not authorized as a Super Admin in Firestore.');
    }

    try {
        const auth = getAuth();
        const user = await auth.getUser(uid);
        const currentClaims = user.customClaims || {};

        await auth.setCustomUserClaims(uid, {
            ...currentClaims,
            superAdmin: true,
            role: 'superadmin'
        });

        console.log(`Successfully granted superAdmin claim to user: ${uid}`);
        return { success: true, message: 'Super Admin permissions granted. Please log out and log back in to refresh your token.' };
    } catch (error: any) {
        console.error('Error setting superAdmin claim:', error);
        throw new functions.https.HttpsError('internal', 'An error occurred while setting custom claims.');
    }
});
