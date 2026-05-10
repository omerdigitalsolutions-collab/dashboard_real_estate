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

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { google } from 'googleapis';
import { defineSecret } from 'firebase-functions/params';
import { getOAuthClient } from '../calendar/oauthClient';

const googleClientId     = defineSecret('GOOGLE_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');
const googleRedirectUri  = defineSecret('GOOGLE_REDIRECT_URI');

export const syncCalendar = onSchedule(
    {
        schedule: '0 3 * * *',
        timeZone: 'Asia/Jerusalem',
        memory: '512MiB',
        timeoutSeconds: 540,
        secrets: [googleClientId, googleClientSecret, googleRedirectUri],
    },
    async () => {
        const db  = getFirestore();
        const now = new Date();
        const timeMin = now.toISOString();
        const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const usersSnap = await db.collection('users')
            .where('googleCalendar.enabled', '==', true)
            .get();

        console.log(`[syncCalendar] Processing ${usersSnap.docs.length} calendar-enabled users`);

        for (const userDoc of usersSnap.docs) {
            const userId   = userDoc.id;
            const agencyId = userDoc.data().agencyId as string | undefined;
            if (!agencyId) continue;

            // ── Obtain OAuth client (handles token refresh) ────────────────
            let authClient: Awaited<ReturnType<typeof getOAuthClient>>;
            try {
                authClient = await getOAuthClient(userId);
            } catch (err: any) {
                console.warn(`[syncCalendar] No OAuth client for user ${userId}:`, err.message);
                continue;
            }

            const calendar = google.calendar({ version: 'v3', auth: authClient as any }); // eslint-disable-line @typescript-eslint/no-explicit-any

            // ── Build holiday-filtered calendar ID list ────────────────────
            let calendarIds: string[] = ['primary'];
            try {
                const listResp = await calendar.calendarList.list({ maxResults: 100 });
                const ids = (listResp.data.items || [])
                    .filter(c => c.id && c.selected !== false && !c.id.includes('holiday'))
                    .map(c => c.id as string);
                if (ids.length > 0) calendarIds = ids;
            } catch (err: any) {
                if (err.code === 401 || err.message?.includes('invalid_grant')) {
                    console.warn(`[syncCalendar] Auth expired for user ${userId} — disabling`);
                    await db.collection('users').doc(userId).update({ 'googleCalendar.enabled': false });
                    continue;
                }
                console.warn(`[syncCalendar] calendarList.list failed for ${userId}:`, err.message);
            }

            // ── Fetch events into a map for O(1) task lookup ──────────────
            const gcalEventMap = new Map<string, { summary?: string; startDateTime?: string }>();

            await Promise.all(calendarIds.map(async (cid) => {
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
                                summary: ev.summary ?? undefined,
                                startDateTime: ev.start?.dateTime ?? undefined,
                            });
                        }
                    }
                } catch (err: any) {
                    console.warn(`[syncCalendar] events.list failed for ${userId} cal=${cid}:`, err.message);
                }
            }));

            // ── Query upcoming tasks for this agency with a googleEventId ──
            let tasksSnap;
            try {
                tasksSnap = await db.collection('tasks')
                    .where('agencyId', '==', agencyId)
                    .where('dueDate', '>=', Timestamp.fromDate(now))
                    .get();
            } catch (err) {
                console.warn(`[syncCalendar] tasks query failed for agency ${agencyId}:`, err);
                continue;
            }

            const updates: Promise<void>[] = [];

            for (const taskDoc of tasksSnap.docs) {
                const taskData    = taskDoc.data();
                const googleEventId: string | undefined = taskData.googleEventId;
                if (!googleEventId) continue;

                let gcalEvent = gcalEventMap.get(googleEventId);

                // Fallback: direct fetch for events slightly outside the window
                if (!gcalEvent) {
                    try {
                        const single = await calendar.events.get({
                            calendarId: 'primary',
                            eventId: googleEventId,
                        });
                        if (single.data.status === 'cancelled') continue;
                        gcalEvent = {
                            summary: single.data.summary ?? undefined,
                            startDateTime: single.data.start?.dateTime ?? undefined,
                        };
                    } catch (err: any) {
                        if (err.code === 404 || err.code === 410) continue;
                        console.warn(`[syncCalendar] events.get failed for task ${taskDoc.id}:`, err.message);
                        continue;
                    }
                }

                // ── Diff: detect changes in summary or start time ──────────
                const expectedTitle  = gcalEvent.summary ? `פגישה: ${gcalEvent.summary}` : undefined;
                const summaryChanged = expectedTitle !== undefined && taskData.title !== expectedTitle;

                // Compare as epoch milliseconds — avoids false positives from
                // timezone-offset format differences between Firestore UTC timestamps
                // ("2025-06-15T08:00:00.000Z") and Google Calendar local strings
                // ("2025-06-15T11:00:00+03:00"), which represent the same instant.
                const currentStartMs = (taskData.dueDate as Timestamp | undefined)?.toMillis();
                const gcalStartMs    = gcalEvent.startDateTime
                    ? new Date(gcalEvent.startDateTime).getTime()
                    : undefined;
                const startChanged   = gcalStartMs !== undefined && currentStartMs !== gcalStartMs;

                if (!summaryChanged && !startChanged) continue;

                const updateFields: Record<string, any> = { updatedAt: Timestamp.now() };
                if (summaryChanged && expectedTitle) updateFields.title = expectedTitle;
                if (startChanged && gcalEvent.startDateTime) {
                    updateFields.dueDate = Timestamp.fromDate(new Date(gcalEvent.startDateTime));
                }

                updates.push(
                    taskDoc.ref.update(updateFields)
                        .then(() => console.log(`[syncCalendar] Updated task ${taskDoc.id} for user ${userId}`))
                        .catch(err => console.warn(`[syncCalendar] Failed to update task ${taskDoc.id}:`, err))
                );
            }

            await Promise.all(updates);
            console.log(`[syncCalendar] User ${userId}: checked ${tasksSnap.docs.length} tasks, ${updates.length} updated`);
        }

        console.log('[syncCalendar] Daily calendar sync complete.');
    }
);
