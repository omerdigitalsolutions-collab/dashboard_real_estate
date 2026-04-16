import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const db = getFirestore();

/**
 * Self-healing function for Super Admins.
 * If a user is present in the 'superAdmins' whitelist collection, 
 * this function ensures their user document has the 'superadmin' role 
 * and their auth token has the 'superAdmin' custom claim.
 */
export const superAdminHealSelf = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in.');
    }

    const { uid } = request.auth;
    
    // 1. Check if user is in the whitelist
    const whiteListSnap = await db.collection('superAdmins').doc(uid).get();
    
    if (!whiteListSnap.exists) {
        throw new HttpsError('permission-denied', 'You are not on the Super Admin whitelist.');
    }

    try {
        // 2. Upsert user document (set with merge so it works even if the doc doesn't exist yet)
        const userRef = db.collection('users').doc(uid);
        await userRef.set({
            role: 'superadmin',
            updatedAt: new Date()
        }, { merge: true });

        // 3. Set custom claims
        const auth = getAuth();
        const user = await auth.getUser(uid);
        const currentClaims = user.customClaims || {};

        await auth.setCustomUserClaims(uid, {
            ...currentClaims,
            superAdmin: true,
            role: 'superadmin'
        });

        console.log(`[superAdminHealSelf] Healed user ${uid}`);
        
        return { 
            success: true, 
            message: 'Permissions healed successfully. Please LOG OUT and LOG BACK IN for changes to take effect.' 
        };
    } catch (error: any) {
        console.error('[superAdminHealSelf] Error:', error);
        throw new HttpsError('internal', 'Internal error during healing process.');
    }
});
