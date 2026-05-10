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
function getJerusalemHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find(p => p.type === 'hour');
  return hourPart ? parseInt(hourPart.value, 10) : 0;
}

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

  // Round to a clean hour boundary. Only advance to the *next* hour if there
  // are sub-hour components — this preserves a 09:00 windowStart instead of
  // bumping it to 10:00 (which happened with the unconditional +1 hour).
  const hadSubHour = cursor.getMinutes() > 0 || cursor.getSeconds() > 0 || cursor.getMilliseconds() > 0;
  cursor.setMinutes(0, 0, 0);
  if (hadSubHour) {
    cursor.setHours(cursor.getHours() + 1);
  }

  while (cursor < windowEnd && results.length < 3) {
    const slotEnd = new Date(cursor.getTime() + stepMs);

    if (slotEnd > windowEnd) break;
    if (cursor <= now) {
      cursor.setTime(cursor.getTime() + stepMs);
      continue;
    }

    // Use Intl API for DST-safe Jerusalem hour (Israel is UTC+2 in winter, UTC+3 in summer).
    const localHour = getJerusalemHour(cursor);

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
 *
 * Uses Intl.DateTimeFormat with Asia/Jerusalem timezone so DST is handled
 * correctly (Israel is UTC+2 in winter, UTC+3 in summer).
 */
export function formatSlotHebrew(slot: TimeSlot): string {
  const date = new Date(slot.start);
  const tz = 'Asia/Jerusalem';

  const weekday = date.toLocaleDateString('he-IL', { timeZone: tz, weekday: 'long' });
  const dayNum  = date.toLocaleDateString('he-IL', { timeZone: tz, day: 'numeric' });
  const month   = date.toLocaleDateString('he-IL', { timeZone: tz, month: 'long' });
  // en-GB always produces "HH:MM" (24-hour, colon-separated) — more reliable
  // than he-IL which may include AM/PM markers in some Node.js versions.
  const time    = date.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

  return `${weekday}, ${dayNum} ב${month} בשעה ${time}`;
}
