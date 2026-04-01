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
exports.superAdminListAuthUsers = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
/**
 * superAdminListAuthUsers
 *
 * Fetches ALL users from Firebase Authentication using a pagination loop.
 * Strictly restricted to users with the 'superadmin' role in their custom claims.
 */
exports.superAdminListAuthUsers = functions.https.onCall({ cors: true }, async (request) => {
    var _a;
    // 1. Role verification
    if (((_a = request.auth) === null || _a === void 0 ? void 0 : _a.token.role) !== 'superadmin') {
        throw new functions.https.HttpsError('permission-denied', 'Unauthorized service access');
    }
    try {
        const auth = admin.auth();
        const users = [];
        let nextPageToken = undefined;
        // Fetch all users using a pagination loop
        do {
            const listUsersResult = await auth.listUsers(1000, nextPageToken);
            const batch = listUsersResult.users.map((userRecord) => ({
                uid: userRecord.uid,
                email: userRecord.email || '',
                displayName: userRecord.displayName || '',
                createdAt: userRecord.metadata.creationTime || new Date().toISOString(),
                disabled: userRecord.disabled || false,
            }));
            users.push(...batch);
            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);
        console.log(`[superAdminListAuthUsers] Successfully fetched ${users.length} users.`);
        return { success: true, users };
    }
    catch (error) {
        console.error('[superAdminListAuthUsers] Error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch users from Firebase Auth.');
    }
});
//# sourceMappingURL=admin.js.map