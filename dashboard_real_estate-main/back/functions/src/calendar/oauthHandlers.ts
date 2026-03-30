/**
 * ─── Calendar Module — OAuth 2.0 Handlers ────────────────────────────────────
 *
 * Cloud Functions that implement the server-side OAuth 2.0 flow.
 *
 * Exported Cloud Functions:
 *   calendar-getAuthUrl          → Generates and returns the Google consent URL
 *   calendar-handleOAuthCallback → Exchanges an auth code for tokens & stores them
 *
 * Required Environment Variables (see oauthClient.ts):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import { validateUserAuth } from '../config/authGuard';
import { saveUserTokens } from './tokenStore';
import { StoredTokens } from './types';

/** Google Calendar scope required to create / read events. */
const CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
];

// ── Internal: build a bare client from env vars only (no user tokens needed) ─

function buildBaseOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new HttpsError(
            'internal',
            'Google OAuth environment variables are not configured on the server.'
        );
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ── getAuthUrl ────────────────────────────────────────────────────────────────

/**
 * Generates the Google OAuth consent URL for the authenticated user.
 *
 * Call:   calendar-getAuthUrl  (no input payload required)
 * Returns: { authUrl: string }
 *
 * The frontend should redirect the user (or open a popup) to `authUrl`.
 * After the user consents, Google will redirect to GOOGLE_REDIRECT_URI
 * with a `code` query parameter, which is then passed to handleOAuthCallback.
 */
export const getAuthUrl = onCall({ cors: true }, async (request) => {
    // Ensure the caller is an authenticated agent
    await validateUserAuth(request);

    try {
        const oauth2Client = buildBaseOAuth2Client();

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',   // Required to receive a refresh_token
            prompt: 'consent',        // Force consent screen to always get refresh_token
            scope: CALENDAR_SCOPES,
        });

        return { authUrl };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[calendar] getAuthUrl error:', error);
        throw new HttpsError('internal', 'Failed to generate Google authorization URL.');
    }
});

// ── handleOAuthCallback ───────────────────────────────────────────────────────

/**
 * Exchanges the Google authorization code for access + refresh tokens,
 * then persists them in Firestore tied to the authenticated user.
 *
 * Call:   calendar-handleOAuthCallback  ({ code: string })
 * Returns: { success: true }
 *
 * Input:
 *   code — The authorization code returned by Google in the redirect URI
 *          query string after the user has consented.
 */
export const handleOAuthCallback = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);

    const { code } = request.data as { code?: string };

    if (!code?.trim()) {
        throw new HttpsError('invalid-argument', 'Authorization code is required.');
    }

    try {
        const oauth2Client = buildBaseOAuth2Client();

        // Exchange the code for tokens
        const { tokens } = await oauth2Client.getToken(code.trim());

        if (!tokens.access_token || !tokens.refresh_token) {
            throw new HttpsError(
                'internal',
                'Google did not return the expected tokens. ' +
                'Ensure prompt=consent is used in the auth URL to always receive a refresh_token.'
            );
        }

        const storedTokens: StoredTokens = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000,
            token_type: tokens.token_type ?? 'Bearer',
            scope: tokens.scope ?? CALENDAR_SCOPES.join(' '),
        };

        // Persist tokens in Firestore under userTokens/{uid}
        await saveUserTokens(authData.uid, storedTokens);

        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[calendar] handleOAuthCallback error:', error);
        throw new HttpsError('internal', 'Failed to exchange authorization code for tokens.');
    }
});
