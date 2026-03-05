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
exports.superAdminGetAgencyUsage = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
/**
 * getAgencyUsageStats
 *
 * Returns Firebase Storage usage (bytes / MB) and Firestore document counts
 * for a specific agency. Restricted to Super Admin callers.
 */
exports.superAdminGetAgencyUsage = functions.https.onCall(async (request) => {
    // ── Auth Guard ────────────────────────────────────────────────────────────
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }
    const { targetAgencyId } = request.data;
    if (!targetAgencyId) {
        throw new functions.https.HttpsError('invalid-argument', 'targetAgencyId is required.');
    }
    const db = (0, firestore_1.getFirestore)();
    const bucket = (0, storage_1.getStorage)().bucket();
    try {
        // ── Task A: Storage Calculation ───────────────────────────────────────
        const [files] = await bucket.getFiles({ prefix: `agencies/${targetAgencyId}/` });
        const storageBytes = files.reduce((sum, file) => {
            var _a, _b;
            const size = parseInt(String((_b = (_a = file.metadata) === null || _a === void 0 ? void 0 : _a.size) !== null && _b !== void 0 ? _b : '0'), 10);
            return sum + (isNaN(size) ? 0 : size);
        }, 0);
        const storageMB = parseFloat((storageBytes / (1024 * 1024)).toFixed(2));
        // ── Task B: Firestore Document Counts ─────────────────────────────────
        const [propertiesSnap, leadsSnap, dealsSnap, usersSnap] = await Promise.all([
            db.collection('properties').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('leads').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('deals').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('users').where('agencyId', '==', targetAgencyId).count().get(),
        ]);
        const totalProperties = propertiesSnap.data().count;
        const totalLeads = leadsSnap.data().count;
        const totalDeals = dealsSnap.data().count;
        const totalUsers = usersSnap.data().count;
        return {
            success: true,
            data: {
                storageBytes,
                storageMB,
                totalProperties,
                totalLeads,
                totalDeals,
                totalUsers,
            },
        };
    }
    catch (error) {
        console.error('[superAdminGetAgencyUsage] Error:', error);
        throw new functions.https.HttpsError('internal', 'Error fetching agency usage stats.');
    }
});
//# sourceMappingURL=usage.js.map