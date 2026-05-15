"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimProperty = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
exports.claimProperty = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b;
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { propertyId } = request.data;
    if (!(propertyId === null || propertyId === void 0 ? void 0 : propertyId.trim()))
        throw new https_1.HttpsError('invalid-argument', 'propertyId is required.');
    const agencyId = authData.agencyId;
    const propertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc(propertyId);
    // Fetch agent name outside transaction
    const userSnap = await db.collection('users').doc(authData.uid).get();
    const agentName = (_b = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '';
    // Use transaction to ensure atomicity: check + claim together
    await db.runTransaction(async (transaction) => {
        var _a;
        const propertySnap = await transaction.get(propertyRef);
        if (!propertySnap.exists)
            throw new https_1.HttpsError('not-found', 'Property not found.');
        const data = propertySnap.data();
        if (data.agencyId !== agencyId)
            throw new https_1.HttpsError('permission-denied', 'Access denied.');
        if ((_a = data.management) === null || _a === void 0 ? void 0 : _a.assignedAgentId)
            throw new https_1.HttpsError('already-exists', 'Property already claimed.');
        transaction.update(propertyRef, {
            'management.assignedAgentId': authData.uid,
            'management.assignedAgentName': agentName,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { success: true };
});
//# sourceMappingURL=claimProperty.js.map