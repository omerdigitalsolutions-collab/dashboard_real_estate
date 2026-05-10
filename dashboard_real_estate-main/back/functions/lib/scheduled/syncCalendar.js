"use strict";
/**
 * ─── Scheduled — Daily Google Calendar Sync ──────────────────────────────────
 *
 * Runs daily at 03:00 Asia/Jerusalem.
 *
 * For each user with googleCalendar.enabled = true:
 *   1. Fetches their Google Calendar events for the next 30 days,
 *      filtered to exclude holiday calendars (any calendar ID containing 'holiday').
 *   2. Queries upcoming Firestore tasks for the user's agency that have a googleEventId.
 *   3. For each linked task, checks if the event's summary or start time changed
 *      in Google Calendar.
 *   4. If changed, updates the Firestore task accordingly.
 *   5. On OAuth error (401 / invalid_grant), disables the integration and continues.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCalendar = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const googleapis_1 = require("googleapis");
const params_1 = require("firebase-functions/params");
const oauthClient_1 = require("../calendar/oauthClient");
const googleClientId = (0, params_1.defineSecret)('GOOGLE_CLIENT_ID');
const googleClientSecret = (0, params_1.defineSecret)('GOOGLE_CLIENT_SECRET');
const googleRedirectUri = (0, params_1.defineSecret)('GOOGLE_REDIRECT_URI');
exports.syncCalendar = (0, scheduler_1.onSchedule)({
    schedule: '0 3 * * *',
    timeZone: 'Asia/Jerusalem',
    memory: '512MiB',
    timeoutSeconds: 540,
    secrets: [googleClientId, googleClientSecret, googleRedirectUri],
}, async () => {
    var _a, _b, _c, _d, _e, _f;
    const db = (0, firestore_1.getFirestore)();
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const usersSnap = await db.collection('users')
        .where('googleCalendar.enabled', '==', true)
        .get();
    console.log(`[syncCalendar] Processing ${usersSnap.docs.length} calendar-enabled users`);
    for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const agencyId = userDoc.data().agencyId;
        if (!agencyId)
            continue;
        // ── Obtain OAuth client (handles token refresh) ────────────────
        let authClient;
        try {
            authClient = await (0, oauthClient_1.getOAuthClient)(userId);
        }
        catch (err) {
            console.warn(`[syncCalendar] No OAuth client for user ${userId}:`, err.message);
            continue;
        }
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: authClient }); // eslint-disable-line @typescript-eslint/no-explicit-any
        // ── Build holiday-filtered calendar ID list ────────────────────
        let calendarIds = ['primary'];
        try {
            const listResp = await calendar.calendarList.list({ maxResults: 100 });
            const ids = (listResp.data.items || [])
                .filter(c => c.id && c.selected !== false && !c.id.includes('holiday'))
                .map(c => c.id);
            if (ids.length > 0)
                calendarIds = ids;
        }
        catch (err) {
            if (err.code === 401 || ((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes('invalid_grant'))) {
                console.warn(`[syncCalendar] Auth expired for user ${userId} — disabling`);
                await db.collection('users').doc(userId).update({ 'googleCalendar.enabled': false });
                continue;
            }
            console.warn(`[syncCalendar] calendarList.list failed for ${userId}:`, err.message);
        }
        // ── Fetch events into a map for O(1) task lookup ──────────────
        const gcalEventMap = new Map();
        await Promise.all(calendarIds.map(async (cid) => {
            var _a, _b, _c;
            try {
                const resp = await calendar.events.list({
                    calendarId: cid,
                    timeMin,
                    timeMax,
                    maxResults: 500,
                    singleEvents: true,
                    orderBy: 'startTime',
                });
                for (const ev of (resp.data.items || [])) {
                    if (ev.id) {
                        gcalEventMap.set(ev.id, {
                            summary: (_a = ev.summary) !== null && _a !== void 0 ? _a : undefined,
                            startDateTime: (_c = (_b = ev.start) === null || _b === void 0 ? void 0 : _b.dateTime) !== null && _c !== void 0 ? _c : undefined,
                        });
                    }
                }
            }
            catch (err) {
                console.warn(`[syncCalendar] events.list failed for ${userId} cal=${cid}:`, err.message);
            }
        }));
        // ── Query upcoming tasks for this agency with a googleEventId ──
        let tasksSnap;
        try {
            tasksSnap = await db.collection('tasks')
                .where('agencyId', '==', agencyId)
                .where('dueDate', '>=', firestore_1.Timestamp.fromDate(now))
                .get();
        }
        catch (err) {
            console.warn(`[syncCalendar] tasks query failed for agency ${agencyId}:`, err);
            continue;
        }
        const updates = [];
        for (const taskDoc of tasksSnap.docs) {
            const taskData = taskDoc.data();
            const googleEventId = taskData.googleEventId;
            if (!googleEventId)
                continue;
            let gcalEvent = gcalEventMap.get(googleEventId);
            // Fallback: direct fetch for events slightly outside the window
            if (!gcalEvent) {
                try {
                    const single = await calendar.events.get({
                        calendarId: 'primary',
                        eventId: googleEventId,
                    });
                    if (single.data.status === 'cancelled')
                        continue;
                    gcalEvent = {
                        summary: (_b = single.data.summary) !== null && _b !== void 0 ? _b : undefined,
                        startDateTime: (_d = (_c = single.data.start) === null || _c === void 0 ? void 0 : _c.dateTime) !== null && _d !== void 0 ? _d : undefined,
                    };
                }
                catch (err) {
                    if (err.code === 404 || err.code === 410)
                        continue;
                    console.warn(`[syncCalendar] events.get failed for task ${taskDoc.id}:`, err.message);
                    continue;
                }
            }
            // ── Diff: detect changes in summary or start time ──────────
            const expectedTitle = gcalEvent.summary ? `פגישה: ${gcalEvent.summary}` : undefined;
            const summaryChanged = expectedTitle !== undefined && taskData.title !== expectedTitle;
            const currentStart = (_f = (_e = taskData.dueDate) === null || _e === void 0 ? void 0 : _e.toDate()) === null || _f === void 0 ? void 0 : _f.toISOString();
            const startChanged = gcalEvent.startDateTime !== undefined &&
                currentStart !== gcalEvent.startDateTime;
            if (!summaryChanged && !startChanged)
                continue;
            const updateFields = { updatedAt: firestore_1.Timestamp.now() };
            if (summaryChanged && expectedTitle)
                updateFields.title = expectedTitle;
            if (startChanged && gcalEvent.startDateTime) {
                updateFields.dueDate = firestore_1.Timestamp.fromDate(new Date(gcalEvent.startDateTime));
            }
            updates.push(taskDoc.ref.update(updateFields)
                .then(() => console.log(`[syncCalendar] Updated task ${taskDoc.id} for user ${userId}`))
                .catch(err => console.warn(`[syncCalendar] Failed to update task ${taskDoc.id}:`, err)));
        }
        await Promise.all(updates);
        console.log(`[syncCalendar] User ${userId}: checked ${tasksSnap.docs.length} tasks, ${updates.length} updated`);
    }
    console.log('[syncCalendar] Daily calendar sync complete.');
});
//# sourceMappingURL=syncCalendar.js.map