"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiveProperties = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
/**
 * getLiveProperties — Securely fetches live property documents for a shared catalog, stripping agent info.
 *
 * Invoked by unauthenticated clients viewing a shared catalog.
 * Validates the requested property IDs against the actual catalog document.
 */
exports.getLiveProperties = (0, https_1.onCall)({ cors: true }, async (request) => {
    const { catalogId, propertyIds } = request.data;
    if (!catalogId)
        throw new https_1.HttpsError('invalid-argument', 'catalogId is required.');
    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        return { success: true, properties: [] };
    }
    // 1. Verify the catalog exists and is not expired
    const catalogDoc = await db.collection('shared_catalogs').doc(catalogId).get();
    if (!catalogDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Catalog not found.');
    }
    const catalogData = catalogDoc.data();
    if (catalogData.expiresAt && catalogData.expiresAt.toDate() < new Date()) {
        throw new https_1.HttpsError('permission-denied', 'Catalog has expired.');
    }
    // 2. Security Check: Only allow fetching properties that are actually in this catalog
    // We Map IDs to their collection paths as stored in the catalog document
    const allowedMap = new Map();
    (catalogData.propertyIds || []).forEach((p) => {
        if (typeof p === 'string') {
            allowedMap.set(p, 'properties');
        }
        else if (p && p.id) {
            allowedMap.set(p.id, p.collectionPath || 'properties');
        }
    });
    const requestedItems = propertyIds.filter(p => {
        const id = typeof p === 'string' ? p : p === null || p === void 0 ? void 0 : p.id;
        return id && allowedMap.has(id);
    }).map(p => {
        const id = typeof p === 'string' ? p : p.id;
        return { id, collectionPath: allowedMap.get(id) };
    });
    if (requestedItems.length === 0) {
        return { success: true, properties: [] };
    }
    // 3. Fetch properties grouped by collection path
    const grouped = requestedItems.reduce((acc, item) => {
        if (!acc[item.collectionPath])
            acc[item.collectionPath] = [];
        acc[item.collectionPath].push(item.id);
        return acc;
    }, {});
    const liveProperties = [];
    for (const [path, ids] of Object.entries(grouped)) {
        // Fetch in chunks of 10 for the 'in' query limitation
        for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10);
            const snap = await db.collection(path).where('__name__', 'in', chunk).get();
            for (const doc of snap.docs) {
                const data = doc.data();
                const images = data.imageUrls || data.images;
                const finalImages = (images && images.length > 0) ? images : [PLACEHOLDER_IMAGE];
                liveProperties.push(Object.assign(Object.assign({}, data), { id: doc.id, address: data.street || data.address || 'כתובת חסויה', city: data.city || '', price: data.price || 0, rooms: data.rooms || null, sqm: data.sqm || null, floor: data.floor || null, images: finalImages, type: data.type || 'sale', kind: data.kind || null, listingType: data.listingType || null, description: data.description || null, createdAt: data.createdAt || null, agentName: data.listingType === 'exclusive' ? (data.agentName || '') : '', 
                    // Keep agent phone only for exclusive listings so the contact button can reach the right agent
                    agentPhone: data.listingType === 'exclusive' ? (data.agentPhone || '') : '' }));
            }
        }
    }
    return {
        success: true,
        properties: liveProperties
    };
});
//# sourceMappingURL=getLiveProperties.js.map