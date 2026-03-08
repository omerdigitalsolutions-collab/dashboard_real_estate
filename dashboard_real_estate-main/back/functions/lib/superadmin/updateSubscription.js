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
exports.superAdminUpdateAgencyPlan = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-admin/firestore");
exports.superAdminUpdateAgencyPlan = functions.https.onCall({ cors: true }, async (request) => {
    // Auth: Must verify request.auth.token.superAdmin === true
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'You must be a Super Admin to perform this action.');
    }
    const { agencyId, newPlanId } = request.data;
    if (!agencyId || !newPlanId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters: agencyId and newPlanId.');
    }
    const validPlans = ['free', 'starter', 'pro', 'boutique', 'enterprise'];
    if (!validPlans.includes(newPlanId.toLowerCase())) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid plan ID provided.');
    }
    const db = (0, firestore_1.getFirestore)();
    const agencyRef = db.collection('agencies').doc(agencyId);
    try {
        await agencyRef.update({
            planId: newPlanId.toLowerCase(),
            subscriptionTier: newPlanId.toLowerCase() // Legacy support if needed somewhere else
        });
        return { success: true, message: `Agency plan updated to ${newPlanId}` };
    }
    catch (error) {
        console.error('[superAdminUpdateAgencyPlan] Error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to update agency plan.');
    }
});
//# sourceMappingURL=updateSubscription.js.map