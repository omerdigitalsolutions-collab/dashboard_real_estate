/**
 * ─── Calendar Module — Event Manager ─────────────────────────────────────────
 *
 * Core logic for interacting with the Google Calendar Events API.
 *
 * Exports:
 *   createCalendarEvent(userId, payload)  — utility function (internal use)
 *   createEvent                           — Cloud Function wrapper (external API)
 *
 * The function obtains an authorized OAuth2 client via `getOAuthClient`,
 * inserts the event, and returns the new event's ID and public HTML link.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import { validateUserAuth } from '../config/authGuard';
import { getOAuthClient } from './oauthClient';
import { CalendarEventPayload, CreateEventResult } from './types';

// ── Core Utility ──────────────────────────────────────────────────────────────

/**
 * Creates a Google Calendar event on behalf of the authenticated user.
 *
 * Can be called directly from other server-side modules (e.g., from the
 * leads module to auto-schedule a follow-up on lead creation).
 *
 * @param userId  - Firebase Auth UID of the calendar owner.
 * @param payload - Strongly-typed event payload (summary, start, end, etc.)
 * @returns       { eventId, htmlLink } of the newly created event.
 * @throws        If the user has not authorized Calendar access, or the API call fails.
 */
export async function createCalendarEvent(
    userId: string,
    payload: CalendarEventPayload
): Promise<CreateEventResult> {
    // 1. Get an authorized, refresh-aware OAuth2 client
    const authClient = await getOAuthClient(userId);

    // 2. Build the Calendar API instance
    // google.options scopes the auth client to this request chain only,
    // avoiding TypeScript overload issues with the single-argument signature.
    const calendar = google.calendar({ version: 'v3', auth: authClient as any }); // eslint-disable-line @typescript-eslint/no-explicit-any

    // 3. Map our typed payload to the Google Calendar Events resource shape
    const eventResource = {
        summary: payload.summary,
        description: payload.description ?? undefined,
        location: payload.location ?? undefined,
        start: {
            dateTime: payload.start.dateTime,
            timeZone: payload.start.timeZone,
        },
        end: {
            dateTime: payload.end.dateTime,
            timeZone: payload.end.timeZone,
        },
        attendees: payload.attendees?.map((a) => ({
            email: a.email,
            displayName: a.displayName ?? undefined,
        })),
        // Notify attendees via email automatically
        sendUpdates: 'all',
    };

    // 4. Insert the event into the user's primary calendar
    const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventResource,
    });

    const eventId = response.data.id;
    const htmlLink = response.data.htmlLink;

    if (!eventId || !htmlLink) {
        throw new Error('Google Calendar API returned an event with missing id or htmlLink.');
    }

    return { eventId, htmlLink };
}

// ── Cloud Function Wrapper ────────────────────────────────────────────────────

/**
 * Cloud Function: calendar-createEvent
 *
 * Allows the frontend (or other clients) to create a Calendar event on behalf
 * of the currently authenticated user.
 *
 * Input:
 * {
 *   summary:     string,
 *   description?: string,
 *   location?:   string,
 *   start:       { dateTime: string, timeZone: string },
 *   end:         { dateTime: string, timeZone: string },
 *   attendees?:  Array<{ email: string, displayName?: string }>
 * }
 *
 * Output: { success: true, eventId: string, htmlLink: string }
 */
export const createEvent = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);

    const data = request.data as Partial<CalendarEventPayload>;

    // ── Input validation ────────────────────────────────────────────────────
    if (!data.summary?.trim()) {
        throw new HttpsError('invalid-argument', 'Event summary is required.');
    }
    if (!data.start?.dateTime || !data.start?.timeZone) {
        throw new HttpsError('invalid-argument', 'Event start.dateTime and start.timeZone are required.');
    }
    if (!data.end?.dateTime || !data.end?.timeZone) {
        throw new HttpsError('invalid-argument', 'Event end.dateTime and end.timeZone are required.');
    }

    const payload: CalendarEventPayload = {
        summary: data.summary.trim(),
        description: data.description?.trim(),
        location: data.location?.trim(),
        start: data.start,
        end: data.end,
        attendees: data.attendees,
    };

    try {
        const result = await createCalendarEvent(authData.uid, payload);
        return { success: true, ...result };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('[calendar] createEvent error:', error);
        throw new HttpsError('internal', 'Failed to create Google Calendar event.');
    }
});
