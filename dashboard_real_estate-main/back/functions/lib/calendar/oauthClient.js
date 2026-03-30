"use strict";
/**
 * ─── Calendar Module — OAuth Client Factory ──────────────────────────────────
 *
 * Provides a ready-to-use, authorized OAuth2 client for a specific user.
 *
 * Usage:
 *   const authClient = await getOAuthClient(userId);
 *   // pass authClient directly to any google.calendar({ version, auth }) call
 *
 * The factory handles:
 *   1. Constructing the client from env vars
 *   2. Setting the user's stored credentials
 *   3. Registering a `tokens` listener that auto-saves refreshed tokens
 *      back to Firestore whenever Google renews the access token
 *
 * Required Environment Variables:
 *   GOOGLE_CLIENT_ID      — App's OAuth 2.0 Client ID
 *   GOOGLE_CLIENT_SECRET  — App's OAuth 2.0 Client Secret
 *   GOOGLE_REDIRECT_URI   — Authorized redirect URI (must match Google Console)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOAuthClient = getOAuthClient;
const googleapis_1 = require("googleapis");
const tokenStore_1 = require("./tokenStore");
// ── Internal Helper ───────────────────────────────────────────────────────────
/**
 * Reads required env vars and throws a descriptive error if any are missing.
 */
function getOAuthConfig() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Missing required Google OAuth environment variables. ' +
            'Ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are set.');
    }
    return { clientId, clientSecret, redirectUri };
}
// ── Public Factory ────────────────────────────────────────────────────────────
/**
 * Builds a fully-initialized, user-scoped OAuth2Client.
 *
 * The client is configured with the user's stored tokens and will
 * automatically refresh the access token when it expires, persisting
 * the new tokens back to Firestore transparently.
 *
 * @param userId - The Firebase Auth UID of the user whose calendar to access.
 * @throws If the user has not yet completed the OAuth flow (no tokens stored).
 * @returns An authorized `OAuth2Client` ready for use with `googleapis`.
 */
async function getOAuthClient(userId) {
    const { clientId, clientSecret, redirectUri } = getOAuthConfig();
    // 1. Build the client
    const oauth2Client = new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
    // 2. Retrieve stored tokens from Firestore
    const storedTokens = await (0, tokenStore_1.getUserTokens)(userId);
    if (!storedTokens) {
        throw new Error(`User ${userId} has not completed Google Calendar authorization. ` +
            'Please direct the user to the auth URL first.');
    }
    // 3. Apply stored credentials
    oauth2Client.setCredentials({
        access_token: storedTokens.access_token,
        refresh_token: storedTokens.refresh_token,
        expiry_date: storedTokens.expiry_date,
        token_type: storedTokens.token_type,
        scope: storedTokens.scope,
    });
    // 4. Auto-save any refreshed tokens (handles the full refresh lifecycle)
    oauth2Client.on('tokens', async (newTokens) => {
        var _a, _b, _c, _d, _e;
        try {
            const updatedTokens = {
                // Carry over the refresh_token if Google didn't return a new one
                // (Google only sends refresh_token on the very first authorization)
                access_token: (_a = newTokens.access_token) !== null && _a !== void 0 ? _a : storedTokens.access_token,
                refresh_token: (_b = newTokens.refresh_token) !== null && _b !== void 0 ? _b : storedTokens.refresh_token,
                expiry_date: (_c = newTokens.expiry_date) !== null && _c !== void 0 ? _c : storedTokens.expiry_date,
                token_type: (_d = newTokens.token_type) !== null && _d !== void 0 ? _d : storedTokens.token_type,
                scope: (_e = newTokens.scope) !== null && _e !== void 0 ? _e : storedTokens.scope,
            };
            await (0, tokenStore_1.saveUserTokens)(userId, updatedTokens);
        }
        catch (err) {
            // Non-fatal: log but do not crash the calling request
            console.error(`[calendar] Failed to persist refreshed tokens for user ${userId}:`, err);
        }
    });
    return oauth2Client;
}
//# sourceMappingURL=oauthClient.js.map