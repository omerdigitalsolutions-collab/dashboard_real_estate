"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCity = normalizeCity;
exports.isCityMatch = isCityMatch;
/**
 * Normalizes a city name for consistent matching.
 * Handles variations in Hebrew spelling, hyphens, quotes, and whitespace.
 */
function normalizeCity(city) {
    if (!city)
        return '';
    return city
        .toLowerCase()
        .trim()
        .replace(/[-'`"|/\\,.]/g, ' ') // Replace hyphens, quotes, pipes, slashes, and other separators with spaces
        .replace(/\s+/g, ' ') // Collapse multiple spaces into one
        .trim();
}
/**
 * Checks if a property city matches any of the desired cities.
 * Uses flexible matching (one is a substring of the other after normalization).
 */
function isCityMatch(desiredCities, propertyCity) {
    if (!desiredCities || desiredCities.length === 0)
        return true;
    const normProp = normalizeCity(propertyCity);
    if (!normProp)
        return false;
    return desiredCities.some(desired => {
        const normDesired = normalizeCity(desired);
        if (!normDesired)
            return false;
        // Match if one contains the other (e.g. "תל אביב" vs "תל אביב יפו")
        return normProp.includes(normDesired) || normDesired.includes(normProp);
    });
}
//# sourceMappingURL=stringUtils.js.map