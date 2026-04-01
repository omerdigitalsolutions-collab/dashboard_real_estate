"use strict";
/**
 * ─── Calendar Module — List Events ───────────────────────────────────────────
 *
 * Cloud Function to retrieve upcoming events from the user's primary calendar.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEvents = void 0;
const https_1 = require("firebase-functions/v2/https");
const googleapis_1 = require("googleapis");
const authGuard_1 = require("../config/authGuard");
const oauthClient_1 = require("./oauthClient");
/**
 * Cloud Function: calendar-listEvents
 *
 * Returns a list of upcoming events from the user's primary Google Calendar.
 */
exports.listEvents = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b;
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    try {
        const authClient = await (0, oauthClient_1.getOAuthClient)(authData.uid);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: authClient });
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
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        console.error('[calendar] listEvents error:', error);
        // Handle the case where the user hasn't authorized yet
        if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('authorization')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('tokens'))) {
            throw new https_1.HttpsError('unauthenticated', 'Google Calendar access not authorized.');
        }
        throw new https_1.HttpsError('internal', 'Failed to fetch Google Calendar events.');
    }
});
//# sourceMappingURL=listEvents.js.map