/**
 * ─── Calendar Module — Token Store ────────────────────────────────────────────
 *
 * Abstract Firestore-backed helpers for persisting and retrieving Google
 * OAuth tokens on a per-user basis. Tokens are stored under:
 *
 *   userTokens/{userId}
 *
 * NOTE: In a production environment with higher security requirements,
 * consider encrypting token values at rest using Cloud KMS or Secret Manager
 * before writing them to Firestore.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { StoredTokens } from './types';

const db = getFirestore();

/**
 * The Firestore collection that holds one document per user's OAuth tokens.
 * Each document ID is the user's Firebase Auth UID.
 */
const TOKENS_COLLECTION = 'userTokens';

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Persists (or overwrites) the Google OAuth tokens for a given user.
 *
 * @param userId - The Firebase Auth UID of the user.
 * @param tokens - The full token object returned by the OAuth2 client.
 */
export async function saveUserTokens(
    userId: string,
    tokens: StoredTokens
): Promise<void> {
    await db.collection(TOKENS_COLLECTION).doc(userId).set(tokens, { merge: true });
}

// ── Retrieve ──────────────────────────────────────────────────────────────────

/**
 * Retrieves the stored OAuth tokens for a given user.
 *
 * @param userId - The Firebase Auth UID of the user.
 * @returns The stored token object, or null if the user has not yet authorized.
 */
export async function getUserTokens(
    userId: string
): Promise<StoredTokens | null> {
    const snapshot = await db.collection(TOKENS_COLLECTION).doc(userId).get();

    if (!snapshot.exists) {
        return null;
    }

    return snapshot.data() as StoredTokens;
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Revokes / clears the stored tokens for a user (e.g. on disconnect / logout).
 *
 * @param userId - The Firebase Auth UID of the user.
 */
export async function deleteUserTokens(userId: string): Promise<void> {
    await db.collection(TOKENS_COLLECTION).doc(userId).delete();
}
