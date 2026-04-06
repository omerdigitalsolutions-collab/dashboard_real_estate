"use strict";
/**
 * ─── Calendar Module — Disconnect ───────────────────────────────────────────
 *
 * Cloud Function to revoke Google Calendar access and clear user tokens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnect = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const tokenStore_1 = require("./tokenStore");
const db = (0, firestore_1.getFirestore)();
/**
 * Cloud Function: calendar-disconnect
 *
 * 1. Deletes the Google OAuth tokens stored for the user.
 * 2. Updates the user's profile to disable Google Calendar integration.
 */
exports.disconnect = (0, https_1.onCall)({
    cors: true,
    invoker: 'public',
}, async (request) => {
    // 1. Authenticate user
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    try {
        console.log(`[calendar] Starting disconnect for user: ${authData.uid}`);
        // 2. Clear tokens from Firestore
        await (0, tokenStore_1.deleteUserTokens)(authData.uid);
        // 3. Update user profile to mark calendar as disabled
        const db = (0, firestore_1.getFirestore)();
        await db.collection('users').doc(authData.uid).update({
            'googleCalendar.enabled': false,
            'googleCalendar.lastDisconnected': new Date().toISOString(),
        });
        console.log(`[calendar] Successfully disconnected for user: ${authData.uid}`);
        return { success: true };
    }
    catch (error) {
        console.error(`[calendar] disconnect error for user ${authData.uid}:`, error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('internal', 'נכשל ניתוק החיבור ליומן גוגל. אנא נסה שוב מאוחר יותר.');
    }
});
//# sourceMappingURL=disconnect.js.map