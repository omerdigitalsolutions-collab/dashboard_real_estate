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
    cors: [/^https?:\/\/localhost(:\d+)?$/, 'https://dashboard-6f9d1.web.app', 'https://dashboard-6f9d1.firebaseapp.com', 'https://homer.management'],
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request) => {
    const authData = await validateUserAuth(request);

    const { timeMin, timeMax } = (request.data as { timeMin?: string; timeMax?: string }) || {};

    // Default range: 1 month back → 1 year forward
    const defaultMin = new Date();
    defaultMin.setMonth(defaultMin.getMonth() - 1);
    defaultMin.setDate(1);
    defaultMin.setHours(0, 0, 0, 0);

    const defaultMax = new Date();
    defaultMax.setFullYear(defaultMax.getFullYear() + 1);
    defaultMax.setMonth(11, 31);
    defaultMax.setHours(23, 59, 59, 999);

    try {
        const authClient = await getOAuthClient(authData.uid);
        const calendar = google.calendar({ version: 'v3', auth: authClient as any });

        // 1. Get all calendars the user has access to
        let calendarIds: string[] = ['primary'];
        try {
            const listResp = await calendar.calendarList.list({ maxResults: 100 });
            const items = listResp.data.items || [];
            const ids = items
                .filter(c => c.id && c.selected !== false)
                .map(c => c.id as string);
            if (ids.length > 0) calendarIds = ids;
        } catch (err) {
            console.warn('[calendar] calendarList.list failed, falling back to primary only:', err);
        }

        const minIso = timeMin ?? defaultMin.toISOString();
        const maxIso = timeMax ?? defaultMax.toISOString();

        // 2. Fetch events from all calendars in parallel
        const results = await Promise.all(
            calendarIds.map(async (cid) => {
                try {
                    const resp = await calendar.events.list({
                        calendarId: cid,
                        timeMin: minIso,
                        timeMax: maxIso,
                        maxResults: 500,
                        singleEvents: true,
                        orderBy: 'startTime',
                    });
                    return resp.data.items || [];
                } catch (err) {
                    console.warn(`[calendar] events.list failed for calendar ${cid}:`, err);
                    return [];
                }
            })
        );

        const events = results.flat();

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
                colorId: event.colorId,
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
