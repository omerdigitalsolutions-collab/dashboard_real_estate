"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDeal = exports.updateDeal = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
exports.updateDeal = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { dealId, updates } = request.data;
    if (!dealId) {
        throw new https_1.HttpsError('invalid-argument', 'dealId is required.');
    }
    if (!updates || typeof updates !== 'object') {
        throw new https_1.HttpsError('invalid-argument', 'updates object is required.');
    }
    const docRef = db.collection('deals').doc(dealId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Deal not found.');
    }
    const dealData = docSnap.data();
    if ((dealData === null || dealData === void 0 ? void 0 : dealData.agencyId) !== authData.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not have access to this deal.');
    }
    // Strip protected fields
    const safeUpdates = Object.assign({}, updates);
    delete safeUpdates.id;
    delete safeUpdates.agencyId;
    delete safeUpdates.createdAt;
    try {
        await docRef.update(Object.assign(Object.assign({}, safeUpdates), { updatedAt: firestore_1.FieldValue.serverTimestamp() }));
        return { success: true };
    }
    catch (error) {
        console.error('[updateDeal] Error:', error);
        throw new https_1.HttpsError('internal', error.message || 'Failed to update deal.');
    }
});
exports.deleteDeal = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { dealId } = request.data;
    if (!dealId) {
        throw new https_1.HttpsError('invalid-argument', 'dealId is required.');
    }
    const docRef = db.collection('deals').doc(dealId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Deal not found.');
    }
    const dealData = docSnap.data();
    if ((dealData === null || dealData === void 0 ? void 0 : dealData.agencyId) !== authData.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not have access to this deal.');
    }
    try {
        await docRef.delete();
        return { success: true };
    }
    catch (error) {
        console.error('[deleteDeal] Error:', error);
        throw new https_1.HttpsError('internal', error.message || 'Failed to delete deal.');
    }
});
//# sourceMappingURL=updateDeal.js.map