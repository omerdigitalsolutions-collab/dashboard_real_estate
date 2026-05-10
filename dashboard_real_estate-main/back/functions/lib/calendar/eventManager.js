"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEvent = exports.createEvent = void 0;
exports.createCalendarEvent = createCalendarEvent;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const googleapis_1 = require("googleapis");
const params_1 = require("firebase-functions/params");
const authGuard_1 = require("../config/authGuard");
const oauthClient_1 = require("./oauthClient");
const notifications_1 = require("./notifications");
const masterKey = (0, params_1.defineSecret)('ENCRYPTION_MASTER_KEY');
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
async function createCalendarEvent(userId, payload) {
    var _a, _b, _c;
    // 1. Get an authorized, refresh-aware OAuth2 client
    const authClient = await (0, oauthClient_1.getOAuthClient)(userId);
    // 2. Build the Calendar API instance
    // google.options scopes the auth client to this request chain only,
    // avoiding TypeScript overload issues with the single-argument signature.
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: authClient }); // eslint-disable-line @typescript-eslint/no-explicit-any
    // 3. Map our typed payload to the Google Calendar Events resource shape
    const eventResource = {
        summary: payload.summary,
        description: (_a = payload.description) !== null && _a !== void 0 ? _a : undefined,
        location: (_b = payload.location) !== null && _b !== void 0 ? _b : undefined,
        start: {
            dateTime: payload.start.dateTime,
            timeZone: payload.start.timeZone,
        },
        end: {
            dateTime: payload.end.dateTime,
            timeZone: payload.end.timeZone,
        },
        attendees: (_c = payload.attendees) === null || _c === void 0 ? void 0 : _c.map((a) => {
            var _a;
            return ({
                email: a.email,
                displayName: (_a = a.displayName) !== null && _a !== void 0 ? _a : undefined,
            });
        }),
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
 *   summary:           string,
 *   description?:      string,
 *   location?:         string,
 *   start:             { dateTime: string, timeZone: string },
 *   end:               { dateTime: string, timeZone: string },
 *   attendees?:        Array<{ email: string, displayName?: string }>,
 *   assignedToAgentId?: string,
 *   relatedTo?:        { id: string, type: 'lead' | 'property', name: string }
 * }
 *
 * Output: { success: true, eventId: string, htmlLink: string, taskId: string }
 */
exports.createEvent = (0, https_1.onCall)({
    cors: [/^https?:\/\/localhost(:\d+)?$/, 'https://dashboard-6f9d1.web.app', 'https://dashboard-6f9d1.firebaseapp.com', 'https://homer.management'],
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', masterKey],
}, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const data = request.data;
    // ── Input validation ────────────────────────────────────────────────────
    if (!((_a = data.summary) === null || _a === void 0 ? void 0 : _a.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'Event summary is required.');
    }
    if (!((_b = data.start) === null || _b === void 0 ? void 0 : _b.dateTime) || !((_c = data.start) === null || _c === void 0 ? void 0 : _c.timeZone)) {
        throw new https_1.HttpsError('invalid-argument', 'Event start.dateTime and start.timeZone are required.');
    }
    if (!((_d = data.end) === null || _d === void 0 ? void 0 : _d.dateTime) || !((_e = data.end) === null || _e === void 0 ? void 0 : _e.timeZone)) {
        throw new https_1.HttpsError('invalid-argument', 'Event end.dateTime and end.timeZone are required.');
    }
    const payload = {
        summary: data.summary.trim(),
        description: (_f = data.description) === null || _f === void 0 ? void 0 : _f.trim(),
        location: (_g = data.location) === null || _g === void 0 ? void 0 : _g.trim(),
        start: data.start,
        end: data.end,
        attendees: data.attendees ? [...data.attendees] : [],
        assignedToAgentId: data.assignedToAgentId,
        relatedTo: data.relatedTo,
    };
    const db = (0, firestore_1.getFirestore)();
    // ── Agent attendee injection ────────────────────────────────────────────
    // Look up the assigned agent's email and add them as a Google Calendar
    // attendee so they receive the invite email (sendUpdates:'all' is set).
    if (data.assignedToAgentId) {
        try {
            const agentDoc = await db.collection('users').doc(data.assignedToAgentId).get();
            if (agentDoc.exists) {
                const agentData = agentDoc.data();
                const agentEmail = agentData.email;
                if (agentEmail) {
                    const alreadyIncluded = payload.attendees.some(a => a.email === agentEmail);
                    if (!alreadyIncluded) {
                        payload.attendees.push({ email: agentEmail, displayName: (_h = agentData.name) !== null && _h !== void 0 ? _h : undefined });
                    }
                }
            }
        }
        catch (agentErr) {
            console.warn('[calendar] Agent lookup for attendees failed (non-fatal):', agentErr);
        }
    }
    try {
        // 1. Create the event in Google Calendar
        const result = await createCalendarEvent(authData.uid, payload);
        // 2. Synchronize with CRM by creating a Task
        const taskRef = db.collection('tasks').doc();
        const taskData = {
            id: taskRef.id,
            agencyId: authData.agencyId,
            createdBy: authData.uid,
            assignedToAgentIds: [payload.assignedToAgentId || authData.uid],
            title: `פגישה: ${payload.summary}`,
            description: `${payload.description || ''}\n\nקישור ליומן: ${result.htmlLink}`.trim(),
            status: 'pending',
            dueDate: firestore_1.Timestamp.fromDate(new Date(payload.start.dateTime)),
            priority: 'Medium',
            isCompleted: false,
            type: 'meeting',
            googleEventId: result.eventId,
            createdAt: firestore_1.Timestamp.now(),
            updatedAt: firestore_1.Timestamp.now(),
        };
        if (payload.relatedTo) {
            taskData.relatedTo = payload.relatedTo;
        }
        if (data.buyerId)
            taskData.buyerId = data.buyerId;
        if (data.sellerId)
            taskData.sellerId = data.sellerId;
        if (data.propertyId)
            taskData.propertyId = data.propertyId;
        await taskRef.set(taskData);
        // 3. WhatsApp notifications (fire-and-forget — never blocks the response)
        (0, notifications_1.sendCalendarNotifications)({
            agencyId: authData.agencyId,
            htmlLink: result.htmlLink,
            eventSummary: payload.summary,
            assignedAgentId: data.assignedToAgentId,
            relatedTo: payload.relatedTo,
            encryptionMasterKey: masterKey.value(),
        }).catch(err => console.warn('[calendar] Notification error (non-fatal):', err));
        return Object.assign(Object.assign({ success: true }, result), { taskId: taskRef.id });
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        console.error('[calendar] createEvent error:', error);
        // Status 401 or specific OAuth 'invalid_grant' suggests a broken connection
        if (error.code === 401 || ((_j = error.message) === null || _j === void 0 ? void 0 : _j.includes('invalid_grant'))) {
            await db.collection('users').doc(authData.uid).update({
                'googleCalendar.enabled': false,
            });
            throw new https_1.HttpsError('unauthenticated', 'Google Calendar authorization expired. Please reconnect.');
        }
        throw new https_1.HttpsError('internal', 'Failed to create event and sync with CRM.');
    }
});
// ── deleteEvent ───────────────────────────────────────────────────────────────
/**
 * Cloud Function: calendar-deleteEvent
 *
 * Securely deletes a Google Calendar event and its associated CRM Task.
 * Standardizes deletion flow to ensure no orphaned events remain in the calendar.
 */
