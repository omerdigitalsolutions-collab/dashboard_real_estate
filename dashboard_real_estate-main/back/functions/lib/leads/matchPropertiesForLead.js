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
const stringUtils_1 = require("./stringUtils");
const db = (0, firestore_1.getFirestore)();
exports.matchPropertiesForLead = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b;
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
        // We limit to fetching from up to 5 cities to avoid excessive round-trips
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
    const propertyTypes = (_b = req.propertyType) !== null && _b !== void 0 ? _b : [];
    // ── Deterministic Matching Engine ───────────────────────────────────────────
    const matches = allCandidateProperties.filter(property => {
        var _a, _b;
        // 1. City filter (skip if no cities specified)
        if (!(0, stringUtils_1.isCityMatch)(req.desiredCity || [], property.city || '')) {
            return false;
        }
        // 2. Budget filter (skip if no max budget)
        if (req.maxBudget != null && req.maxBudget > 0) {
            if (((_a = property.price) !== null && _a !== void 0 ? _a : Infinity) > req.maxBudget)
                return false;
        }
        // 3. Rooms filter (skip if no minimum rooms)
        if (req.minRooms != null && req.minRooms > 0) {
            if (((_b = property.rooms) !== null && _b !== void 0 ? _b : 0) < req.minRooms)
                return false;
        }
        // 4. Property type filter (skip if no types specified)
        if (propertyTypes.length > 0) {
            if (!propertyTypes.includes(property.type))
                return false;
        }
        return true;
    });
    return {
        matches,
        totalScanned: allCandidateProperties.length,
    };
});
//# sourceMappingURL=matchPropertiesForLead.js.map