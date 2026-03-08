/**
 * ─── Global Input Validation Utility ──────────────────────────────────────────
 *
 * Centralised validation functions for common input types across the CRM.
 */

// Basic email regex: something@something.something
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an email address.
 */
export function isValidEmail(email?: string | null): boolean {
    if (!email) return false;
    return EMAIL_REGEX.test(email.trim().toLowerCase());
}

/**
 * Validates a phone number (Israeli & International).
 * Allows spaces, dashes, and parentheses natively.
 */
export function isValidPhone(phone?: string | null): boolean {
    if (!phone) return false;

    // Strip common separators: spaces, dashes, parentheses
    const cleaned = phone.replace(/[-\s()]/g, '');

    // Must be between 9 and 15 digits, optionally starting with +
    if (!/^(\+?\d{9,15})$/.test(cleaned)) {
        return false;
    }

    // Specific check for local Israeli numbers (must be 9 to 10 digits if starting with 0)
    if (cleaned.startsWith('0')) {
        return cleaned.length === 9 || cleaned.length === 10;
    }

    // For international (+972 or otherwise), assume the 9-15 char range is sufficient.
    return true;
}

/**
 * Normalizes a phone number to strict E.164 format.
 * Primarily handles converting local Israeli numbers (05...) to +9725...
 * If the number already has a +, it strips non-digits.
 */
export function normalizePhoneIL(phone?: string | null): string {
    if (!phone) return '';

    // Remove spaces, dashes, and parens
    let cleaned = phone.replace(/[-\s()]/g, '');

    // If it starts with 0 and is 9-10 digits long, assume it's Israel local
    if (cleaned.startsWith('0') && (cleaned.length === 9 || cleaned.length === 10)) {
        return '+972' + cleaned.substring(1);
    }

    // If it doesn't start with +, add it (assumes international input without +)
    if (!cleaned.startsWith('+')) {
        return '+' + cleaned;
    }

    return cleaned;
}

/**
 * Validates a real estate commission percentage.
 * Must be a pure number between 0 and 100.
 * Rejects inputs with letters or out of range.
 */
export function isValidCommission(commission?: string | number | null): boolean {
    if (commission === undefined || commission === null) return false;

    const str = String(commission).trim();
    if (!str) return false;

    // Must be numeric (digits with optional single decimal point)
    if (!/^\d+(\.\d+)?$/.test(str)) return false;

    const val = parseFloat(str);
    return !isNaN(val) && val >= 0 && val <= 100;
}
