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
exports.createEvent = void 0;
exports.createCalendarEvent = createCalendarEvent;
const https_1 = require("firebase-functions/v2/https");
const googleapis_1 = require("googleapis");
const authGuard_1 = require("../config/authGuard");
const oauthClient_1 = require("./oauthClient");
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
exports.createEvent = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
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
        attendees: data.attendees,
    };
    try {
        const result = await createCalendarEvent(authData.uid, payload);
        return Object.assign({ success: true }, result);
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        console.error('[calendar] createEvent error:', error);
        throw new https_1.HttpsError('internal', 'Failed to create Google Calendar event.');
    }
});
//# sourceMappingURL=eventManager.js.map