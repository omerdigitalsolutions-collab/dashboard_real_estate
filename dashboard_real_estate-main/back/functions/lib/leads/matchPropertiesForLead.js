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
const db = (0, firestore_1.getFirestore)();
exports.matchPropertiesForLead = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
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
    // ── Fetch active properties ─────────────────────────────────────────────────
    const snapshot = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .get();
    const allActiveProperties = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
    const req = requirements !== null && requirements !== void 0 ? requirements : {};
    const desiredCities = (_c = (_b = req.desiredCity) === null || _b === void 0 ? void 0 : _b.map((c) => c.trim().toLowerCase())) !== null && _c !== void 0 ? _c : [];
    const propertyTypes = (_d = req.propertyType) !== null && _d !== void 0 ? _d : [];
    // ── Deterministic Matching Engine ───────────────────────────────────────────
    const matches = allActiveProperties.filter(property => {
        var _a, _b, _c;
        // 1. City filter (skip if no cities specified)
        if (desiredCities.length > 0) {
            const propCity = ((_a = property.city) !== null && _a !== void 0 ? _a : '').trim().toLowerCase();
            if (!desiredCities.includes(propCity))
                return false;
        }
        // 2. Budget filter (skip if no max budget)
        if (req.maxBudget != null && req.maxBudget > 0) {
            if (((_b = property.price) !== null && _b !== void 0 ? _b : Infinity) > req.maxBudget)
                return false;
        }
        // 3. Rooms filter (skip if no minimum rooms)
        if (req.minRooms != null && req.minRooms > 0) {
            if (((_c = property.rooms) !== null && _c !== void 0 ? _c : 0) < req.minRooms)
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
        totalScanned: allActiveProperties.length,
    };
});
//# sourceMappingURL=matchPropertiesForLead.js.map