exports.deleteEvent = (0, https_1.onCall)({
    cors: [/^https?:\/\/localhost(:\d+)?$/, 'https://dashboard-6f9d1.web.app', 'https://dashboard-6f9d1.firebaseapp.com', 'https://homer.management'],
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request) => {
    var _a, _b;
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { taskId } = request.data;
    if (!taskId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing taskId.');
    }
    const db = (0, firestore_1.getFirestore)();
    try {
        // 1. Fetch task and verify ownership (Tenant Isolation)
        const taskRef = db.collection('tasks').doc(taskId);
        const taskDoc = await taskRef.get();
        if (!taskDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Task not found in CRM.');
        }
        const taskData = taskDoc.data();
        if ((taskData === null || taskData === void 0 ? void 0 : taskData.agencyId) !== authData.agencyId) {
            throw new https_1.HttpsError('permission-denied', 'You do not have permission to delete this task.');
        }
        const googleEventId = taskData === null || taskData === void 0 ? void 0 : taskData.googleEventId;
        // 2. Delete from Google Calendar (if linked)
        if (googleEventId) {
            try {
                // getOAuthClient handles token retrieval and refresh listeners
                const authClient = await (0, oauthClient_1.getOAuthClient)(authData.uid);
                const calendar = googleapis_1.google.calendar({ version: 'v3', auth: authClient });
                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: googleEventId
                });
            }
            catch (gcalError) {
                // If event is already gone (404/410), we ignore and proceed to CRM cleanup
                const code = gcalError.code || ((_a = gcalError.response) === null || _a === void 0 ? void 0 : _a.status);
                if (code !== 404 && code !== 410) {
                    console.error('[calendar] GCal delete error:', gcalError);
                    // Specific OAuth failure (token revoked/expired)
                    if (code === 401 || ((_b = gcalError.message) === null || _b === void 0 ? void 0 : _b.includes('invalid_grant'))) {
                        await db.collection('users').doc(authData.uid).update({
                            'googleCalendar.enabled': false
                        });
                    }
                    else {
                        // For other critical failures, we stop to avoid inconsistent state
                        throw new https_1.HttpsError('internal', 'Failed to delete event from Google Calendar.');
                    }
                }
            }
        }
        // 3. Finalize: Delete Task from Firestore
        await taskRef.delete();
        return { success: true };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        console.error('[calendar] deleteEvent error:', error);
        throw new https_1.HttpsError('internal', 'An unexpected error occurred during event deletion.');
    }
});
//# sourceMappingURL=eventManager.js.map