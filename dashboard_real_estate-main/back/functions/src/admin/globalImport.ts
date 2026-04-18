import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

/**
 * Callable function for Super Admins to bulk-import properties into global cities collection.
 */
export const superAdminImportGlobalPropertiesV2 = functions.https.onCall({
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

    const { properties } = request.data as { properties: any[] };
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
                const prop = { ...rawPropInput } as any;

                // Normalize boolean string fields ("true"/"false" → boolean)
                for (const f of ['hasBalcony', 'hasElevator', 'hasParking', 'hasSafeRoom'] as const) {
                    if (typeof prop[f] === 'string') {
                        prop[f] = prop[f].toLowerCase() === 'true';
                    }
                }

                // Normalize dealType: "buy" → "sale"
                if (prop.type === 'buy') prop.type = 'sale';
                else if (prop.type === 'rent') prop.type = 'rent';

                // City: prefer English `city`, fall back to `cityHebrew`
                const rawCity = (prop.city || prop.cityHebrew || 'unknown').toString().trim();
                const normalizedCity = rawCity || 'unknown';

                // street normalization for ID
                const street = (prop.street || '').toString().trim();
                const price = prop.price || 0;

                // Deduplication ID: Hash of city + street + price
                const hashInput = `${normalizedCity.toLowerCase()}_${street.toLowerCase()}_${price}`;
                const docId = crypto.createHash('sha256').update(hashInput).digest('hex');

                const propRef = db.collection('cities').doc(normalizedCity).collection('properties').doc(docId);

                // Normalize imageUrl → imageUrls array
                let imageUrls: string[] = [];
                if (Array.isArray(prop.imageUrls)) {
                    imageUrls = (prop.imageUrls as any[]).map(String).filter(Boolean);
                } else if (typeof prop.imageUrl === 'string' && prop.imageUrl.trim()) {
                    imageUrls = [prop.imageUrl.trim()];
                }

                // Strip raw/redundant fields from spread
                const { imageUrl: _iu, imageUrls: _ius, listingUrl, cityHebrew: _ch, ...restProp } = prop as any;

                batch.set(propRef, {
                    ...restProp,
                    city: normalizedCity,
                    street: street,
                    ...(imageUrls.length > 0 ? { imageUrls } : {}),
                    ...(listingUrl ? { listingUrl: String(listingUrl).trim() } : {}),
                    source: "super_admin_excel",
                    isPublic: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            });

            await batch.commit();
            totalInserted += chunk.length;
        }

        return {
            success: true,
            insertedCount: totalInserted
        };

    } catch (error: any) {
        console.error('[superAdminImportGlobalProperties] Error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Error occurred during bulk import.');
    }
});

export const superAdminGetImportMappingV2 = functions.https.onCall({
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

    const { headers } = request.data as { headers: string[] };

    const mapping: Record<string, string> = {};

    // Dictionary definition: DB key -> array of typical Hebrew/English column headers
    const rules: Record<string, RegExp[]> = {
        city:         [/^city$/i, /^cityHebrew$/i, /עיר/i, /יישוב/i, /ישוב/i],
        street:       [/^address$/i, /^streetName$/i, /רחוב/i, /כתובת/i, /street/i],
        neighborhood: [/^neighbourhood$/i, /^neighborhood$/i, /שכונה/i, /quarter/i],
        price:        [/^price$/i, /מחיר/i, /עלות/i],
        rooms:        [/^rooms$/i, /חדרים/i, /מספר חדרים/i],
        sqm:          [/^areaSqm$/i, /מ״ר/i, /מ"ר/i, /שטח/i, /גודל/i, /sqm/i, /size/i],
        floor:        [/^floor$/i, /קומה/i, /קומות/i],
        type:         [/^dealType$/i, /סוג עסקה/i, /עסקה/i, /^type$/i],
        kind:         [/^propertyType$/i, /סוג נכס/i, /סוג מודעה/i, /^kind$/i, /property type/i],
        description:  [/^listingDescription$/i, /תיאור/i, /מידע/i, /פרטים/i, /description/i, /property details/i, /features/i],
        listingType:  [/בלעדיות/i, /בלעדי/i, /שיווק/i, /listing type/i],
        agentName:    [/^contactName$/i, /סוכן/i, /איש קשר/i, /מתווך/i, /agent/i, /agency name/i],
        contactPhone: [/^contactPhone$/i, /contact.*phone/i, /^phone$/i, /טלפון/i],
        notes:        [/הערות/i, /הערה פנימית/i, /^notes$/i],
        imageUrl:     [/^coverImage$/i, /^images\/\d*$/i, /image url/i, /תמונה/i, /photo/i, /^img$/i],
        listingUrl:   [/^url$/i, /listing url/i, /^link$/i, /קישור/i, /מודעה/i, /yad2/i, /madlan/i],
        hasBalcony:   [/^hasBalcony$/i, /balcony/i, /מרפסת/i],
        hasElevator:  [/^hasElevator$/i, /elevator/i, /מעלית/i],
        hasParking:   [/^hasParking$/i, /^parking$/i, /חניה/i, /חנייה/i],
        hasSafeRoom:  [/^hasSecureRoom$/i, /secure.*room/i, /safe.*room/i, /ממ"ד/i, /ממד/i],
        listingId:    [/^listingId$/i, /listing.*id/i],
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
