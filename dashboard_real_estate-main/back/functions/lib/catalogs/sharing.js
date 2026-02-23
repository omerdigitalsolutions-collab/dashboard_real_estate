"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCatalog = void 0;
/**
 * generateCatalog — Generates a secure, snapshot-based digital property catalog.
 *
 * Requirements:
 * 1. Verify authentication and agency membership.
 * 2. Fetch property data. Inject placeholder if no images.
 * 3. Store essential fields directly in the catalog document (Snapshotting).
 * 4. Set expiresAt to exactly 7 days from now.
 * 5. Return the catalogId and the public URL.
 *
 * Input:
 *   {
 *     agencyId: string,
 *     leadId: string,
 *     propertyIds: string[]
 *   }
 *
 * Output: { success: true, catalogId: string, url: string }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
// Using a high-quality professional placeholder
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
exports.generateCatalog = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { agencyId, leadId, leadName, propertyIds } = request.data;
    if (!(agencyId === null || agencyId === void 0 ? void 0 : agencyId.trim()))
        throw new https_1.HttpsError('invalid-argument', 'agencyId is required.');
    if (!(leadId === null || leadId === void 0 ? void 0 : leadId.trim()))
        throw new https_1.HttpsError('invalid-argument', 'leadId is required.');
    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'propertyIds must be a non-empty array.');
    }
    // ── Agency membership check ─────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || ((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.agencyId) !== agencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not belong to this agency.');
    }
    // ── Fetch Properties and Snapshot ───────────────────────────────────────────
    const snapshottedProperties = [];
    // We fetch properties one by one or in batches. Since propertyIds length is usually small (<10),
    // Promise.all with individual gets is fine, but let's use getAll if possible, or where 'in'.
    // Firestore 'in' query supports max 10, so let's chunk it.
    const chunks = [];
    for (let i = 0; i < propertyIds.length; i += 10) {
        chunks.push(propertyIds.slice(i, i + 10));
    }
    for (const chunk of chunks) {
        const snap = await db.collection('properties')
            .where('agencyId', '==', agencyId)
            .where('__name__', 'in', chunk)
            .get();
        for (const doc of snap.docs) {
            const data = doc.data();
            // Fallback Logic: Check images array
            const images = data.images;
            const finalImages = (images && images.length > 0) ? images : [PLACEHOLDER_IMAGE];
            snapshottedProperties.push({
                id: doc.id,
                address: data.address || 'כתובת חסויה',
                city: data.city || '',
                price: data.price || 0,
                rooms: data.rooms || null,
                images: finalImages,
                type: data.type || 'sale',
            });
        }
    }
    if (snapshottedProperties.length === 0) {
        throw new https_1.HttpsError('not-found', 'Could not find the specified properties for this agency.');
    }
    // ── Create Catalog Document ─────────────────────────────────────────────────
    const catalogRef = db.collection('shared_catalogs').doc();
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() + 7); // Exactly 7 days from now
    await catalogRef.set({
        agencyId,
        agentId: request.auth.uid,
        leadId,
        leadName: leadName || '',
        properties: snapshottedProperties,
        viewCount: 0,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        expiresAt: expiresAt,
    });
    // In a real env, the origin URL might be passed from the client or configured in process.env
    // Here we return a generic path that the client will affix to window.location.origin
    const url = `/catalog/${catalogRef.id}`;
    return {
        success: true,
        catalogId: catalogRef.id,
        url
    };
});
//# sourceMappingURL=sharing.js.map