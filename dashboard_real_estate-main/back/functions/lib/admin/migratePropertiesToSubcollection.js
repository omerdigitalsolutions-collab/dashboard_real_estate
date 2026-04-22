"use strict";
/**
 * ONE-TIME migration: copies all documents from the root `properties` collection
 * into `agencies/{agencyId}/properties/{id}` subcollections, applying the new
 * nested schema via migratePropertyDoc().
 *
 * Safe to re-run — uses { merge: false } to overwrite, so results are idempotent.
 * Does NOT delete the old collection (leave in place for 2 weeks as fallback).
 *
 * Invoke via: firebase functions:shell or a superadmin HTTP trigger.
 */
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
exports.migratePropertiesToSubcollection = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const propertyMigrator_1 = require("../utils/propertyMigrator");
const db = admin.firestore();
const BATCH_SIZE = 400;
exports.migratePropertiesToSubcollection = (0, https_1.onCall)({ region: 'europe-west1' }, async (request) => {
    var _a, _b;
    // Restrict to super-admins only
    const token = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token;
    if (!token || token.role !== 'super_admin') {
        throw new Error('Only super-admins can run migration');
    }
    const agencyId = (_b = request.data) === null || _b === void 0 ? void 0 : _b.agencyId;
    let baseQuery = db.collection('properties');
    if (agencyId) {
        baseQuery = baseQuery.where('agencyId', '==', agencyId);
    }
    const snap = await baseQuery.get();
    if (snap.empty) {
        return { migrated: 0, message: 'No documents to migrate.' };
    }
    let migrated = 0;
    let batch = db.batch();
    let batchCount = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        const aid = data.agencyId;
        if (!aid) {
            console.warn(`Skipping ${doc.id} — missing agencyId`);
            continue;
        }
        const newData = (0, propertyMigrator_1.migratePropertyDoc)(data, doc.id);
        // Remove id from stored doc (it's the document ID)
        const _c = newData, { id: _id } = _c, storedData = __rest(_c, ["id"]);
        const newRef = db
            .collection('agencies')
            .doc(aid)
            .collection('properties')
            .doc(doc.id);
        batch.set(newRef, storedData);
        batchCount++;
        migrated++;
        if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
        }
    }
    if (batchCount > 0) {
        await batch.commit();
    }
    console.log(`Migration complete: ${migrated} properties moved.`);
    return { migrated, message: `Migrated ${migrated} properties to subcollections.` };
});
//# sourceMappingURL=migratePropertiesToSubcollection.js.map