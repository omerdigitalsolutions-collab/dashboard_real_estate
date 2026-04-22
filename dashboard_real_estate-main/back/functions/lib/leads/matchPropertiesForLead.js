"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchPropertiesForLead = void 0;
/**
 * matchPropertiesForLead — Server-side property matching engine.
 *
 * Fetches all active properties for an agency and applies deterministic
 * filtering logic against a lead's requirements.
 *
 * Matching Criteria (ALL must pass):
 *   1. property.status === 'active'
 *   2. property.city is in lead.requirements.desiredCity[] (or empty = any city)
 *   3. property.price <= lead.requirements.maxBudget (or null = no limit)
 *   4. property.rooms >= lead.requirements.minRooms (or null = no minimum)
 *   5. property.type is in lead.requirements.propertyType[] (or empty = any type)
 *
 * Security: Caller must be authenticated and belong to the target agencyId.
 *
 * Input:
 *   {
 *     agencyId: string,
 *     requirements: {
 *       desiredCity?: string[],
 *       maxBudget?: number,
 *       minRooms?: number,
 *       propertyType?: string[]
 *     }
 *   }
 *
 * Output: { matches: Property[], totalScanned: number }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const matchingEngine_1 = require("./matchingEngine");
const stringUtils_1 = require("./stringUtils");
const db = (0, firestore_1.getFirestore)();
// In-memory cache for the city list (document IDs in 'cities' collection)
let cachedCityNames = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes
/**
 * Fetches all city names from the 'cities' collection and returns those that
 * match any of the desired cities using substring matching.
 */
