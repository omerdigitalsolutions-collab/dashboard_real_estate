/**
 * ─── Calendar Module — Disconnect ───────────────────────────────────────────
 *
 * Cloud Function to revoke Google Calendar access and clear user tokens.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';
import { deleteUserTokens } from './tokenStore';

const db = getFirestore();

/**
 * Cloud Function: calendar-disconnect
 *
 * 1. Deletes the Google OAuth tokens stored for the user.
 * 2. Updates the user's profile to disable Google Calendar integration.
 */
export const disconnect = onCall({ 
    cors: true,
    invoker: 'public',
}, async (request) => {
    // 1. Authenticate user
    const authData = await validateUserAuth(request);

    try {
        console.log(`[calendar] Starting disconnect for user: ${authData.uid}`);

        // 2. Clear tokens from Firestore
        await deleteUserTokens(authData.uid);

        // 3. Update user profile to mark calendar as disabled
        const db = getFirestore();
        await db.collection('users').doc(authData.uid).update({
            'googleCalendar.enabled': false,
            'googleCalendar.lastDisconnected': new Date().toISOString(),
        });

        console.log(`[calendar] Successfully disconnected for user: ${authData.uid}`);
        return { success: true };
    } catch (error) {
        console.error(`[calendar] disconnect error for user ${authData.uid}:`, error);
        
        if (error instanceof HttpsError) throw error;
        
        throw new HttpsError('internal', 'נכשל ניתוק החיבור ליומן גוגל. אנא נסה שוב מאוחר יותר.');
    }
});
