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
exports.listEvents = (0, https_1.onCall)({
    cors: true,
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request) => {
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
        console.error(`[calendar] listEvents error for user ${authData.uid}:`, error);
        // Handle the case where the user hasn't authorized yet or tokens are invalid
        const errorMessage = error.message || '';
        if (errorMessage.includes('authorization') || errorMessage.includes('tokens') || errorMessage.includes('No tokens')) {
            throw new https_1.HttpsError('unauthenticated', 'חיבור ליומן גוגל פג או לא קיים. אנא התחבר מחדש.');
        }
        throw new https_1.HttpsError('internal', 'נכשל פיענוח אירועים מיומן גוגל. בדוק את החיבור.');
    }
});
//# sourceMappingURL=listEvents.js.map