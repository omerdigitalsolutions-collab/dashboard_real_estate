"use strict";
/**
 * Facebook post classifier and field extractors.
 *
 * Pure TypeScript — no external dependencies. Used by the daily Facebook
 * group scanner to filter out broker posts and pull contact details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyFBPost = classifyFBPost;
exports.extractPhone = extractPhone;
exports.extractThumbnail = extractThumbnail;
const PRIVATE_KEYWORDS = [
    'ללא תיווך',
    'בעל הנכס',
    'בעל הדירה',
    'בעלי הדירה',
    'מוכר בעצמי',
    'מוכרים בעצמנו',
    'ישיר מבעלים',
    'ישיר מהבעלים',
    'מכירה ישירה',
    'מבעל הנכס',
    'לא למתווכים',
    'אין תיווך',
    'בלי תיווך',
];
const BROKER_KEYWORDS = [
    'מתווך',
    'מתווכת',
    'מתווכים',
    'תיווך',
    'בלעדיות',
    'בבלעדיות',
    'סוכנות',
    'יועץ נדל',
    'יועצת נדל',
    'משרד תיווך',
    'עמלה',
    'ליווי מקצועי',
];
/**
 * Classify a Facebook post as PRIVATE (direct seller) or BROKER (real-estate
 * agent post). Private wins if both keyword sets match — owners often write
 * "ללא תיווך" together with the word "תיווך".
 */
function classifyFBPost(text) {
    if (!text)
        return 'PRIVATE';
    const lower = text.toLowerCase();
    const hasPrivate = PRIVATE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
    if (hasPrivate)
        return 'PRIVATE';
    const hasBroker = BROKER_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
    if (hasBroker)
        return 'BROKER';
    return 'PRIVATE';
}
/**
 * Extract the first Israeli phone number from a text blob (mobile or landline).
 * Returns the number with dashes stripped, or null if none found.
 */
function extractPhone(text) {
    if (!text)
        return null;
    const re = /(05\d-?\d{7}|0[23489]-?\d{7})/;
    const match = text.match(re);
    if (!match)
        return null;
    return match[0].replace(/[-\s]/g, '');
}
/**
 * Pick the first Photo attachment URL from an Apify Facebook post item.
 * Skips MediaContainerMediaSet wrappers and product-card attachments.
 */
function extractThumbnail(attachments) {
    var _a;
    if (!Array.isArray(attachments))
        return null;
    for (const a of attachments) {
        if ((a === null || a === void 0 ? void 0 : a.__typename) === 'Photo' && ((_a = a === null || a === void 0 ? void 0 : a.image) === null || _a === void 0 ? void 0 : _a.uri)) {
            return a.image.uri;
        }
    }
    return null;
}
//# sourceMappingURL=fbClassifier.js.map