import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { CallableRequest } from 'firebase-functions/v2/https';

const db = getFirestore();

export interface AuthGuardResult {
    uid: string;
    agencyId: string;
    role: 'admin' | 'agent';
    isActive: boolean;
    email: string;
}

/**
 * Validates a CallableRequest to ensure the user is authenticated, exists in Firestore,
 * and is actively assigned to an agency.
 *
 * @param request The incoming CallableRequest from Firebase Functions v2
 * @returns AuthGuardResult containing the user's verified uid, agencyId, role, and active status.
 * @throws HttpsError ('unauthenticated', 'permission-denied', or 'not-found')
 */
export async function validateUserAuth(request: CallableRequest<any>): Promise<AuthGuardResult> {
    // 1. Enforce Firebase Auth
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { uid, token } = request.auth;
    const email = token?.email || '';

    // 2. Fetch User Record from Firestore
    const userSnap = await db.doc(`users/${uid}`).get();

    if (!userSnap.exists) {
        throw new HttpsError('not-found', 'User record not found in the database.');
    }

    const userData = userSnap.data() as {
        agencyId?: string;
        role?: 'admin' | 'agent';
        isActive?: boolean;
    };

    // 3. Verify Agency Membership
    if (!userData.agencyId) {
        throw new HttpsError('permission-denied', 'User is not associated with any agency.');
    }

    // 4. Verify Active Status
    if (typeof userData.isActive === 'boolean' && !userData.isActive) {
        throw new HttpsError('permission-denied', 'Your account has been suspended.');
    }

    const result = {
        uid,
        agencyId: userData.agencyId,
        role: userData.role || 'agent',
        isActive: true, // We already threw an error if it was false on line 51
        email
    };

    // Non-blocking activity ping — drives dailyCityPropertiesSync city filtering
    db.collection('agencies').doc(userData.agencyId).update({
        lastActiveAt: FieldValue.serverTimestamp(),
    }).catch(() => {});

    return result;
}
