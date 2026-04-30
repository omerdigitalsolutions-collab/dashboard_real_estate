export type HolidayType = 'jewish' | 'christian';

export interface Holiday {
    name: string;
    date: string; // YYYY-MM-DD
    type: HolidayType;
}

const HOLIDAYS: Holiday[] = [
    // ── 2024 ──────────────────────────────────────────────────────────────
    { name: 'ראש השנה', date: '2024-10-02', type: 'jewish' },
    { name: 'ראש השנה', date: '2024-10-03', type: 'jewish' },
    { name: 'יום כיפור', date: '2024-10-11', type: 'jewish' },
    { name: 'סוכות', date: '2024-10-16', type: 'jewish' },
    { name: 'סוכות', date: '2024-10-17', type: 'jewish' },
    { name: 'הושענא רבה', date: '2024-10-23', type: 'jewish' },
    { name: 'שמיני עצרת', date: '2024-10-24', type: 'jewish' },
    { name: 'חנוכה', date: '2024-12-25', type: 'jewish' },
    { name: 'חנוכה', date: '2024-12-26', type: 'jewish' },
    { name: 'חנוכה', date: '2024-12-27', type: 'jewish' },
    { name: 'חנוכה', date: '2024-12-28', type: 'jewish' },
    { name: 'חנוכה', date: '2024-12-29', type: 'jewish' },
    { name: 'חנוכה', date: '2024-12-30', type: 'jewish' },
    { name: 'חנוכה', date: '2024-12-31', type: 'jewish' },

    // ── 2025 ──────────────────────────────────────────────────────────────
    { name: 'חנוכה', date: '2025-01-01', type: 'jewish' },
    { name: "ט\"ו בשבט", date: '2025-02-13', type: 'jewish' },
    { name: 'פורים', date: '2025-03-13', type: 'jewish' },
    { name: 'שושן פורים', date: '2025-03-14', type: 'jewish' },
    { name: 'פסח', date: '2025-04-13', type: 'jewish' },
    { name: 'פסח', date: '2025-04-14', type: 'jewish' },
    { name: 'חול המועד פסח', date: '2025-04-15', type: 'jewish' },
    { name: 'חול המועד פסח', date: '2025-04-16', type: 'jewish' },
    { name: 'חול המועד פסח', date: '2025-04-17', type: 'jewish' },
    { name: 'חול המועד פסח', date: '2025-04-18', type: 'jewish' },
    { name: 'אחרון של פסח', date: '2025-04-19', type: 'jewish' },
    { name: 'שישי אחרון של פסח', date: '2025-04-20', type: 'jewish' },
    { name: 'יום השואה', date: '2025-04-24', type: 'jewish' },
    { name: 'יום הזיכרון', date: '2025-04-29', type: 'jewish' },
    { name: 'יום העצמאות', date: '2025-04-30', type: 'jewish' },
    { name: 'ל״ג בעומר', date: '2025-05-16', type: 'jewish' },
    { name: 'שבועות', date: '2025-06-01', type: 'jewish' },
    { name: 'שבועות', date: '2025-06-02', type: 'jewish' },
    { name: 'תשעה באב', date: '2025-08-04', type: 'jewish' },
    { name: 'ראש השנה', date: '2025-09-22', type: 'jewish' },
    { name: 'ראש השנה', date: '2025-09-23', type: 'jewish' },
    { name: 'יום כיפור', date: '2025-10-01', type: 'jewish' },
    { name: 'סוכות', date: '2025-10-06', type: 'jewish' },
    { name: 'סוכות', date: '2025-10-07', type: 'jewish' },
    { name: 'חול המועד סוכות', date: '2025-10-08', type: 'jewish' },
    { name: 'חול המועד סוכות', date: '2025-10-09', type: 'jewish' },
    { name: 'חול המועד סוכות', date: '2025-10-10', type: 'jewish' },
    { name: 'חול המועד סוכות', date: '2025-10-11', type: 'jewish' },
    { name: 'הושענא רבה', date: '2025-10-12', type: 'jewish' },
    { name: 'שמיני עצרת', date: '2025-10-13', type: 'jewish' },
    { name: 'שמחת תורה', date: '2025-10-14', type: 'jewish' },
    { name: 'חנוכה', date: '2025-12-14', type: 'jewish' },
    { name: 'חנוכה', date: '2025-12-15', type: 'jewish' },
    { name: 'חנוכה', date: '2025-12-16', type: 'jewish' },
    { name: 'חנוכה', date: '2025-12-17', type: 'jewish' },
    { name: 'חנוכה', date: '2025-12-18', type: 'jewish' },
    { name: 'חנוכה', date: '2025-12-19', type: 'jewish' },
    { name: 'חנוכה', date: '2025-12-20', type: 'jewish' },
    { name: 'חנוכה', date: '2025-12-21', type: 'jewish' },

    // ── 2026 ──────────────────────────────────────────────────────────────
    { name: "ט\"ו בשבט", date: '2026-02-12', type: 'jewish' },
    { name: 'פורים', date: '2026-03-05', type: 'jewish' },
    { name: 'שושן פורים', date: '2026-03-06', type: 'jewish' },
    { name: 'פסח', date: '2026-04-02', type: 'jewish' },
    { name: 'פסח', date: '2026-04-03', type: 'jewish' },
    { name: 'חול המועד פסח', date: '2026-04-04', type: 'jewish' },
    { name: 'חול המועד פסח', date: '2026-04-05', type: 'jewish' },
    { name: 'חול המועד פסח', date: '2026-04-06', type: 'jewish' },
    { name: 'חול המועד פסח', date: '2026-04-07', type: 'jewish' },
    { name: 'אחרון של פסח', date: '2026-04-08', type: 'jewish' },
    { name: 'יום השואה', date: '2026-04-29', type: 'jewish' },
    { name: 'יום הזיכרון', date: '2026-05-13', type: 'jewish' },
    { name: 'יום העצמאות', date: '2026-05-14', type: 'jewish' },
    { name: 'ל״ג בעומר', date: '2026-05-05', type: 'jewish' },
    { name: 'שבועות', date: '2026-05-21', type: 'jewish' },
    { name: 'שבועות', date: '2026-05-22', type: 'jewish' },
    { name: 'תשעה באב', date: '2026-07-23', type: 'jewish' },
    { name: 'ראש השנה', date: '2026-09-11', type: 'jewish' },
    { name: 'ראש השנה', date: '2026-09-12', type: 'jewish' },
    { name: 'יום כיפור', date: '2026-09-20', type: 'jewish' },
    { name: 'סוכות', date: '2026-09-25', type: 'jewish' },
    { name: 'סוכות', date: '2026-09-26', type: 'jewish' },
    { name: 'שמיני עצרת', date: '2026-10-02', type: 'jewish' },
    { name: 'שמחת תורה', date: '2026-10-03', type: 'jewish' },
    { name: 'חנוכה', date: '2026-12-04', type: 'jewish' },
    { name: 'חנוכה', date: '2026-12-05', type: 'jewish' },
    { name: 'חנוכה', date: '2026-12-06', type: 'jewish' },
    { name: 'חנוכה', date: '2026-12-07', type: 'jewish' },
    { name: 'חנוכה', date: '2026-12-08', type: 'jewish' },
    { name: 'חנוכה', date: '2026-12-09', type: 'jewish' },
    { name: 'חנוכה', date: '2026-12-10', type: 'jewish' },
    { name: 'חנוכה', date: '2026-12-11', type: 'jewish' },

    // ── 2027 ──────────────────────────────────────────────────────────────
    { name: "ט\"ו בשבט", date: '2027-02-01', type: 'jewish' },
    { name: 'פורים', date: '2027-03-23', type: 'jewish' },
    { name: 'פסח', date: '2027-04-21', type: 'jewish' },
    { name: 'אחרון של פסח', date: '2027-04-28', type: 'jewish' },
    { name: 'יום השואה', date: '2027-05-04', type: 'jewish' },
    { name: 'יום הזיכרון', date: '2027-05-10', type: 'jewish' },
    { name: 'יום העצמאות', date: '2027-05-11', type: 'jewish' },
    { name: 'שבועות', date: '2027-06-10', type: 'jewish' },
    { name: 'ראש השנה', date: '2027-09-01', type: 'jewish' },
    { name: 'ראש השנה', date: '2027-09-02', type: 'jewish' },
    { name: 'יום כיפור', date: '2027-09-10', type: 'jewish' },
    { name: 'סוכות', date: '2027-09-15', type: 'jewish' },
    { name: 'שמיני עצרת', date: '2027-09-22', type: 'jewish' },
    { name: 'חנוכה', date: '2027-12-24', type: 'jewish' },
];

/** Returns all holidays that fall within [from, to] inclusive (YYYY-MM-DD strings). */
export function getHolidaysInRange(from: string, to: string): Holiday[] {
    return HOLIDAYS.filter(h => h.date >= from && h.date <= to);
}

/** Returns holidays for a specific date (YYYY-MM-DD). */
export function getHolidaysForDate(dateStr: string): Holiday[] {
    return HOLIDAYS.filter(h => h.date === dateStr);
}
