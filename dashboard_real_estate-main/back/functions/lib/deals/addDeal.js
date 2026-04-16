"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDeal = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
exports.addDeal = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { propertyId, buyerId, sellerId, agentId, stage, projectedCommission, isVatIncluded, createdBy } = request.data;
    if (!propertyId) {
        throw new https_1.HttpsError('invalid-argument', 'propertyId is required.');
    }
    try {
        const dealData = {
            agencyId: authData.agencyId,
            propertyId,
            buyerId: buyerId || null,
            sellerId: sellerId || null,
            agentId: agentId || null,
            stage,
            projectedCommission: Number(projectedCommission) || 0,
            isVatIncluded: !!isVatIncluded,
            createdBy: createdBy || authData.uid,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        const docRef = await db.collection('deals').add(dealData);
        return { success: true, id: docRef.id };
    }
    catch (error) {
        console.error('[addDeal] Error:', error);
        throw new https_1.HttpsError('internal', error.message || 'Failed to create deal.');
    }
});
//# sourceMappingURL=addDeal.js.map