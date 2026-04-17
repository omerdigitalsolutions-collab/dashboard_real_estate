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

    // If it doesn't exist in properties, it might be a global property awaiting import
    if (!propertySnap.exists && cityName) {
        const globalRef = db.doc(`cities/${cityName}/properties/${propertyId}`);
        const globalSnap = await globalRef.get();

        if (globalSnap.exists) {
            const globalData = globalSnap.data()!;
            // Create a private agency-specific copy
            await propertyRef.set({
                ...globalData,
                agencyId: authData.agencyId,
                isGlobalCityProperty: false, // It's no longer just a global reference
                importedFromGlobal: true,
                createdAt: globalData.createdAt ?? FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                status: 'active'
            });
            propertySnap = await propertyRef.get();
        }
    }

    if (!propertySnap.exists) {
        throw new HttpsError('not-found', `Property ${propertyId} not found.`);
    }

    const propertyData = propertySnap.data()!;

    if (authData.agencyId !== propertyData.agencyId) {
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

    return { success: true };
});
