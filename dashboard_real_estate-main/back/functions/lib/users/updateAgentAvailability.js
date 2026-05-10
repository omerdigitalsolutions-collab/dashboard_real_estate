"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAgentAvailability = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
/**
 * updateAgentAvailability — Toggles whether an agent receives automatically
 * distributed leads and properties.
 *
 * Security:
 *   - An agent can toggle their own availability.
 *   - An admin can toggle any agent in the same agency.
 *   - Cannot set isAvailable=true if the target agent is inactive (isActive=false).
 *
 * Input:  { targetUserId?: string, isAvailable: boolean }
 *         targetUserId defaults to the caller's own UID when omitted.
 * Output: { success: true }
 */
exports.updateAgentAvailability = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { targetUserId, isAvailable } = request.data;
    if (typeof isAvailable !== 'boolean') {
        throw new https_1.HttpsError('invalid-argument', 'isAvailable must be a boolean.');
    }
    const resolvedId = (targetUserId === null || targetUserId === void 0 ? void 0 : targetUserId.trim()) || authData.uid;
    // Non-admins can only update themselves
    if (resolvedId !== authData.uid && authData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can change another agent\'s availability.');
    }
    // Fetch target user doc
    const targetDoc = await db.doc(`users/${resolvedId}`).get();
    if (!targetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'User not found.');
    }
    const target = targetDoc.data();
    // Agency check for admin targeting another user
    if (resolvedId !== authData.uid && target.agencyId !== authData.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'Cannot modify users in a different agency.');
    }
    // Cannot mark an inactive user as available
    if (isAvailable && target.isActive === false) {
        throw new https_1.HttpsError('failed-precondition', 'Cannot set availability for a suspended agent.');
    }
    await db.doc(`users/${resolvedId}`).update({ isAvailableForLeads: isAvailable });
    return { success: true };
});
//# sourceMappingURL=updateAgentAvailability.js.map