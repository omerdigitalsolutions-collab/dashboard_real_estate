"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCatalog = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
exports.generateCatalog = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d;
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
    // ── Fetch Agency branding ────────────────────────────────────────────────────
    const agencyDoc = await db.doc(`agencies/${agencyId}`).get();
    const agencyData = (_b = agencyDoc.data()) !== null && _b !== void 0 ? _b : {};
    const agencyName = agencyData.agencyName || agencyData.name || '';
    const agencyLogoUrl = ((_c = agencyData.settings) === null || _c === void 0 ? void 0 : _c.logoUrl) || '';
    const agencyPhone = agencyData.officePhone || ((_d = agencyData.whatsappIntegration) === null || _d === void 0 ? void 0 : _d.phoneNumber) || '';
    const catalogRef = db.collection('shared_catalogs').doc();
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() + 365); // 1 year from now
    await catalogRef.set({
        agencyId,
        agencyName,
        agencyLogoUrl,
        agencyPhone,
        agentId: request.auth.uid,
        leadId,
        leadName: leadName || '',
        propertyIds: propertyIds, // Storing only the references for live fetching
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