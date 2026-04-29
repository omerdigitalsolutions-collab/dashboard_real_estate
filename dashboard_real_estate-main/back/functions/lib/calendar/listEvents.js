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
    cors: [/^https?:\/\/localhost(:\d+)?$/, 'https://dashboard-6f9d1.web.app', 'https://dashboard-6f9d1.firebaseapp.com'],
    invoker: 'public',
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
}, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { timeMin, timeMax } = request.data || {};
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
        const authClient = await (0, oauthClient_1.getOAuthClient)(authData.uid);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: authClient });
        // 1. Get all calendars the user has access to
        let calendarIds = ['primary'];
        try {
            const listResp = await calendar.calendarList.list({ maxResults: 100 });
            const items = listResp.data.items || [];
            const ids = items
                .filter(c => c.id && c.selected !== false)
                .map(c => c.id);
            if (ids.length > 0)
                calendarIds = ids;
        }
        catch (err) {
            console.warn('[calendar] calendarList.list failed, falling back to primary only:', err);
        }
        const minIso = timeMin !== null && timeMin !== void 0 ? timeMin : defaultMin.toISOString();
        const maxIso = timeMax !== null && timeMax !== void 0 ? timeMax : defaultMax.toISOString();
        // 2. Fetch events from all calendars in parallel
        const results = await Promise.all(calendarIds.map(async (cid) => {
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
            }
            catch (err) {
                console.warn(`[calendar] events.list failed for calendar ${cid}:`, err);
                return [];
            }
        }));
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