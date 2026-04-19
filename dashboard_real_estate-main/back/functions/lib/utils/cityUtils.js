"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCityName = normalizeCityName;
const CITY_CORRECTIONS = {
    'tel aviv': 'תל אביב יפו',
    'תל אביב': 'תל אביב יפו',
    'תלאביב': 'תל אביב יפו',
    'tel aviv | תל אביב יפו': 'תל אביב יפו',
};
function normalizeCityName(cityName) {
    const trimmed = (cityName || '').trim();
    if (!trimmed)
        return 'unknown';
    const lower = trimmed.toLowerCase();
    // Check for explicit corrections
    if (CITY_CORRECTIONS[lower])
        return CITY_CORRECTIONS[lower];
    // Handle partial matches for Tel Aviv
    if (lower.includes('tel aviv') || lower.includes('תל אביב')) {
        return 'תל אביב יפו';
    }
    return trimmed;
}
//# sourceMappingURL=cityUtils.js.map