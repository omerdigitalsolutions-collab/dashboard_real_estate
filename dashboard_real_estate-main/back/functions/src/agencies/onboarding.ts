import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const db = getFirestore();

/**
 * checkPhoneAvailable — Checks if a given phone number is already registered in the system.
 */
export const checkPhoneAvailable = onCall({ cors: true }, async (request) => {
    let { phone } = request.data as { phone?: string };
    if (!phone?.trim()) {
        throw new HttpsError('invalid-argument', 'phone is required.');
    }

    // Assume phone arrives in E.164 format from the client e.g. +9725...
    // The normalized phone for the DB is exactly the E.164 string to be strict.
    const phoneRef = db.collection('used_phones').doc(phone);
    const snap = await phoneRef.get();

    return { available: !snap.exists };
});

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
export const createAgencyAccount = onCall({ cors: true }, async (request) => {
    // ── Auth Guard ──────────────────────────────────────────────────────────────
    if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be signed in to create an agency account.'
        );
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email ?? '';

    // ── Input Validation ────────────────────────────────────────────────────────
    const { agencyName, userName, phone } = request.data as {
        agencyName?: string;
        userName?: string;
        phone?: string;
    };

    if (!agencyName?.trim() || !userName?.trim() || !phone?.trim()) {
        throw new HttpsError(
            'invalid-argument',
            'agencyName, userName, and phone are all required.'
        );
    }

    // ── Already onboarded? ──────────────────────────────────────────────────────
    const existingUser = await db.doc(`users/${uid}`).get();
    if (existingUser.exists) {
        throw new HttpsError(
            'already-exists',
            'User is already associated with an agency.'
        );
    }

    // ── Trial Eligibility Check (`activeTrials`) ────────────────────────────────
    let trialEligible = true;

    // We check if this UID or Email already has an active or expired trial
    const oldTrialsMap = await db.collection('activeTrials')
        .where('uid', '==', uid)
        .where('hasUsedTrial', '==', true)
        .get();

    if (!oldTrialsMap.empty) {
        throw new HttpsError(
            'permission-denied',
            'You have already used your free trial on another agency account.'
        );
    }

    // ── Phone Verification & Uniqueness Check ───────────────────────────────────
    // Phone must arrive in E.164 format (e.g., +97250...)
    const normalizedPhone = phone.trim();

    // 1. Ensure the user actually verified this phone via Firebase Phone Auth
    const userRecord = await getAuth().getUser(uid);
    if (userRecord.phoneNumber !== normalizedPhone) {
        throw new HttpsError(
            'permission-denied',
            `Phone number mismatch or not verified. Expected ${normalizedPhone} but Auth has ${userRecord.phoneNumber || 'None'}`
        );
    }

    // 2. Ensure phone is absolutely unique
    const phoneRef = db.collection('used_phones').doc(normalizedPhone);
    const phoneSnap = await phoneRef.get();
    if (phoneSnap.exists) {
        throw new HttpsError(
            'already-exists',
            'This phone number is already registered to an agency.'
        );
    }
    // Mark phone as used (write BEFORE batch to prevent quick double submissions)
    await phoneRef.set({ uid, email, usedAt: FieldValue.serverTimestamp() });

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
        createdAt: FieldValue.serverTimestamp(),
    });

    batch.set(userRef, {
        uid,
        email,
        name: userName.trim(),
        phone: phone.trim(),
        agencyId: agencyRef.id,
        role: 'admin',
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
    });

    if (trialEligible) {
        batch.set(trialRef, {
            agencyId: agencyRef.id,
            uid,
            trialEndsAt: trialEndsDate,
            hasUsedTrial: false,
            status: 'active',
            createdAt: FieldValue.serverTimestamp()
        });
    }

    await batch.commit();

    // Set custom claims mapping the user to this new agency as an admin.
    await getAuth().setCustomUserClaims(uid, { agencyId: agencyRef.id, role: 'admin' });

    return { success: true, agencyId: agencyRef.id };
});
