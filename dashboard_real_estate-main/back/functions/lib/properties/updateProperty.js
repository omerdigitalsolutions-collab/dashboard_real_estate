"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProperty = void 0;
/**
 * updateProperty — Performs a partial update on a property document.
 *
 * Security:
 *  - Caller must be authenticated.
 *  - Caller must belong to the same agencyId as the property.
 *  - Fields `agencyId` and `createdAt` are forbidden from updates (stripped server-side).
 *
 * Input:
 *   {
 *     propertyId: string,
 *     updates: Partial<Property>   // Any subset of allowed fields
 *   }
 *
 * Output: { success: true }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
// Fields that must never be changed by a client update
const IMMUTABLE_FIELDS = ['agencyId', 'createdAt', 'id'];
exports.updateProperty = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { propertyId, updates } = request.data;
    if (!(propertyId === null || propertyId === void 0 ? void 0 : propertyId.trim()))
        throw new https_1.HttpsError('invalid-argument', 'propertyId is required.');
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'updates object must not be empty.');
    }
    // ── Load property and verify ownership ─────────────────────────────────────
    const propertyRef = db.doc(`properties/${propertyId}`);
    const propertySnap = await propertyRef.get();
    if (!propertySnap.exists) {
        throw new https_1.HttpsError('not-found', `Property ${propertyId} not found.`);
    }
    const propertyData = propertySnap.data();
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || ((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.agencyId) !== propertyData.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not have access to this property.');
    }
    // ── Strip immutable fields from updates ─────────────────────────────────────
    const safeUpdates = Object.assign({}, updates);
    for (const field of IMMUTABLE_FIELDS) {
        delete safeUpdates[field];
    }
    await propertyRef.update(safeUpdates);
    return { success: true };
});
//# sourceMappingURL=updateProperty.js.map