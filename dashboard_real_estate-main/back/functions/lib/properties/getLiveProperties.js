"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiveProperties = void 0;
/**
 * getLiveProperties — Returns a paginated snapshot of properties for an agency.
 *
 * Note: This is implemented as an onCall function for server-side use cases
 * (e.g., admin tooling, webhooks). The primary real-time client listener should
 * use the Firestore SDK directly on the frontend with the query:
 *
 *   query(
 *     collection(db, 'properties'),
 *     where('agencyId', '==', agencyId),
 *     orderBy('createdAt', 'desc')
 *   )
 *
 * ⚠️  COMPOSITE INDEX REQUIRED:
 *   Collection: properties
 *   Fields: agencyId ASC, createdAt DESC
 *   Create at: https://console.firebase.google.com/project/_/firestore/indexes
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
/**
 * Input:  { agencyId: string }
 * Output: { properties: Property[] }
 */
exports.getLiveProperties = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { agencyId } = request.data;
    if (!(agencyId === null || agencyId === void 0 ? void 0 : agencyId.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'agencyId is required.');
    }
    // Verify caller belongs to this agency
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || ((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.agencyId) !== agencyId) {
        throw new https_1.HttpsError('permission-denied', 'Access denied to this agency.');
    }
    const snapshot = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .orderBy('createdAt', 'desc')
        .get();
    const properties = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
    return { properties };
});
//# sourceMappingURL=getLiveProperties.js.map