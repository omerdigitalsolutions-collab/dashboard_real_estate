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
exports.superAdminConsolidateCityV2 = exports.superAdminPurgeOldGlobalPropertiesV2 = exports.superAdminGetImportMappingV2 = exports.superAdminImportGlobalPropertiesV2 = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const cityUtils_1 = require("../utils/cityUtils");
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
            chunk.forEach((rawPropInput) => {
                const prop = Object.assign({}, rawPropInput);
                // Normalize boolean string fields ("true"/"false" → boolean)
                for (const f of ['hasBalcony', 'hasElevator', 'hasParking', 'hasSafeRoom', 'hasAgent']) {
                    if (typeof prop[f] === 'string') {
                        prop[f] = prop[f].toLowerCase() === 'true';
                    }
                }
                // Normalize dealType: "buy" → "sale"
                if (prop.type === 'buy')
                    prop.type = 'sale';
                else if (prop.type === 'rent')
                    prop.type = 'rent';
                // City: prefer English `city`, fall back to `cityHebrew`
                const rawCity = (prop.city || prop.cityHebrew || 'unknown').toString();
                const normalizedCity = (0, cityUtils_1.normalizeCityName)(rawCity);
                // Remap listingDescription → description
                if (!prop.description && prop.listingDescription) {
                    prop.description = prop.listingDescription;
                }
                // Remap hasSecureRoom → hasSafeRoom
                if (prop.hasSecureRoom !== undefined && prop.hasSafeRoom === undefined) {
                    prop.hasSafeRoom = prop.hasSecureRoom;
                }
                // Normalize parkingSpots to number
                if (prop.parkingSpots !== undefined) {
                    prop.parkingSpots = Number(prop.parkingSpots) || 0;
                }
                // street normalization for ID
                const street = (prop.street || prop.address || prop.streetName || '').toString().trim();
                const price = prop.price || 0;
                // Deduplication ID: Hash of city + street + price
                const hashInput = `${normalizedCity.toLowerCase()}_${street.toLowerCase()}_${price}`;
                const docId = crypto.createHash('sha256').update(hashInput).digest('hex');
                // Ensure city document exists (prevents phantom document issue)
                const cityRef = db.collection('cities').doc(normalizedCity);
                batch.set(cityRef, {
                    name: normalizedCity,
                    exists: true,
                    lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                const propRef = cityRef.collection('properties').doc(docId);
                // Normalize images (support imageUrls array or single imageUrl)
                let images = [];
                if (Array.isArray(prop.imageUrls)) {
                    images = prop.imageUrls.map(String).filter(Boolean);
                }
                else if (typeof prop.imageUrl === 'string' && prop.imageUrl.trim()) {
                    images = [prop.imageUrl.trim()];
                }
                // Strip agentName "| true" bug
                const rawAgentName = prop.agentName || '';
                const agentName = rawAgentName.replace(/\|\s*true\s*$/i, '').trim() || null;
                // Resolve transaction type
                const transactionType = prop.type === 'rent' ? 'rent' : 'forsale';
                const listingUrl = prop.listingUrl || prop.yad2Link || '';
                batch.set(propRef, Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ 
                    // Flat fields kept for backward-compat queries
                    city: normalizedCity, street: street, price: price, isPublic: true, source: "super_admin_excel", 
                    // New nested schema
                    transactionType, propertyType: prop.kind || prop.propertyType || '', rooms: prop.rooms != null ? Number(prop.rooms) || null : null, floor: prop.floor != null ? Number(prop.floor) || null : null, squareMeters: prop.sqm != null ? Number(prop.sqm) || null : null, address: Object.assign({ fullAddress: street ? `${street}, ${normalizedCity}` : normalizedCity, city: normalizedCity, street: street }, (prop.neighborhood ? { neighborhood: String(prop.neighborhood) } : {})), features: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (prop.hasElevator != null ? { hasElevator: Boolean(prop.hasElevator) } : {})), (prop.hasParking != null ? { hasParking: Boolean(prop.hasParking) } : {})), (prop.parkingSpots != null ? { parkingSpots: Number(prop.parkingSpots) || 0 } : {})), (prop.hasBalcony != null ? { hasBalcony: Boolean(prop.hasBalcony) } : {})), (prop.hasSafeRoom != null ? { hasMamad: Boolean(prop.hasSafeRoom) } : {})), financials: {
                        price,
                    }, media: {
                        images,
                    }, management: Object.assign(Object.assign({}, (prop.description ? { descriptions: String(prop.description).trim() } : {})), (agentName ? { agentName } : {})) }, (agentName ? { agentName } : {})), (prop.contactPhone ? { contactPhone: String(prop.contactPhone) } : {})), (prop.contactName ? { contactName: String(prop.contactName) } : {})), (prop.notes ? { notes: String(prop.notes) } : {})), (listingUrl ? { listingUrl: String(listingUrl).trim() } : {})), (prop.listingType ? { listingType: prop.listingType } : {})), { createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
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
        city: [/^city$/i, /^cityHebrew$/i, /עיר/i, /יישוב/i, /ישוב/i],
        street: [/^address$/i, /^streetName$/i, /רחוב/i, /כתובת/i, /street/i],
        neighborhood: [/^neighbourhood$/i, /^neighborhood$/i, /שכונה/i, /quarter/i],
        price: [/^price$/i, /מחיר/i, /עלות/i],
        rooms: [/^rooms$/i, /חדרים/i, /מספר חדרים/i],
        sqm: [/^areaSqm$/i, /מ״ר/i, /מ"ר/i, /שטח/i, /גודל/i, /sqm/i, /size/i],
        floor: [/^floor$/i, /קומה/i, /קומות/i],
        type: [/^dealType$/i, /סוג עסקה/i, /עסקה/i, /^type$/i],
        kind: [/^propertyType$/i, /סוג נכס/i, /סוג מודעה/i, /^kind$/i, /property type/i],
        description: [/^listingDescription$/i, /תיאור/i, /מידע/i, /פרטים/i, /description/i, /property details/i, /features/i],
        listingType: [/בלעדיות/i, /בלעדי/i, /שיווק/i, /listing type/i],
        agentName: [/^agentName$/i, /סוכן/i, /מתווך/i, /agent/i, /agency name/i],
        contactName: [/^contactName$/i, /איש קשר/i, /שם.*קשר/i, /contact.*name/i],
        contactPhone: [/^contactPhone$/i, /contact.*phone/i, /^phone$/i, /טלפון/i],
        notes: [/הערות/i, /הערה פנימית/i, /^notes$/i],
        imageUrl: [/^coverImage$/i, /^images\/\d*$/i, /image url/i, /תמונה/i, /photo/i, /^img$/i],
        listingUrl: [/^url$/i, /listing url/i, /^link$/i, /קישור/i, /מודעה/i, /yad2/i, /madlan/i],
        hasBalcony: [/^hasBalcony$/i, /balcony/i, /מרפסת/i],
        hasElevator: [/^hasElevator$/i, /elevator/i, /מעלית/i],
        hasParking: [/^hasParking$/i, /חניה.*בול/i, /^has.*parking$/i, /יש חניה/i],
        parkingSpots: [/^parking$/i, /parking.*spots/i, /parking.*count/i, /חניה/i, /חנייה/i, /חניות/i, /מספר חניות/i, /כמות חניות/i],
        hasSafeRoom: [/^hasSecureRoom$/i, /^hasSafeRoom$/i, /secure.*room/i, /safe.*room/i, /ממ"ד/i, /ממד/i],
        hasAgent: [/^hasAgent$/i, /^יש תיווך$/i, /תיווך/i],
        listingId: [/^listingId$/i, /listing.*id/i],
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
/**
 * Purges global properties (cities/{city}/properties) created BEFORE a given cutoff date.
 * Use `dryRun: true` to count what would be deleted without actually deleting.
 *
 * Selection logic per doc:
 *  - keep when createdAt >= cutoff
 *  - delete when createdAt < cutoff
 *  - missing-createdAt: deleted by default (treated as "old"); set keepMissingDate=true to keep them.
 *
 * Empty city documents (no remaining properties) are also removed.
 */
exports.superAdminPurgeOldGlobalPropertiesV2 = functions.https.onCall({
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 540,
    cors: true,
    invoker: 'public',
}, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    if (request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }
    const { cutoffISO, dryRun = true, keepMissingDate = false } = request.data;
    if (!cutoffISO || typeof cutoffISO !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Missing cutoffISO (e.g. "2026-04-21").');
    }
    const cutoff = new Date(cutoffISO);
    if (isNaN(cutoff.getTime())) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid cutoffISO date.');
    }
    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);
    const db = admin.firestore();
    let kept = 0;
    let toDelete = 0;
    let missingDate = 0;
    let citiesEmptied = 0;
    const perCity = {};
    const citiesSnap = await db.collection('cities').get();
    for (const cityDoc of citiesSnap.docs) {
        const cityName = cityDoc.id;
        const propsSnap = await cityDoc.ref.collection('properties').get();
        if (propsSnap.empty)
            continue;
        const stats = { kept: 0, deleted: 0, missingDate: 0 };
        const toDeleteRefs = [];
        propsSnap.forEach(d => {
            const data = d.data();
            const createdAt = data === null || data === void 0 ? void 0 : data.createdAt;
            const createdDate = (createdAt === null || createdAt === void 0 ? void 0 : createdAt.toDate) ? createdAt.toDate() :
                createdAt instanceof Date ? createdAt :
                    typeof createdAt === 'string' ? new Date(createdAt) :
                        null;
            if (!createdDate || isNaN(createdDate.getTime())) {
                stats.missingDate++;
                missingDate++;
                if (!keepMissingDate) {
                    toDeleteRefs.push(d.ref);
                    stats.deleted++;
                    toDelete++;
                }
                else {
                    stats.kept++;
                    kept++;
                }
                return;
            }
            if (createdDate.getTime() >= cutoffTs.toMillis()) {
                stats.kept++;
                kept++;
            }
            else {
                toDeleteRefs.push(d.ref);
                stats.deleted++;
                toDelete++;
            }
        });
        perCity[cityName] = stats;
        if (!dryRun && toDeleteRefs.length > 0) {
            const batchSize = 400;
            for (let i = 0; i < toDeleteRefs.length; i += batchSize) {
                const chunk = toDeleteRefs.slice(i, i + batchSize);
                const batch = db.batch();
                chunk.forEach(r => batch.delete(r));
                await batch.commit();
            }
            if (stats.kept === 0) {
                await cityDoc.ref.delete().catch(() => { });
                citiesEmptied++;
            }
        }
    }
    return {
        success: true,
        dryRun,
        cutoffISO,
        cutoffApplied: cutoff.toISOString(),
        keepMissingDate,
        totals: { kept, deleted: toDelete, missingDate, citiesEmptied },
        perCity,
    };
});
exports.superAdminConsolidateCityV2 = functions.https.onCall({
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
    const { oldCityId, newCityId } = request.data;
    if (!oldCityId || !newCityId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing oldCityId or newCityId.');
    }
    const db = admin.firestore();
    const oldPath = `cities/${oldCityId}/properties`;
    const newPath = `cities/${newCityId}/properties`;
    console.log(`Consolidating city: [${oldCityId}] -> [${newCityId}]`);
    // 1. Ensure target city document exists
    await db.collection('cities').doc(newCityId).set({
        exists: true,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        name: newCityId
    }, { merge: true });
    // 2. Scan and migrate properties
    const snap = await db.collection(oldPath).get();
    if (snap.empty) {
        return { success: true, message: 'No properties found in old path.', consolidatedCount: 0 };
    }
    const batchSize = 400;
    let consolidatedCount = 0;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += batchSize) {
        const chunk = docs.slice(i, i + batchSize);
        const batch = db.batch();
        chunk.forEach(doc => {
            const data = doc.data();
            const newData = Object.assign(Object.assign({}, data), { city: newCityId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            batch.set(db.collection(newPath).doc(doc.id), newData);
            batch.delete(doc.ref);
            consolidatedCount++;
        });
        await batch.commit();
    }
    // 3. Delete old city doc
    await db.collection('cities').doc(oldCityId).delete();
    return {
        success: true,
        message: `Successfully consolidated ${consolidatedCount} properties from ${oldCityId} to ${newCityId}`,
        consolidatedCount
    };
});
//# sourceMappingURL=globalImport.js.map