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
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

// Fields that must never be changed by a client update
const IMMUTABLE_FIELDS = ['agencyId', 'createdAt', 'id'];

export const updateProperty = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { propertyId, updates } = request.data as {
        propertyId?: string;
        updates?: Record<string, unknown>;
    };

    if (!propertyId?.trim()) throw new HttpsError('invalid-argument', 'propertyId is required.');
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'updates object must not be empty.');
    }

    // ── Load property and verify ownership ─────────────────────────────────────
    const propertyRef = db.doc(`properties/${propertyId}`);
    const propertySnap = await propertyRef.get();

    if (!propertySnap.exists) {
        throw new HttpsError('not-found', `Property ${propertyId} not found.`);
    }

    const propertyData = propertySnap.data()!;

    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || callerDoc.data()?.agencyId !== propertyData.agencyId) {
        throw new HttpsError('permission-denied', 'You do not have access to this property.');
    }

    // ── Strip immutable fields from updates ─────────────────────────────────────
    const safeUpdates = { ...updates };
    for (const field of IMMUTABLE_FIELDS) {
        delete safeUpdates[field];
    }

    await propertyRef.update(safeUpdates);

    return { success: true };
});
