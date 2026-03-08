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
    // ── Trial Eligibility Check (`activeTrials`) ────────────────────────────────
    let trialEligible = true;
    // We check if this UID or Email already has an active or expired trial
    const oldTrialsMap = await db.collection('activeTrials')
        .where('uid', '==', uid)
        .where('hasUsedTrial', '==', true)
        .get();
    if (!oldTrialsMap.empty) {
        throw new https_1.HttpsError('permission-denied', 'You have already used your free trial on another agency account.');
    }
    // Secondary Anti-Abuse: Phone Number check
    const normalizedPhone = phone.trim().replace(/\D/g, '');
    if (normalizedPhone) {
        const phoneRef = db.collection('used_phones').doc(normalizedPhone);
        const phoneSnap = await phoneRef.get();
        if (phoneSnap.exists) {
            trialEligible = false; // Phone already used — no trial
        }
        else {
            // Mark phone as used for trial (write BEFORE batch to be safe)
            await phoneRef.set({ uid, email, usedAt: firestore_1.FieldValue.serverTimestamp() });
        }
    }
    // Trial ends 7 days from now (set only if eligible)
    const trialEndsDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const trialEndsAt = trialEligible ? trialEndsDate : null;
    // ── Atomic Batch Write ──────────────────────────────────────────────────────
    const agencyRef = db.collection('agencies').doc();
    const userRef = db.doc(`users/${uid}`);
    const trialRef = db.collection('activeTrials').doc();
    const batch = db.batch();
    batch.set(agencyRef, {
        name: agencyName.trim(),
        subscriptionTier: 'free',
        monthlyGoals: { commissions: 100000, deals: 5, leads: 20 },
        settings: {},
        billing: {
            planId: 'free_trial',
            status: trialEligible ? 'trialing' : 'past_due',
            trialEndsAt: trialEndsAt,
            ownerPhone: normalizedPhone,
        },
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
    if (trialEligible) {
        batch.set(trialRef, {
            agencyId: agencyRef.id,
            uid,
            trialEndsAt: trialEndsDate,
            hasUsedTrial: false,
            status: 'active',
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
    }
    await batch.commit();
    // Set custom claims mapping the user to this new agency as an admin.
    await (0, auth_1.getAuth)().setCustomUserClaims(uid, { agencyId: agencyRef.id, role: 'admin' });
    return { success: true, agencyId: agencyRef.id };
});
//# sourceMappingURL=onboarding.js.map