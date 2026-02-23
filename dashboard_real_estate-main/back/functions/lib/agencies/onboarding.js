"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgencyAccount = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const db = (0, firestore_1.getFirestore)();
/**
 * createAgencyAccount — Called when a new admin completes onboarding.
 *
 * Creates:
 *   1. A new `agencies` document.
 *   2. A `users/{uid}` document linked to the new agency.
 *
 * Security: Requires an authenticated Firebase user.
 *
 * Input:  { agencyName: string, userName: string, phone: string }
 * Output: { success: true, agencyId: string }
 */
exports.createAgencyAccount = (0, https_1.onCall)(async (request) => {
    var _a;
    // ── Auth Guard ──────────────────────────────────────────────────────────────
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to create an agency account.');
    }
    const uid = request.auth.uid;
    const email = (_a = request.auth.token.email) !== null && _a !== void 0 ? _a : '';
    // ── Input Validation ────────────────────────────────────────────────────────
    const { agencyName, userName, phone } = request.data;
    if (!(agencyName === null || agencyName === void 0 ? void 0 : agencyName.trim()) || !(userName === null || userName === void 0 ? void 0 : userName.trim()) || !(phone === null || phone === void 0 ? void 0 : phone.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'agencyName, userName, and phone are all required.');
    }
    // ── Already onboarded? ──────────────────────────────────────────────────────
    const existingUser = await db.doc(`users/${uid}`).get();
    if (existingUser.exists) {
        throw new https_1.HttpsError('already-exists', 'User is already associated with an agency.');
    }
    // ── Atomic Batch Write ──────────────────────────────────────────────────────
    const agencyRef = db.collection('agencies').doc(); // auto-ID
    const userRef = db.doc(`users/${uid}`);
    const batch = db.batch();
    batch.set(agencyRef, {
        name: agencyName.trim(),
        subscriptionTier: 'free',
        monthlyGoals: {
            commissions: 100000,
            deals: 5,
            leads: 20,
        },
        settings: {},
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    batch.set(userRef, {
        uid,
        email,
        name: userName.trim(),
        phone: phone.trim(),
        agencyId: agencyRef.id,
        role: 'admin',
        isActive: true,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    // Set custom claims mapping the user to this new agency as an admin.
    await (0, auth_1.getAuth)().setCustomUserClaims(uid, { agencyId: agencyRef.id, role: 'admin' });
    return { success: true, agencyId: agencyRef.id };
});
//# sourceMappingURL=onboarding.js.map