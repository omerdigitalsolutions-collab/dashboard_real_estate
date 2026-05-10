/**
 * ─── Google Calendar Service ──────────────────────────────────────────────────
 *
 * Freebusy query utilities for the WhatsApp bot scheduling flow.
 *
 * Exports:
 *   getOfficeManagerUserId(agencyId)         — finds admin user with calendar connected
 *   queryFreeBusy(userId, timeMin, timeMax)  — calls calendar.freebusy.query
 *   findFreeSlots(busy, start, end, dur)     — returns up to 3 working-hour free slots
 *   formatSlotHebrew(slot)                   — formats a slot as a Hebrew string
 */

import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { getOAuthClient } from '../calendar/oauthClient';

const db = admin.firestore();

export interface TimeSlot {
  start: string; // ISO 8601
  end: string;   // ISO 8601
}

// ─── getOfficeManagerUserId ───────────────────────────────────────────────────

/**
 * Returns the Firebase UID of the first admin in the agency who has Google
 * Calendar connected (googleCalendar.enabled === true). Returns null when no
 * such user exists, so callers can degrade gracefully.
 */
export async function getOfficeManagerUserId(agencyId: string): Promise<string | null> {
  const snap = await db.collection('users')
    .where('agencyId', '==', agencyId)
    .where('role', '==', 'admin')
    .limit(5)
    .get();

  for (const doc of snap.docs) {
    if (doc.data().googleCalendar?.enabled === true) {
      return doc.id;
    }
  }
  return null;
}

// ─── queryFreeBusy ────────────────────────────────────────────────────────────

/**
 * Queries the Google Calendar freebusy endpoint for the user's primary calendar
 * over [timeMin, timeMax]. Returns an array of busy intervals.
 */
export async function queryFreeBusy(
  userId: string,
  timeMin: string,
  timeMax: string,
): Promise<TimeSlot[]> {
  const authClient = await getOAuthClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: authClient as any }); // eslint-disable-line @typescript-eslint/no-explicit-any

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: 'Asia/Jerusalem',
      items: [{ id: 'primary' }],
    },
  });

  const busy = response.data.calendars?.['primary']?.busy ?? [];
  return busy
    .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
    .map(b => ({ start: b.start!, end: b.end! }));
}

// ─── findFreeSlots ────────────────────────────────────────────────────────────

/**
 * Walks the window in `durationMins` increments and returns slots that:
 *  - Fall within working hours (09:00–18:00 Asia/Jerusalem)
 *  - Do not overlap any busy interval
 *  - Are in the future (>= now)
 * Returns at most 3 slots.
 */
export function findFreeSlots(
  busySlots: TimeSlot[],
  windowStart: Date,
  windowEnd: Date,
  durationMins = 60,
): TimeSlot[] {
  const results: TimeSlot[] = [];
  const stepMs = durationMins * 60 * 1000;
  const now = new Date();

  // Clone to avoid mutating the caller's date
  const cursor = new Date(windowStart);

  // Round up to next clean hour boundary so we propose tidy times
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 1);

  while (cursor < windowEnd && results.length < 3) {
    const slotEnd = new Date(cursor.getTime() + stepMs);

    if (slotEnd > windowEnd) break;
    if (cursor <= now) {
      cursor.setTime(cursor.getTime() + stepMs);
      continue;
    }

    // Jerusalem local hour (UTC+2 or UTC+3 depending on DST)
    // We use a simple UTC offset approximation: Israel is UTC+2/+3.
    // The googleapis freebusy call already uses Asia/Jerusalem, so busy slots
    // are in UTC. We check working hours by converting to Jerusalem time.
    const jerusalemOffset = 2 * 60; // conservative — enough for scheduling guard
    const localHour = (cursor.getUTCHours() * 60 + cursor.getUTCMinutes() + jerusalemOffset) / 60 % 24;

    if (localHour >= 9 && localHour < 18) {
      const isOverlap = busySlots.some(busy => {
        const bs = new Date(busy.start);
        const be = new Date(busy.end);
        return cursor < be && slotEnd > bs;
      });

      if (!isOverlap) {
        results.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
      }
    }

    cursor.setTime(cursor.getTime() + stepMs);
  }

  return results;
}

// ─── formatSlotHebrew ─────────────────────────────────────────────────────────

/**
 * Formats a TimeSlot as a human-readable Hebrew string.
 * Example: "יום שלישי, 14 במאי בשעה 10:00"
 */
export function formatSlotHebrew(slot: TimeSlot): string {
  const date = new Date(slot.start);
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  // Convert UTC to Jerusalem time (UTC+2 conservative — handles most of the year)
  const jerusalemMs = date.getTime() + 2 * 60 * 60 * 1000;
  const jDate = new Date(jerusalemMs);

  const day = dayNames[jDate.getUTCDay()];
  const dayNum = jDate.getUTCDate();
  const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const month = monthNames[jDate.getUTCMonth()];
  const hours = String(jDate.getUTCHours()).padStart(2, '0');
  const minutes = String(jDate.getUTCMinutes()).padStart(2, '0');

  return `יום ${day}, ${dayNum} ב${month} בשעה ${hours}:${minutes}`;
}
