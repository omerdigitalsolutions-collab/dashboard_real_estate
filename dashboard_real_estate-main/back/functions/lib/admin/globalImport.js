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
exports.superAdminGetImportMappingV2 = exports.superAdminImportGlobalPropertiesV2 = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
/**
 * Callable function for Super Admins to bulk-import properties into global cities collection.
 */
exports.superAdminImportGlobalPropertiesV2 = functions.https.onCall({
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 300,
    cors: true,
    invoker: 'public',
}, async (request) => {
    // 1. Auth Guard
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    // 2. Super Admin Check
    if (request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }
    const { properties } = request.data;
    if (!Array.isArray(properties)) {
        throw new functions.https.HttpsError('invalid-argument', 'The "properties" field must be an array.');
    }
    const db = admin.firestore();
    let totalInserted = 0;
    try {
        // Chunk sizes for batch (Firestore limit is 500)
        const batchSize = 400;
        for (let i = 0; i < properties.length; i += batchSize) {
            const chunk = properties.slice(i, i + batchSize);
            const batch = db.batch();
            chunk.forEach((prop) => {
                // City Normalization
                const rawCity = (prop.city || 'unknown').toString().trim();
                const normalizedCity = rawCity || 'unknown';
                // street normalization for ID
                const street = (prop.street || '').toString().trim();
                const price = prop.price || 0;
                // Deduplication ID: Hash of city + street + price
                const hashInput = `${normalizedCity.toLowerCase()}_${street.toLowerCase()}_${price}`;
                const docId = crypto.createHash('sha256').update(hashInput).digest('hex');
                const propRef = db.collection('cities').doc(normalizedCity).collection('properties').doc(docId);
                batch.set(propRef, Object.assign(Object.assign({}, prop), { city: normalizedCity, street: street, source: "super_admin_excel", isPublic: true, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            });
            await batch.commit();
            totalInserted += chunk.length;
        }
        return {
            success: true,
            insertedCount: totalInserted
        };
    }
    catch (error) {
        console.error('[superAdminImportGlobalProperties] Error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Error occurred during bulk import.');
    }
});
exports.superAdminGetImportMappingV2 = functions.https.onCall({
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
}, async (request) => {
    // 1. Auth Guard
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    // 2. Super Admin Check
    if (request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }
    const { headers } = request.data;
    const mapping = {};
    // Dictionary definition: DB key -> array of typical Hebrew/English column headers
    const rules = {
        city: [/עיר/i, /יישוב/i, /ישוב/i, /city/i],
        street: [/רחוב/i, /כתובת/i, /שכונה/i, /street/i, /address/i],
        price: [/מחיר/i, /עלות/i, /price/i],
        rooms: [/חדרים/i, /מספר חדרים/i, /rooms/i],
        sqm: [/מ״ר/i, /מ"ר/i, /שטח/i, /גודל/i, /sqm/i, /size/i],
        floor: [/קומה/i, /קומות/i, /floor/i],
        type: [/סוג/i, /עסקה/i, /type/i], // sale or rent
        kind: [/סוג נכס/i, /סוג מודעה/i, /kind/i, /property type/i],
        description: [/תיאור/i, /מידע/i, /פרטים/i, /description/i],
        listingType: [/בלעדיות/i, /בלעדי/i, /שיווק/i, /listing/i],
        agentName: [/סוכן/i, /איש קשר/i, /מתווך/i, /agent/i],
        notes: [/הערות/i, /הערה פנימית/i, /notes/i]
    };
    headers.forEach((header) => {
        const cleanHeader = header.trim();
        for (const [dbKey, patterns] of Object.entries(rules)) {
            if (patterns.some(p => p.test(cleanHeader))) {
                mapping[header] = dbKey;
                break; // Map to the first matched DB field
            }
        }
    });
    return { success: true, mapping };
});
//# sourceMappingURL=globalImport.js.map