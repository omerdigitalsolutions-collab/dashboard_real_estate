"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addProperty = void 0;
/**
 * addProperty — Creates a new property document for an agency.
 *
 * Security: Caller must be authenticated and belong to the specified agencyId.
 * The agencyId and status are injected server-side and cannot be spoofed.
 *
 * Input:
 *   {
 *     agencyId: string,
 *     address: string,
 *     city: string,
 *     type: 'sale' | 'rent',
 *     price: number,
 *     rooms?: number,
 *     floor?: number,
 *     sqMeters?: number,
 *     features?: string[],
 *     description?: string,
 *     assignedAgentId?: string
 *   }
 *
 * Output: { success: true, propertyId: string }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
exports.addProperty = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const data = request.data;
    // ── Validation ─────────────────────────────────────────────────────────────
    if (!((_a = data.agencyId) === null || _a === void 0 ? void 0 : _a.trim()))
        throw new https_1.HttpsError('invalid-argument', 'agencyId is required.');
    if (!((_b = data.address) === null || _b === void 0 ? void 0 : _b.trim()))
        throw new https_1.HttpsError('invalid-argument', 'address is required.');
    if (!((_c = data.city) === null || _c === void 0 ? void 0 : _c.trim()))
        throw new https_1.HttpsError('invalid-argument', 'city is required.');
    if (!data.type)
        throw new https_1.HttpsError('invalid-argument', 'type must be "sale" or "rent".');
    if (!data.price || data.price <= 0)
        throw new https_1.HttpsError('invalid-argument', 'price must be a positive number.');
    // ── Agency membership check ─────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || ((_d = callerDoc.data()) === null || _d === void 0 ? void 0 : _d.agencyId) !== data.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not belong to this agency.');
    }
    // ── Create the document ─────────────────────────────────────────────────────
    const propertyRef = db.collection('properties').doc();
    await propertyRef.set({
        address: data.address.trim(),
        city: data.city.trim(),
        type: data.type,
        price: data.price,
        rooms: (_e = data.rooms) !== null && _e !== void 0 ? _e : null,
        floor: (_f = data.floor) !== null && _f !== void 0 ? _f : null,
        sqMeters: (_g = data.sqMeters) !== null && _g !== void 0 ? _g : null,
        features: (_h = data.features) !== null && _h !== void 0 ? _h : [],
        description: (_k = (_j = data.description) === null || _j === void 0 ? void 0 : _j.trim()) !== null && _k !== void 0 ? _k : null,
        assignedAgentId: (_l = data.assignedAgentId) !== null && _l !== void 0 ? _l : null,
        agencyId: data.agencyId, // injected server-side
        status: 'active', // injected server-side
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { success: true, propertyId: propertyRef.id };
});
//# sourceMappingURL=addProperty.js.map