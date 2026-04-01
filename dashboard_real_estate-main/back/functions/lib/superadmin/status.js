"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.superAdminSetUserStatus = exports.superAdminSetAgencyStatus = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-admin/firestore");
/**
 * superAdminSetAgencyStatus
 *
 * Toggles an agency's status between 'active' and 'suspended'.
 * If suspended, all users in that agency are also deactivated.
 */
exports.superAdminSetAgencyStatus = functions.https.onCall({ cors: true }, async (request) => {
    // 1. Security: Strict Super Admin check
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'You must be a Super Admin to perform this action.');
    }
    const { agencyId, status } = request.data;
    if (!agencyId || !status) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters: agencyId and status.');
    }
    const db = (0, firestore_1.getFirestore)();
    const agencyRef = db.collection('agencies').doc(agencyId);
    try {
        const batch = db.batch();
        // Update Agency status
        batch.update(agencyRef, { status: status });
        // 2. Cascading Logic: If suspended, deactivate all users in this agency
        if (status === 'suspended') {
            const usersSnap = await db.collection('users').where('agencyId', '==', agencyId).get();
            usersSnap.forEach((userDoc) => {
                batch.update(userDoc.ref, { isActive: false });
            });
        }
        else if (status === 'active') {
            // Optional: Reactivate all users? Usually, it's safer to let admin decide,
            // but if the whole agency is back, maybe we should reactivate them.
            // For now, let's just reactivate them so they can work again.
            const usersSnap = await db.collection('users').where('agencyId', '==', agencyId).get();
            usersSnap.forEach((userDoc) => {
                batch.update(userDoc.ref, { isActive: true });
            });
        }
        await batch.commit();
        return {
            success: true,
            message: `Agency ${agencyId} status updated to ${status}.${status === 'suspended' ? ' All users deactivated.' : ' All users reactivated.'}`
        };
    }
    catch (error) {
        console.error('[superAdminSetAgencyStatus] Error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to update agency status.');
    }
});
/**
 * superAdminSetUserStatus
 *
 * Toggles an individual user's isActive status.
 */
exports.superAdminSetUserStatus = functions.https.onCall({ cors: true }, async (request) => {
    // 1. Security: Strict Super Admin check
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'You must be a Super Admin to perform this action.');
    }
    const { userId, isActive } = request.data;
    if (!userId || typeof isActive !== 'boolean') {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters: userId and isActive.');
    }
    const db = (0, firestore_1.getFirestore)();
    const userRef = db.collection('users').doc(userId);
    try {
        await userRef.update({ isActive: isActive });
        return {
            success: true,
            message: `User ${userId} status set to ${isActive ? 'active' : 'inactive'}.`
        };
    }
    catch (error) {
        console.error('[superAdminSetUserStatus] Error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to update user status.');
    }
});
//# sourceMappingURL=status.js.map