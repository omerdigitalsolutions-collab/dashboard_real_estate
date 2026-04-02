/**
 * ─── Calendar Module — List Events ───────────────────────────────────────────
 *
 * Cloud Function to retrieve upcoming events from the user's primary calendar.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import { validateUserAuth } from '../config/authGuard';
import { getOAuthClient } from './oauthClient';

/**
 * Cloud Function: calendar-listEvents
 *
 * Returns a list of upcoming events from the user's primary Google Calendar.
 */
export const listEvents = onCall({ 
    cors: ['https://homer.management', 'http://localhost:5173'],
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request) => {
    const authData = await validateUserAuth(request);

    try {
        const authClient = await getOAuthClient(authData.uid);
        const calendar = google.calendar({ version: 'v3', auth: authClient as any });

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            maxResults: 50,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];

        return {
            success: true,
            events: events.map(event => ({
                id: event.id,
                summary: event.summary,
                description: event.description,
                location: event.location,
                start: event.start,
                end: event.end,
                htmlLink: event.htmlLink,
            })),
        };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        
        console.error(`[calendar] listEvents error for user ${authData.uid}:`, error);
        
        // Handle the case where the user hasn't authorized yet or tokens are invalid
        const errorMessage = error.message || '';
        if (errorMessage.includes('authorization') || errorMessage.includes('tokens') || errorMessage.includes('No tokens')) {
            throw new HttpsError('unauthenticated', 'חיבור ליומן גוגל פג או לא קיים. אנא התחבר מחדש.');
        }

        throw new HttpsError('internal', 'נכשל פיענוח אירועים מיומן גוגל. בדוק את החיבור.');
    }
});
