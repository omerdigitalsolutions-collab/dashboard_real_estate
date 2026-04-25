"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCatalog = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
exports.generateCatalog = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { agencyId, leadId, leadName, propertyIds, title, leadRequirements: providedRequirements } = request.data;
    if (!(agencyId === null || agencyId === void 0 ? void 0 : agencyId.trim()))
        throw new https_1.HttpsError('invalid-argument', 'agencyId is required.');
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
    const agencyLogoUrl = ((_c = agencyData.settings) === null || _c === void 0 ? void 0 : _c.logoUrl) || agencyData.logoUrl || '';
    const callerPhone = ((_d = callerDoc.data()) === null || _d === void 0 ? void 0 : _d.phone) || '';
    const agencyPhone = agencyData.officePhone ||
        ((_e = agencyData.billing) === null || _e === void 0 ? void 0 : _e.ownerPhone) ||
        ((_f = agencyData.whatsappIntegration) === null || _f === void 0 ? void 0 : _f.phoneNumber) ||
        agencyData.phone ||
        callerPhone || '';
    // ── Fetch Lead requirements ──────────────────────────────────────────────────
    let leadRequirements = providedRequirements || null;
    if (!leadRequirements && leadId) {
        try {
            const leadDoc = await db.doc(`leads/${leadId}`).get();
            if (leadDoc.exists) {
                leadRequirements = ((_g = leadDoc.data()) === null || _g === void 0 ? void 0 : _g.requirements) || null;
            }
        }
        catch ( /* non-critical */_h) { /* non-critical */ }
    }
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
        leadId: leadId || null,
        leadName: leadName || '',
        title: title || '',
        propertyIds: propertyIds, // Storing only the references for live fetching
        leadRequirements: leadRequirements || null,
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