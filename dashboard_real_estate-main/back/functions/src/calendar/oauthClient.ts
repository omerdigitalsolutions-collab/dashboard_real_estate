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

import { google } from 'googleapis';
import { getUserTokens, saveUserTokens } from './tokenStore';
import { StoredTokens } from './types';

// Derive the OAuth2Client type from googleapis to avoid dual-package type conflicts
// between the top-level google-auth-library and the version bundled inside googleapis-common.
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

// ── Internal Helper ───────────────────────────────────────────────────────────

/**
 * Reads required env vars and throws a descriptive error if any are missing.
 */
function getOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error(
            'Missing required Google OAuth environment variables. ' +
            'Ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are set.'
        );
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
export async function getOAuthClient(userId: string): Promise<OAuth2Client> {
    const { clientId, clientSecret, redirectUri } = getOAuthConfig();

    // 1. Build the client
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // 2. Retrieve stored tokens from Firestore
    const storedTokens = await getUserTokens(userId);

    if (!storedTokens) {
        throw new Error(
            `User ${userId} has not completed Google Calendar authorization. ` +
            'Please direct the user to the auth URL first.'
        );
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
        try {
            const updatedTokens: StoredTokens = {
                // Carry over the refresh_token if Google didn't return a new one
                // (Google only sends refresh_token on the very first authorization)
                access_token: newTokens.access_token ?? storedTokens.access_token,
                refresh_token: newTokens.refresh_token ?? storedTokens.refresh_token,
                expiry_date: newTokens.expiry_date ?? storedTokens.expiry_date,
                token_type: newTokens.token_type ?? storedTokens.token_type,
                scope: newTokens.scope ?? storedTokens.scope,
            };
            await saveUserTokens(userId, updatedTokens);
        } catch (err) {
            // Non-fatal: log but do not crash the calling request
            console.error(`[calendar] Failed to persist refreshed tokens for user ${userId}:`, err);
        }
    });

    return oauth2Client;
}