async function getMatchingCityNames(desiredCities) {
    const now = Date.now();
    if (!cachedCityNames || (now - lastCacheUpdate > CACHE_TTL)) {
        try {
            console.log('Refreshing cities catalog cache...');
            // Fetch all document IDs. Note: this still only finds 'real' documents.
            const snapshot = await db.collection('cities').select().get();
            cachedCityNames = snapshot.docs.map(doc => doc.id);
            lastCacheUpdate = now;
        }
        catch (err) {
            console.error('Error fetching cities catalog:', err);
            return desiredCities;
        }
    }
    if (!cachedCityNames)
        return desiredCities;
    // Filter the catalog for anything that matches our desired cities
    const resolved = cachedCityNames.filter(catalogCity => (0, stringUtils_1.isCityMatch)(desiredCities, catalogCity));
    // Optimization: If a desired city is missing from the catalog, it might be a phantom.
    // The main code will 'heal' these below.
    return resolved;
}
exports.matchPropertiesForLead = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { agencyId, requirements } = request.data;
    if (!(agencyId === null || agencyId === void 0 ? void 0 : agencyId.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'agencyId is required.');
    }
    // ── Agency membership check ─────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || ((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.agencyId) !== agencyId) {
        throw new https_1.HttpsError('permission-denied', 'Access denied to this agency.');
    }
    // ── City Discovery & Healing ───────────────────────────────────────────────
    // We fetch the agency doc to find its activeGlobalCities and 'touch' them
    // to ensure they are visible in the global cities catalog.
    const agencyDoc = await db.doc(`agencies/${agencyId}`).get();
    const agencyData = agencyDoc.data();
    const activeGlobalCities = (((_b = agencyData === null || agencyData === void 0 ? void 0 : agencyData.settings) === null || _b === void 0 ? void 0 : _b.activeGlobalCities) ||
        ((agencyData === null || agencyData === void 0 ? void 0 : agencyData.mainServiceArea) ? [agencyData.mainServiceArea] : []));
    if (activeGlobalCities.length > 0) {
        console.log('[HEAL] Touching cities for agency:', agencyId, activeGlobalCities);
        const healBatch = db.batch();
        activeGlobalCities.forEach(city => {
            // We touch the exact document and potentially some variations if we can guess them
            // But usually the user provides the 'base' name which matches the phantom ID.
            healBatch.set(db.collection('cities').doc(city), {
                exists: true,
                lastHeal: new Date()
            }, { merge: true });
        });
        await healBatch.commit().catch(e => console.error('[HEAL] Failed to touch cities:', e));
    }
    // ── Fetch active properties from Agency ──────────────────────────────────────
    const agencySnapshot = await db
        .collection('agencies').doc(agencyId).collection('properties')
        .where('status', '==', 'active')
        .get();
    const agencyProperties = agencySnapshot.docs.map(doc => (Object.assign({ id: doc.id, isExclusivity: true, collectionPath: `agencies/${agencyId}/properties` }, doc.data())));
    // ── Fetch global properties from 'cities' collections ───────────────────────
    let globalProperties = [];
    const req = requirements !== null && requirements !== void 0 ? requirements : {};
    if (req.desiredCity && req.desiredCity.length > 0) {
        // 1. Discover which cities in the global catalog match our desiredCities (substring match)
        // We Use a simple in-memory cache for the city names list to avoid repeated listDocuments calls
        const matchingCityNames = await getMatchingCityNames(req.desiredCity);
        // 2. Limit the number of cities to fetch from to avoid excessive Firestore calls
        const citiesToFetch = matchingCityNames.slice(0, 15);
        const globalPromises = citiesToFetch.map(async (cityName) => {
            try {
                const citySnap = await db.collection('cities').doc(cityName).collection('properties')
                    .limit(50) // Reduced limit per city to stay within reasonable bounds
                    .get();
                if (citySnap.empty)
                    return [];
                return citySnap.docs.map(doc => {
                    var _a, _b, _c, _d;
                    const data = doc.data();
                    // Cities collection still uses flat schema — normalize for matching engine
                    return Object.assign(Object.assign({ id: doc.id, isExclusivity: false, collectionPath: `cities/${cityName}/properties`, 
                        // Normalize to new nested paths so matching engine works uniformly
                        address: {
                            city: data.city || cityName,
                            street: data.street || '',
                            neighborhood: data.neighborhood || '',
                            fullAddress: data.address || data.street || 'כתובת חסויה',
                        }, transactionType: data.transactionType || data.type || 'forsale', financials: { price: data.price || 0 }, features: {
                            hasElevator: (_a = data.hasElevator) !== null && _a !== void 0 ? _a : null,
                            hasParking: (_b = data.hasParking) !== null && _b !== void 0 ? _b : null,
                            hasBalcony: (_c = data.hasBalcony) !== null && _c !== void 0 ? _c : null,
                            hasMamad: (_d = data.hasSafeRoom) !== null && _d !== void 0 ? _d : null,
                        } }, data), { city: data.city || cityName });
                });
            }
            catch (err) {
                console.warn(`Could not fetch global properties for city: ${cityName}`, err);
                return [];
            }
        });
        const results = await Promise.all(globalPromises);
        globalProperties = results.flat();
    }
    const allCandidateProperties = [...agencyProperties, ...globalProperties];
    // ── Weighted Matching Engine ───────────────────────────────────────────────
    const matches = [];
    for (const prop of allCandidateProperties) {
        // Prepare property for matching engine
        const matchingProp = {
            id: prop.id,
            city: ((_c = prop.address) === null || _c === void 0 ? void 0 : _c.city) || prop.city,
            neighborhood: ((_d = prop.address) === null || _d === void 0 ? void 0 : _d.neighborhood) || prop.neighborhood,
            street: ((_e = prop.address) === null || _e === void 0 ? void 0 : _e.street) || prop.street,
            price: (_g = (_f = prop.financials) === null || _f === void 0 ? void 0 : _f.price) !== null && _g !== void 0 ? _g : prop.price,
            rooms: prop.rooms,
            transactionType: prop.transactionType || prop.type || 'forsale',
            hasElevator: (_j = (_h = prop.features) === null || _h === void 0 ? void 0 : _h.hasElevator) !== null && _j !== void 0 ? _j : prop.hasElevator,
            hasParking: (_l = (_k = prop.features) === null || _k === void 0 ? void 0 : _k.hasParking) !== null && _l !== void 0 ? _l : prop.hasParking,
            hasBalcony: (_o = (_m = prop.features) === null || _m === void 0 ? void 0 : _m.hasBalcony) !== null && _o !== void 0 ? _o : prop.hasBalcony,
            hasMamad: (_q = (_p = prop.features) === null || _p === void 0 ? void 0 : _p.hasMamad) !== null && _q !== void 0 ? _q : prop.hasSafeRoom,
        };
        const result = (0, matchingEngine_1.evaluateMatch)(matchingProp, req);
        if (result) {
            matches.push(Object.assign(Object.assign({}, prop), { matchScore: result.matchScore, category: result.category, isNeighborhoodMatch: result.isNeighborhoodMatch, isStreetMatch: result.isStreetMatch, requiresVerification: result.requiresVerification }));
        }
    }
    // Sort by matchScore descending
    matches.sort((a, b) => b.matchScore - a.matchScore);
    return {
        matches,
        totalScanned: allCandidateProperties.length,
    };
});
//# sourceMappingURL=matchPropertiesForLead.js.map