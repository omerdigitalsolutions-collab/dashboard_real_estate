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
export const listEvents = onCall({ cors: true }, async (request) => {
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
        
        console.error('[calendar] listEvents error:', error);
        
        // Handle the case where the user hasn't authorized yet
        if (error.message?.includes('authorization') || error.message?.includes('tokens')) {
            throw new HttpsError('unauthenticated', 'Google Calendar access not authorized.');
        }

        throw new HttpsError('internal', 'Failed to fetch Google Calendar events.');
    }
});
