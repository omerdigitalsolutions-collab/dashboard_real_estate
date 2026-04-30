/**
 * ─── Calendar Module — Disconnect ───────────────────────────────────────────
 *
 * Cloud Function to revoke Google Calendar access and clear user tokens.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';
import { deleteUserTokens } from './tokenStore';

/**
 * Cloud Function: calendar-disconnect
 *
 * 1. Deletes the Google OAuth tokens stored for the user.
 * 2. Updates the user's profile to disable Google Calendar integration.
 */
export const disconnect = onCall({
    cors: [/^https?:\/\/localhost(:\d+)?$/, 'https://dashboard-6f9d1.web.app', 'https://dashboard-6f9d1.firebaseapp.com', 'https://homer.management'],
    invoker: 'public',
}, async (request) => {
    const authData = await validateUserAuth(request);

    try {
        console.log(`[calendar] Starting disconnect for user: ${authData.uid}`);

        await deleteUserTokens(authData.uid);

        const db = getFirestore();
        await db.collection('users').doc(authData.uid).set({
            googleCalendar: {
                enabled: false,
                lastDisconnected: new Date().toISOString(),
            },
        }, { merge: true });

        console.log(`[calendar] Successfully disconnected for user: ${authData.uid}`);
        return { success: true };
    } catch (error) {
        console.error(`[calendar] disconnect error for user ${authData.uid}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'נכשל ניתוק החיבור ליומן גוגל. אנא נסה שוב מאוחר יותר.');
    }
});
