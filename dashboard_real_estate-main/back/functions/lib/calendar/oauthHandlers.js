"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleOAuthCallback = exports.getAuthUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const googleapis_1 = require("googleapis");
const authGuard_1 = require("../config/authGuard");
const tokenStore_1 = require("./tokenStore");
/** Google Calendar scopes — full read/write across all of the user's calendars. */
const CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
];
// ── Internal: build a bare client from env vars only (no user tokens needed) ─
function buildBaseOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
        throw new https_1.HttpsError('internal', 'Google OAuth environment variables are not configured on the server.');
    }
    return new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
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
exports.getAuthUrl = (0, https_1.onCall)({
    cors: [/^https?:\/\/localhost(:\d+)?$/, 'https://dashboard-6f9d1.web.app', 'https://dashboard-6f9d1.firebaseapp.com', 'https://homer.management'],
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request) => {
    // Ensure the caller is an authenticated agent
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    try {
        const oauth2Client = buildBaseOAuth2Client();
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Required to receive a refresh_token
            prompt: 'consent', // Force consent screen to always get refresh_token
            scope: CALENDAR_SCOPES,
            state: authData.uid, // Track user across the browser redirect
        });
        return { url: authUrl, authUrl }; // Return both for compatibility
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        console.error('[calendar] getAuthUrl error:', error);
        throw new https_1.HttpsError('internal', 'Failed to generate Google authorization URL.');
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
/**
 * HTTPS Redirect Handler: calendar-handleOAuthCallback
 *
 * This is an 'onRequest' function because Google redirects the user's browser
 * here. It parses the 'code' and 'state' (userId) from the URL, exchanges
 * them for tokens, and redirects the user back to the app.
 *
 * URL: https://<region>-<project-id>.cloudfunctions.net/calendar-handleOAuthCallback
 */
exports.handleOAuthCallback = (0, https_1.onRequest)({
    cors: true,
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request, response) => {
    var _a, _b, _c;
    const { code, state: userId } = request.query;
    if (!(code === null || code === void 0 ? void 0 : code.trim()) || !(userId === null || userId === void 0 ? void 0 : userId.trim())) {
        console.error('[calendar] Missing code or state (userId) in callback');
        response.status(400).send('Missing authorization code or user identification.');
        return;
    }
    try {
        const oauth2Client = buildBaseOAuth2Client();
        // Exchange the code for tokens
        const { tokens } = await oauth2Client.getToken(code.trim());
        if (!tokens.access_token || !tokens.refresh_token) {
            console.error('[calendar] Google did not return required tokens');
            response.status(500).send('Google did not return required tokens.');
            return;
        }
        const storedTokens = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: (_a = tokens.expiry_date) !== null && _a !== void 0 ? _a : Date.now() + 3600 * 1000,
            token_type: (_b = tokens.token_type) !== null && _b !== void 0 ? _b : 'Bearer',
            scope: (_c = tokens.scope) !== null && _c !== void 0 ? _c : CALENDAR_SCOPES.join(' '),
        };
        // Persist tokens in Firestore under userTokens/{userId}
        await (0, tokenStore_1.saveUserTokens)(userId.trim(), storedTokens);
        // Update user profile to mark calendar as enabled
        const db = (0, firestore_1.getFirestore)();
        await db.collection('users').doc(userId.trim()).update({
            'googleCalendar.enabled': true,
            'googleCalendar.lastConnected': new Date().toISOString(),
        });
        // Success! Redirect user back to settings with a success flag
        const dashboardUrl = (process.env.DASHBOARD_FRONTEND_URL || 'https://dashboard-6f9d1.web.app').replace(/\/$/, '');
        response.redirect(`${dashboardUrl}/dashboard/settings?tab=integrations&connected=google_calendar`);
    }
    catch (error) {
        console.error('[calendar] handleOAuthCallback error:', error);
        response.status(500).send('Failed to connect Google Calendar. Please try again.');
    }
});
//# sourceMappingURL=oauthHandlers.js.map