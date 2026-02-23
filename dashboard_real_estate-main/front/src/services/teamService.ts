import {
    collection,
    query,
    where,
    onSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { AppUser, UserRole } from '../types';

/**
 * Real-time listener for all users in an agency.
 * Returns the unsubscribe function to be called on cleanup.
 */
export function getAgencyTeam(
    agencyId: string,
    callback: (members: AppUser[]) => void
): () => void {
    const q = query(collection(db, 'users'), where('agencyId', '==', agencyId));
    return onSnapshot(q, (snap) => {
        const members = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser));
        callback(members);
    });
}

/**
 * Invites a new agent via the secure Cloud Function.
 * The function validates the caller is an admin, prevents duplicate emails,
 * and creates the stub document server-side.
 *
 * Note: `agencyId` is no longer passed — the server reads it from the
 * caller's own Firestore document, preventing any spoofing.
 */
export async function inviteAgent(
    _agencyId: string, // kept for call-site compatibility
    name: string,
    email: string,
    role: UserRole
): Promise<void> {
    const callInviteAgent = httpsCallable<
        { email: string; name: string; role: string },
        { success: boolean; stubId: string }
    >(functions, 'users-inviteAgent');

    // Let any HttpsError propagate — the UI catches and surfaces it via toast
    await callInviteAgent({ email, name, role });
}

/**
 * [Cloud Function] Updates the role of a team member.
 * RBAC enforcement and same-agency verification are done server-side.
 */
export async function updateAgentRole(userId: string, newRole: UserRole): Promise<void> {
    const fn = httpsCallable<{ userId: string; newRole: string }, { success: boolean }>(
        functions, 'users-updateAgentRole'
    );
    await fn({ userId, newRole });
}

/**
 * [Cloud Function] Toggles the active/suspended status of a team member.
 * Self-suspension prevention and same-agency verification are done server-side.
 */
export async function toggleAgentStatus(userId: string, isActive: boolean): Promise<void> {
    const fn = httpsCallable<{ userId: string; isActive: boolean }, { success: boolean }>(
        functions, 'users-toggleAgentStatus'
    );
    await fn({ userId, isActive });
}
