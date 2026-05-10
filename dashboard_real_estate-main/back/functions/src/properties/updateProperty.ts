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
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

// Fields that must never be changed by a client update
const IMMUTABLE_FIELDS = ['agencyId', 'createdAt', 'publicAt', 'id'];

export const updateProperty = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);

    const { propertyId, updates, cityName } = request.data as {
        propertyId?: string;
        updates?: Record<string, unknown>;
        cityName?: string;
    };

    if (!propertyId?.trim()) throw new HttpsError('invalid-argument', 'propertyId is required.');
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'updates object must not be empty.');
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
                propertyRef = globalRef as any;
                propertySnap = globalSnap;
            } else {
                // Import global property into agency subcollection
                console.log(`[updateProperty] Importing global property ${propertyId} for agency ${agencyId}`);
                const globalData = globalSnap.data()!;
                const newPropertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc();
                actualPropertyId = newPropertyRef.id;

                // Migrate global flat doc to new nested schema on import
                const { migratePropertyDoc } = await import('../utils/propertyMigrator');
                const migratedData = migratePropertyDoc({ ...globalData, agencyId }, globalSnap.id);
                const { id: _id, ...storedData } = migratedData as any;

                await newPropertyRef.set({
                    ...storedData,
                    agencyId,
                    isGlobalCityProperty: false,
                    importedFromGlobal: true,
                    originalGlobalId: propertyId,
                    createdAt: globalData.createdAt ?? FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    status: 'active',
                });

                propertyRef = newPropertyRef;
                propertySnap = await propertyRef.get();
            }
        }
    }

    if (!propertySnap.exists) {
        throw new HttpsError('not-found', `Property ${propertyId} not found.`);
    }

    const propertyData = propertySnap.data()!;

    // Permission check: own agency OR super admin
    if (!isSuperAdmin && propertyData.agencyId && propertyData.agencyId !== agencyId) {
        throw new HttpsError('permission-denied', 'You do not have access to this property.');
    }

    // ── Block exclusivity on WhatsApp-sourced properties ───────────────────────
    const isWhatsappSource = propertyData.source === 'whatsapp_group' || propertyData.listingType === 'external';
    if (isWhatsappSource && updates.isExclusive === true) {
        throw new HttpsError('invalid-argument', 'Cannot mark an external/WhatsApp property as exclusive.');
    }

    // ── Strip immutable fields from updates ─────────────────────────────────────
    const safeUpdates = { ...updates };
    for (const field of IMMUTABLE_FIELDS) {
        delete safeUpdates[field];
    }

    const isBecomingPublic =
        updates.visibility === 'public' && propertyData.visibility !== 'public';

    await propertyRef.update({
        ...safeUpdates,
        updatedAt: FieldValue.serverTimestamp(),
        ...(isBecomingPublic ? { publicAt: FieldValue.serverTimestamp() } : {}),
    });

    return { success: true, propertyId: actualPropertyId };
});
