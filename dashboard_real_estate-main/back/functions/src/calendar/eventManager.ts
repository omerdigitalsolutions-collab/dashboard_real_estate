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
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
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
export const createEvent = onCall({
    cors: [/^https?:\/\/localhost(:\d+)?$/, 'https://dashboard-6f9d1.web.app', 'https://dashboard-6f9d1.firebaseapp.com', 'https://homer.management'],
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request) => {
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
        // 1. Create the event in Google Calendar
        const result = await createCalendarEvent(authData.uid, payload);

        // 2. Synchronize with CRM by creating a Task
        const db = getFirestore();
        const taskRef = db.collection('tasks').doc();

        const taskData: Record<string, any> = {
            id: taskRef.id,
            agencyId: authData.agencyId,
            createdBy: authData.uid,
            assignedToAgentId: payload.assignedToAgentId || authData.uid,
            title: `פגישה: ${payload.summary}`,
            description: `${payload.description || ''}\n\nקישור ליומן: ${result.htmlLink}`.trim(),
            status: 'pending',
            dueDate: Timestamp.fromDate(new Date(payload.start.dateTime)),
            priority: 'Medium',
            isCompleted: false,
            type: 'meeting',
            googleEventId: result.eventId,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };
        if (payload.relatedTo) {
            taskData.relatedTo = payload.relatedTo;
        }

        await taskRef.set(taskData);

        return { 
            success: true, 
            ...result,
            taskId: taskRef.id 
        };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        
        console.error('[calendar] createEvent error:', error);

        // Status 401 or specific OAuth 'invalid_grant' suggests a broken connection
        if (error.code === 401 || error.message?.includes('invalid_grant')) {
            const db = getFirestore();
            await db.collection('users').doc(authData.uid).update({
                'googleCalendar.enabled': false,
            });
            throw new HttpsError('unauthenticated', 'Google Calendar authorization expired. Please reconnect.');
        }

        throw new HttpsError('internal', 'Failed to create event and sync with CRM.');
    }
});

// ── deleteEvent ───────────────────────────────────────────────────────────────

/**
 * Cloud Function: calendar-deleteEvent
 *
 * Securely deletes a Google Calendar event and its associated CRM Task.
 * Standardizes deletion flow to ensure no orphaned events remain in the calendar.
 */
export const deleteEvent = onCall({
    cors: [/^https?:\/\/localhost(:\d+)?$/, 'https://dashboard-6f9d1.web.app', 'https://dashboard-6f9d1.firebaseapp.com', 'https://homer.management'],
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request) => {
    const authData = await validateUserAuth(request);
    const { taskId } = request.data;

    if (!taskId) {
        throw new HttpsError('invalid-argument', 'Missing taskId.');
    }

    const db = getFirestore();

    try {
        // 1. Fetch task and verify ownership (Tenant Isolation)
        const taskRef = db.collection('tasks').doc(taskId);
        const taskDoc = await taskRef.get();

        if (!taskDoc.exists) {
            throw new HttpsError('not-found', 'Task not found in CRM.');
        }

        const taskData = taskDoc.data();

        if (taskData?.agencyId !== authData.agencyId) {
            throw new HttpsError('permission-denied', 'You do not have permission to delete this task.');
        }

        const googleEventId = taskData?.googleEventId;

        // 2. Delete from Google Calendar (if linked)
        if (googleEventId) {
            try {
                // getOAuthClient handles token retrieval and refresh listeners
                const authClient = await getOAuthClient(authData.uid);
                const calendar = google.calendar({ version: 'v3', auth: authClient as any });

                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: googleEventId
                });
            } catch (gcalError: any) {
                // If event is already gone (404/410), we ignore and proceed to CRM cleanup
                const code = gcalError.code || gcalError.response?.status;
                if (code !== 404 && code !== 410) {
                    console.error('[calendar] GCal delete error:', gcalError);
                    
                    // Specific OAuth failure (token revoked/expired)
                    if (code === 401 || gcalError.message?.includes('invalid_grant')) {
                        await db.collection('users').doc(authData.uid).update({
                            'googleCalendar.enabled': false
                        });
                    } else {
                        // For other critical failures, we stop to avoid inconsistent state
                        throw new HttpsError('internal', 'Failed to delete event from Google Calendar.');
                    }
                }
            }
        }

        // 3. Finalize: Delete Task from Firestore
        await taskRef.delete();

        return { success: true };

    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        console.error('[calendar] deleteEvent error:', error);
        throw new HttpsError('internal', 'An unexpected error occurred during event deletion.');
    }
});
