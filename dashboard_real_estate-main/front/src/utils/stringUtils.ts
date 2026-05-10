/**
 * Normalizes a city name for consistent matching.
 * Handles variations in Hebrew spelling, hyphens, quotes, and whitespace.
 */
export function normalizeCity(city: string | null | undefined): string {
    if (!city) return '';
    
    let normalized = city
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0590-\u05FF]/g, ''); // Remove punctuation, spaces, etc.
    
    // Handle common Hebrew variations
    // 1. Remove 'יפו' from 'תל אביב יפו' variations
    normalized = normalized.replace(/יפו$/, '').replace(/^תלאביביפו$/, 'תלאביב');
    
    return normalized;
}

/**
 * Checks if a property city matches any of the desired cities.
 * Uses flexible matching (one is a substring of the other after normalization).
 */
export function isCityMatch(desiredCities: string[], propertyCity: string): boolean {
    if (!desiredCities || desiredCities.length === 0) return true;
    
    const normProp = normalizeCity(propertyCity);
    if (!normProp) return false;

    return desiredCities.some(desired => {
        const normDesired = normalizeCity(desired);
        if (!normDesired) return false;
        
        // Match if one contains the other (bidirectional)
        return normProp.includes(normDesired) || normDesired.includes(normProp);
    });
}
