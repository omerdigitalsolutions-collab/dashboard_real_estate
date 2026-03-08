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
exports.superAdminUpdateExpenses = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-admin/firestore");
exports.superAdminUpdateExpenses = functions.https.onCall({ cors: true }, async (request) => {
    // Auth: Must verify request.auth.token.superAdmin === true
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }
    const { type, action, data } = request.data;
    // Payload: { type: 'fixed' | 'variable' | 'marketing', action: 'add' | 'remove', data: any }
    if (!['fixed', 'variable', 'marketing'].includes(type) || !['add', 'remove'].includes(action) || !data) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid parameters.');
    }
    const db = (0, firestore_1.getFirestore)();
    const docRef = db.collection('admin_settings').doc('finances');
    let updateField = '';
    if (type === 'fixed')
        updateField = 'fixedSubscriptions';
    else if (type === 'variable')
        updateField = 'variableCosts';
    else if (type === 'marketing')
        updateField = 'marketingCosts';
    const updateAction = action === 'add' ? firestore_1.FieldValue.arrayUnion(data) : firestore_1.FieldValue.arrayRemove(data);
    try {
        await docRef.set({
            [updateField]: updateAction
        }, { merge: true });
        return { success: true };
    }
    catch (error) {
        console.error('[superAdminUpdateExpenses] Error:', error);
        throw new functions.https.HttpsError('internal', 'Internal server error updating expenses.');
    }
});
//# sourceMappingURL=finances.js.map