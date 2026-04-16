"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.superAdminHealSelf = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const db = (0, firestore_1.getFirestore)();
/**
 * Self-healing function for Super Admins.
 * If a user is present in the 'superAdmins' whitelist collection,
 * this function ensures their user document has the 'superadmin' role
 * and their auth token has the 'superAdmin' custom claim.
 */
exports.superAdminHealSelf = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in.');
    }
    const { uid } = request.auth;
    // 1. Check if user is in the whitelist
    const whiteListSnap = await db.collection('superAdmins').doc(uid).get();
    if (!whiteListSnap.exists) {
        throw new https_1.HttpsError('permission-denied', 'You are not on the Super Admin whitelist.');
    }
    try {
        // 2. Upsert user document (set with merge so it works even if the doc doesn't exist yet)
        const userRef = db.collection('users').doc(uid);
        await userRef.set({
            role: 'superadmin',
            updatedAt: new Date()
        }, { merge: true });
        // 3. Set custom claims
        const auth = (0, auth_1.getAuth)();
        const user = await auth.getUser(uid);
        const currentClaims = user.customClaims || {};
        await auth.setCustomUserClaims(uid, Object.assign(Object.assign({}, currentClaims), { superAdmin: true, role: 'superadmin' }));
        console.log(`[superAdminHealSelf] Healed user ${uid}`);
        return {
            success: true,
            message: 'Permissions healed successfully. Please LOG OUT and LOG BACK IN for changes to take effect.'
        };
    }
    catch (error) {
        console.error('[superAdminHealSelf] Error:', error);
        throw new https_1.HttpsError('internal', 'Internal error during healing process.');
    }
});
//# sourceMappingURL=healAdmin.js.map