"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUserAuth = validateUserAuth;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
/**
 * Validates a CallableRequest to ensure the user is authenticated, exists in Firestore,
 * and is actively assigned to an agency.
 *
 * @param request The incoming CallableRequest from Firebase Functions v2
 * @returns AuthGuardResult containing the user's verified uid, agencyId, role, and active status.
 * @throws HttpsError ('unauthenticated', 'permission-denied', or 'not-found')
 */
async function validateUserAuth(request) {
    // 1. Enforce Firebase Auth
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { uid, token } = request.auth;
    const email = (token === null || token === void 0 ? void 0 : token.email) || '';
    // 2. Fetch User Record from Firestore
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
        throw new https_1.HttpsError('not-found', 'User record not found in the database.');
    }
    const userData = userSnap.data();
    // 3. Verify Agency Membership
    if (!userData.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'User is not associated with any agency.');
    }
    // 4. Verify Active Status
    if (typeof userData.isActive === 'boolean' && !userData.isActive) {
        throw new https_1.HttpsError('permission-denied', 'Your account has been suspended.');
    }
    return {
        uid,
        agencyId: userData.agencyId,
        role: userData.role || 'agent',
        isActive: true, // We already threw an error if it was false on line 51
        email
    };
}
//# sourceMappingURL=authGuard.js.map