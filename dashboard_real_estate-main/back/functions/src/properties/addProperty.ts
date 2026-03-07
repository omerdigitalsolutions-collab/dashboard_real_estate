/**
 * addProperty — Creates a new property document for an agency.
 *
 * Security: Caller must be authenticated and belong to the specified agencyId.
 * The agencyId and status are injected server-side and cannot be spoofed.
 *
 * Input:
 *   {
 *     agencyId: string,
 *     address: string,
 *     city: string,
 *     type: 'sale' | 'rent',
 *     price: number,
 *     rooms?: number,
 *     floor?: number,
 *     sqMeters?: number,
 *     features?: string[],
 *     description?: string,
 *     assignedAgentId?: string
 *   }
 *
 * Output: { success: true, propertyId: string }
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

export const addProperty = onCall(async (request) => {
    // ── Auth & Agency validation ────────────────────────────────────────────────
    const authData = await validateUserAuth(request);

    const data = request.data as {
        address?: string;
        city?: string;
        type?: 'sale' | 'rent';
        price?: number;
        rooms?: number;
        floor?: number;
        sqMeters?: number;
        features?: string[];
        description?: string;
        assignedAgentId?: string;
    };

    // ── Validation ─────────────────────────────────────────────────────────────
    if (!data.address?.trim()) throw new HttpsError('invalid-argument', 'address is required.');
    if (!data.city?.trim()) throw new HttpsError('invalid-argument', 'city is required.');
    if (!data.type) throw new HttpsError('invalid-argument', 'type must be "sale" or "rent".');
    if (!data.price || data.price <= 0) throw new HttpsError('invalid-argument', 'price must be a positive number.');

    // ── Create the document ─────────────────────────────────────────────────────
    const propertyRef = db.collection('properties').doc();

    await propertyRef.set({
        address: data.address.trim(),
        city: data.city.trim(),
        type: data.type,
        price: data.price,
        rooms: data.rooms ?? null,
        floor: data.floor ?? null,
        sqMeters: data.sqMeters ?? null,
        features: data.features ?? [],
        description: data.description?.trim() ?? null,
        assignedAgentId: data.assignedAgentId ?? null,
        agencyId: authData.agencyId,      // injected server-side
        status: 'active',                  // injected server-side
        createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true, propertyId: propertyRef.id };
});
