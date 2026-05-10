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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProperty = void 0;
/**
 * updateProperty — Performs a partial update on a property document.
 *
 * Security:
 *  - Caller must be authenticated.
 *  - Caller must belong to the same agencyId as the property.
 *  - Fields `agencyId` and `createdAt` are forbidden from updates (stripped server-side).
 *
 * Input:
 *   {
 *     propertyId: string,
 *     updates: Partial<Property>   // Any subset of allowed fields
 *   }
 *
 * Output: { success: true }
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
// Fields that must never be changed by a client update
const IMMUTABLE_FIELDS = ['agencyId', 'createdAt', 'publicAt', 'id'];
exports.updateProperty = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { propertyId, updates, cityName } = request.data;
    if (!(propertyId === null || propertyId === void 0 ? void 0 : propertyId.trim()))
        throw new https_1.HttpsError('invalid-argument', 'propertyId is required.');
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'updates object must not be empty.');
    }
    const agencyId = authData.agencyId;
    // ── Load property and verify ownership ─────────────────────────────────────
    let propertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc(propertyId);
    let propertySnap = await propertyRef.get();
    let actualPropertyId = propertyId;
    const superAdminSnap = await db.doc(`superAdmins/${authData.uid}`).get();
    const isSuperAdmin = superAdminSnap.exists;
    if (!propertySnap.exists && cityName) {
        // Not in our agency subcollection — check if it's a global city property
        const globalRef = db.doc(`cities/${cityName}/properties/${propertyId}`);
        const globalSnap = await globalRef.get();
        if (globalSnap.exists) {
            if (isSuperAdmin) {
                propertyRef = globalRef;
                propertySnap = globalSnap;
            }
            else {
                // Import global property into agency subcollection
                console.log(`[updateProperty] Importing global property ${propertyId} for agency ${agencyId}`);
                const globalData = globalSnap.data();
                const newPropertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc();
                actualPropertyId = newPropertyRef.id;
                // Migrate global flat doc to new nested schema on import
                const { migratePropertyDoc } = await Promise.resolve().then(() => __importStar(require('../utils/propertyMigrator')));
                const migratedData = migratePropertyDoc(Object.assign(Object.assign({}, globalData), { agencyId }), globalSnap.id);
                const _b = migratedData, { id: _id } = _b, storedData = __rest(_b, ["id"]);
                await newPropertyRef.set(Object.assign(Object.assign({}, storedData), { agencyId, isGlobalCityProperty: false, importedFromGlobal: true, originalGlobalId: propertyId, createdAt: (_a = globalData.createdAt) !== null && _a !== void 0 ? _a : firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp(), status: 'active' }));
                propertyRef = newPropertyRef;
                propertySnap = await propertyRef.get();
            }
        }
    }
    if (!propertySnap.exists) {
        throw new https_1.HttpsError('not-found', `Property ${propertyId} not found.`);
    }
    const propertyData = propertySnap.data();
    // Permission check: own agency OR super admin
    if (!isSuperAdmin && propertyData.agencyId && propertyData.agencyId !== agencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not have access to this property.');
    }
    // ── Block exclusivity on WhatsApp-sourced properties ───────────────────────
    const isWhatsappSource = propertyData.source === 'whatsapp_group' || propertyData.listingType === 'external';
    if (isWhatsappSource && updates.isExclusive === true) {
        throw new https_1.HttpsError('invalid-argument', 'Cannot mark an external/WhatsApp property as exclusive.');
    }
    // ── Strip immutable fields from updates ─────────────────────────────────────
    const safeUpdates = Object.assign({}, updates);
    for (const field of IMMUTABLE_FIELDS) {
        delete safeUpdates[field];
    }
    const isBecomingPublic = updates.visibility === 'public' && propertyData.visibility !== 'public';
    await propertyRef.update(Object.assign(Object.assign(Object.assign({}, safeUpdates), { updatedAt: firestore_1.FieldValue.serverTimestamp() }), (isBecomingPublic ? { publicAt: firestore_1.FieldValue.serverTimestamp() } : {})));
    return { success: true, propertyId: actualPropertyId };
});
//# sourceMappingURL=updateProperty.js.map