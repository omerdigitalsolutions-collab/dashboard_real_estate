import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

/**
 * updateAgentAvailability — Toggles whether an agent receives automatically
 * distributed leads and properties.
 *
 * Security:
 *   - An agent can toggle their own availability.
 *   - An admin can toggle any agent in the same agency.
 *   - Cannot set isAvailable=true if the target agent is inactive (isActive=false).
 *
 * Input:  { targetUserId?: string, isAvailable: boolean }
 *         targetUserId defaults to the caller's own UID when omitted.
 * Output: { success: true }
 */
export const updateAgentAvailability = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);

    const { targetUserId, isAvailable } = request.data as {
        targetUserId?: string;
        isAvailable?: boolean;
    };

    if (typeof isAvailable !== 'boolean') {
        throw new HttpsError('invalid-argument', 'isAvailable must be a boolean.');
    }

    const resolvedId = targetUserId?.trim() || authData.uid;

    // Non-admins can only update themselves
    if (resolvedId !== authData.uid && authData.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only admins can change another agent\'s availability.');
    }

    // Fetch target user doc
    const targetDoc = await db.doc(`users/${resolvedId}`).get();
    if (!targetDoc.exists) {
        throw new HttpsError('not-found', 'User not found.');
    }

    const target = targetDoc.data() as { agencyId: string; isActive?: boolean };

    // Agency check for admin targeting another user
    if (resolvedId !== authData.uid && target.agencyId !== authData.agencyId) {
        throw new HttpsError('permission-denied', 'Cannot modify users in a different agency.');
    }

    // Cannot mark an inactive user as available
    if (isAvailable && target.isActive === false) {
        throw new HttpsError(
            'failed-precondition',
            'Cannot set availability for a suspended agent.',
        );
    }

    await db.doc(`users/${resolvedId}`).update({ isAvailableForLeads: isAvailable });

    return { success: true };
});
