"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveUserTokens = saveUserTokens;
exports.getUserTokens = getUserTokens;
exports.deleteUserTokens = deleteUserTokens;
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
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
async function saveUserTokens(userId, tokens) {
    await db.collection(TOKENS_COLLECTION).doc(userId).set(tokens, { merge: true });
}
// ── Retrieve ──────────────────────────────────────────────────────────────────
/**
 * Retrieves the stored OAuth tokens for a given user.
 *
 * @param userId - The Firebase Auth UID of the user.
 * @returns The stored token object, or null if the user has not yet authorized.
 */
async function getUserTokens(userId) {
    const snapshot = await db.collection(TOKENS_COLLECTION).doc(userId).get();
    if (!snapshot.exists) {
        return null;
    }
    return snapshot.data();
}
// ── Delete ────────────────────────────────────────────────────────────────────
/**
 * Revokes / clears the stored tokens for a user (e.g. on disconnect / logout).
 *
 * @param userId - The Firebase Auth UID of the user.
 */
async function deleteUserTokens(userId) {
    await db.collection(TOKENS_COLLECTION).doc(userId).delete();
}
//# sourceMappingURL=tokenStore.js.map