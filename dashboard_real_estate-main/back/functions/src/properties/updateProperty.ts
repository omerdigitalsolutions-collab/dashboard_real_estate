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
const IMMUTABLE_FIELDS = ['agencyId', 'createdAt', 'id'];

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

    // ── Load property and verify ownership ─────────────────────────────────────
    let propertyRef = db.doc(`properties/${propertyId}`);
    let propertySnap = await propertyRef.get();
    let actualPropertyId = propertyId;

    // Check if the user is a super admin
    const superAdminSnap = await db.doc(`superAdmins/${authData.uid}`).get();
    const isSuperAdmin = superAdminSnap.exists;

    // Check if we own this property
    const isOwned = propertySnap.exists && propertySnap.data()?.agencyId === authData.agencyId;

    if (!isOwned && cityName) {
        // It's not ours or doesn't exist. Check if it's a global property.
        const globalRef = db.doc(`cities/${cityName}/properties/${propertyId}`);
        const globalSnap = await globalRef.get();

        if (globalSnap.exists) {
            // If it's a super admin, we allow direct update to the global property
            if (isSuperAdmin) {
                propertyRef = globalRef;
                propertySnap = globalSnap;
            } else {
                // Regular user: Import to their private collection as a NEW document
                console.log(`[updateProperty] Importing global property ${propertyId} as a new document for agency ${authData.agencyId}`);
                
                const globalData = globalSnap.data()!;
                const newPropertyRef = db.collection('properties').doc();
                actualPropertyId = newPropertyRef.id;
                
                await newPropertyRef.set({
                    ...globalData,
                    agencyId: authData.agencyId,
                    isGlobalCityProperty: false,
                    importedFromGlobal: true,
                    originalGlobalId: propertyId,
                    createdAt: globalData.createdAt ?? FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    status: 'active'
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

    // Permission check: Must be owner OR Super Admin (Super Admin can edit anything)
    if (!isSuperAdmin && authData.agencyId !== propertyData.agencyId) {
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

    await propertyRef.update({
        ...safeUpdates,
        updatedAt: FieldValue.serverTimestamp()
    });

    return { success: true, propertyId: actualPropertyId };
});
