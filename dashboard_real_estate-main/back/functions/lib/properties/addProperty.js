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
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
exports.addProperty = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    // ── Auth & Agency validation ────────────────────────────────────────────────
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const data = request.data;
    // ── Validation ─────────────────────────────────────────────────────────────
    if (!((_a = data.address) === null || _a === void 0 ? void 0 : _a.trim()))
        throw new https_1.HttpsError('invalid-argument', 'address is required.');
    if (!((_b = data.city) === null || _b === void 0 ? void 0 : _b.trim()))
        throw new https_1.HttpsError('invalid-argument', 'city is required.');
    if (!data.type)
        throw new https_1.HttpsError('invalid-argument', 'type must be "sale" or "rent".');
    if (!data.price || data.price <= 0)
        throw new https_1.HttpsError('invalid-argument', 'price must be a positive number.');
    // ── Create the document ─────────────────────────────────────────────────────
    const propertyRef = db.collection('properties').doc();
    await propertyRef.set({
        address: data.address.trim(),
        city: data.city.trim(),
        type: data.type,
        price: data.price,
        rooms: (_c = data.rooms) !== null && _c !== void 0 ? _c : null,
        floor: (_d = data.floor) !== null && _d !== void 0 ? _d : null,
        sqMeters: (_e = data.sqMeters) !== null && _e !== void 0 ? _e : null,
        features: (_f = data.features) !== null && _f !== void 0 ? _f : [],
        description: (_h = (_g = data.description) === null || _g === void 0 ? void 0 : _g.trim()) !== null && _h !== void 0 ? _h : null,
        assignedAgentId: (_j = data.assignedAgentId) !== null && _j !== void 0 ? _j : null,
        agencyId: authData.agencyId, // injected server-side
        status: 'active', // injected server-side
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { success: true, propertyId: propertyRef.id };
});
//# sourceMappingURL=addProperty.js.map