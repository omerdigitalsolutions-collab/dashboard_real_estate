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
const db = (0, firestore_1.getFirestore)();
exports.matchPropertiesForLead = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
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
    // ── Fetch active properties from Agency ──────────────────────────────────────
    const agencySnapshot = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .get();
    const agencyProperties = agencySnapshot.docs.map(doc => (Object.assign({ id: doc.id, isExclusivity: true, collectionPath: 'properties' }, doc.data())));
    // ── Fetch global properties from 'cities' collections ───────────────────────
    let globalProperties = [];
    const req = requirements !== null && requirements !== void 0 ? requirements : {};
    if (req.desiredCity && req.desiredCity.length > 0) {
        const citiesToFetch = req.desiredCity.slice(0, 5);
        const globalPromises = citiesToFetch.map(async (cityName) => {
            try {
                const citySnap = await db.collection('cities').doc(cityName).collection('properties')
                    .limit(50)
                    .get();
                return citySnap.docs.map(doc => {
                    const data = doc.data();
                    return Object.assign({ id: doc.id, isExclusivity: false, collectionPath: `cities/${cityName}/properties`, address: data.street || data.address || 'כתובת חסויה' }, data);
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
            city: prop.city,
            neighborhood: prop.neighborhood,
            price: prop.price,
            rooms: prop.rooms,
            type: prop.type,
            hasElevator: prop.hasElevator,
            hasParking: prop.hasParking,
            hasBalcony: prop.hasBalcony,
            hasSafeRoom: prop.hasSafeRoom
        };
        const result = (0, matchingEngine_1.evaluateMatch)(matchingProp, req);
        if (result) {
            matches.push(Object.assign(Object.assign({}, prop), { matchScore: result.matchScore, category: result.category, isNeighborhoodMatch: result.isNeighborhoodMatch, requiresVerification: result.requiresVerification }));
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