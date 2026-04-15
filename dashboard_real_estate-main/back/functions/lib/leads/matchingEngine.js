"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateMatch = evaluateMatch;
const stringUtils_1 = require("./stringUtils");
const PRICE_MARGIN = 1.07;
const ROOMS_TOLERANCE = 0.5;
/**
 * Shared scoring logic for both Property-to-Lead and Lead-to-Property matching.
 */
function evaluateMatch(property, requirements) {
    var _a, _b;
    const req = requirements;
    const weights = (_a = req.weights) !== null && _a !== void 0 ? _a : { budget: 5, rooms: 5, location: 5, amenities: 5 };
    const requiresVerification = [];
    let weightedPoints = 0;
    let totalPossibleWeight = 0;
    // ── 1. Transaction Type (STRICT) ──────────────────────────────────────────
    const wantedTypes = (_b = req.propertyType) !== null && _b !== void 0 ? _b : [];
    if (wantedTypes.length > 0) {
        const typeMatch = wantedTypes.some(t => {
            if (t === 'sale' || t === 'rent')
                return t === property.type;
            if (t.includes('קנייה') || t.includes('מכירה'))
                return property.type === 'sale';
            if (t.includes('שכירות'))
                return property.type === 'rent';
            return false;
        });
        if (!typeMatch)
            return null;
    }
    // ── 2. Location (City + Neighborhood) ─────────────────────────────────────
    const locationWeight = weights.location || 1;
    totalPossibleWeight += locationWeight;
    const desiredCities = req.desiredCity || [];
    const desiredNeighborhoods = req.desiredNeighborhoods || [];
    const allLocationQueries = [...desiredCities, ...desiredNeighborhoods];
    if (!(0, stringUtils_1.isCityMatch)(desiredCities, property.city || '')) {
        return null;
    }
    let neighborhoodScore = 0.5;
    let isNeighborhoodMatch = false;
    if (allLocationQueries.length > 0) {
        if (property.neighborhood) {
            const propNeighborhood = property.neighborhood.toLowerCase().trim();
            // Check if any query contains the neighborhood or is equal to it
            const found = allLocationQueries.some(q => {
                const qLower = q.toLowerCase();
                return qLower.includes(propNeighborhood) || propNeighborhood.includes(qLower);
            });
            if (found) {
                neighborhoodScore = 1.0;
                isNeighborhoodMatch = true;
            }
        }
        else {
            // If property has no neighborhood data, we treat it as a match to avoid penalizing valid city matches
            neighborhoodScore = 1.0;
            isNeighborhoodMatch = true;
        }
    }
    else {
        neighborhoodScore = 1.0;
        isNeighborhoodMatch = true;
    }
    weightedPoints += neighborhoodScore * locationWeight;
    // ── 3. Price ──────────────────────────────────────────────────────────────
    if (req.maxBudget != null && req.maxBudget > 0) {
        const budgetWeight = weights.budget || 1;
        totalPossibleWeight += budgetWeight;
        const effectiveBudget = req.maxBudget * PRICE_MARGIN;
        if (property.price > effectiveBudget)
            return null;
        let priceScore = 0;
        if (property.price <= req.maxBudget) {
            priceScore = 1.0;
        }
        else {
            const zoneProgress = (property.price - req.maxBudget) / (req.maxBudget * 0.07);
            priceScore = Math.max(0, 1.0 - zoneProgress);
        }
        weightedPoints += priceScore * budgetWeight;
    }
    // ── 4. Rooms ──────────────────────────────────────────────────────────────
    const desiredMin = req.minRooms != null ? req.minRooms : null;
    const desiredMax = req.maxRooms != null ? req.maxRooms : null;
    if ((desiredMin != null || desiredMax != null) && property.rooms != null) {
        const roomsWeight = weights.rooms || 1;
        totalPossibleWeight += roomsWeight;
        const roomsOk = (desiredMin == null || property.rooms >= desiredMin - ROOMS_TOLERANCE) &&
            (desiredMax == null || property.rooms <= desiredMax + ROOMS_TOLERANCE);
        if (!roomsOk)
            return null;
        const strictOk = (desiredMin == null || property.rooms >= desiredMin) &&
            (desiredMax == null || property.rooms <= desiredMax);
        const roomsScore = strictOk ? 1.0 : 0.5;
        weightedPoints += roomsScore * roomsWeight;
    }
    // ── 5. Amenities ──────────────────────────────────────────────────────────
    const amenityChecks = [
        { reqField: 'mustHaveElevator', propField: 'hasElevator', label: 'hasElevator' },
        { reqField: 'mustHaveParking', propField: 'hasParking', label: 'hasParking' },
        { reqField: 'mustHaveBalcony', propField: 'hasBalcony', label: 'hasBalcony' },
        { reqField: 'mustHaveSafeRoom', propField: 'hasSafeRoom', label: 'hasSafeRoom' },
    ];
    const requiredAmenities = amenityChecks.filter(a => req[a.reqField] === true);
    if (requiredAmenities.length > 0) {
        const amenityWeight = weights.amenities || 1;
        totalPossibleWeight += amenityWeight;
        let amenityScoreSum = 0;
        for (const { reqField, propField, label } of requiredAmenities) {
            const propValue = property[propField];
            if (propValue === false) {
                return null;
            }
            else if (propValue === true) {
                amenityScoreSum += 1.0;
            }
            else {
                requiresVerification.push(label);
                amenityScoreSum += 0.5;
            }
        }
        const avgAmenityScore = amenityScoreSum / requiredAmenities.length;
        weightedPoints += avgAmenityScore * amenityWeight;
    }
    const matchScore = totalPossibleWeight > 0
        ? Math.min(100, Math.round((weightedPoints / totalPossibleWeight) * 100))
        : 50;
    if (matchScore < 50)
        return null;
    const category = matchScore >= 80 ? 'high' : 'medium';
    return {
        matchScore,
        category,
        isNeighborhoodMatch,
        requiresVerification
    };
}
//# sourceMappingURL=matchingEngine.js.map