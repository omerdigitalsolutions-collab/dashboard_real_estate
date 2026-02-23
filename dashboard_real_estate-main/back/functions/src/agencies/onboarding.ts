import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const db = getFirestore();

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
export const createAgencyAccount = onCall(async (request) => {
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

    await batch.commit();

    // Set custom claims mapping the user to this new agency as an admin.
    await getAuth().setCustomUserClaims(uid, { agencyId: agencyRef.id, role: 'admin' });

    return { success: true, agencyId: agencyRef.id };
});
