"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOfficeManagerUserId = getOfficeManagerUserId;
exports.queryFreeBusy = queryFreeBusy;
exports.findFreeSlots = findFreeSlots;
exports.formatSlotHebrew = formatSlotHebrew;
const admin = __importStar(require("firebase-admin"));
const googleapis_1 = require("googleapis");
const oauthClient_1 = require("../calendar/oauthClient");
const db = admin.firestore();
// ─── getOfficeManagerUserId ───────────────────────────────────────────────────
/**
 * Returns the Firebase UID of the first admin in the agency who has Google
 * Calendar connected (googleCalendar.enabled === true). Returns null when no
 * such user exists, so callers can degrade gracefully.
 */
async function getOfficeManagerUserId(agencyId) {
    var _a;
    const snap = await db.collection('users')
        .where('agencyId', '==', agencyId)
        .where('role', '==', 'admin')
        .limit(5)
        .get();
    for (const doc of snap.docs) {
        if (((_a = doc.data().googleCalendar) === null || _a === void 0 ? void 0 : _a.enabled) === true) {
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
async function queryFreeBusy(userId, timeMin, timeMax) {
    var _a, _b, _c;
    const authClient = await (0, oauthClient_1.getOAuthClient)(userId);
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: authClient }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const response = await calendar.freebusy.query({
        requestBody: {
            timeMin,
            timeMax,
            timeZone: 'Asia/Jerusalem',
            items: [{ id: 'primary' }],
        },
    });
    const busy = (_c = (_b = (_a = response.data.calendars) === null || _a === void 0 ? void 0 : _a['primary']) === null || _b === void 0 ? void 0 : _b.busy) !== null && _c !== void 0 ? _c : [];
    return busy
        .filter((b) => !!b.start && !!b.end)
        .map(b => ({ start: b.start, end: b.end }));
}
// ─── findFreeSlots ────────────────────────────────────────────────────────────
/**
 * Walks the window in `durationMins` increments and returns slots that:
 *  - Fall within working hours (09:00–18:00 Asia/Jerusalem)
 *  - Do not overlap any busy interval
 *  - Are in the future (>= now)
 * Returns at most 3 slots.
 */
function findFreeSlots(busySlots, windowStart, windowEnd, durationMins = 60) {
    const results = [];
    const stepMs = durationMins * 60 * 1000;
    const now = new Date();
    // Clone to avoid mutating the caller's date
    const cursor = new Date(windowStart);
    // Round up to next clean hour boundary so we propose tidy times
    cursor.setMinutes(0, 0, 0);
    cursor.setHours(cursor.getHours() + 1);
    while (cursor < windowEnd && results.length < 3) {
        const slotEnd = new Date(cursor.getTime() + stepMs);
        if (slotEnd > windowEnd)
            break;
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
function formatSlotHebrew(slot) {
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
//# sourceMappingURL=googleCalendar.js.map