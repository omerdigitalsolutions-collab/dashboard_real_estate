/**
 * addProperty — Creates a new property document under agencies/{agencyId}/properties.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

export const addProperty = onCall({ cors: true }, async (request) => {
    const authData = await validateUserAuth(request);
    const agencyId = authData.agencyId;

    const data = request.data as {
        // New nested schema (preferred)
        address?: {
            city?: string;
            street?: string;
            number?: string;
            neighborhood?: string;
            fullAddress?: string;
        };
        transactionType?: 'forsale' | 'rent';
        propertyType?: string;
        rooms?: number;
        floor?: number;
        totalFloors?: number;
        squareMeters?: number;
        features?: {
            hasElevator?: boolean;
            hasParking?: boolean;
            parkingSpots?: number;
            hasBalcony?: boolean;
            hasMamad?: boolean;
            hasStorage?: boolean;
            isRenovated?: boolean;
            isFurnished?: boolean;
            hasAirConditioning?: boolean;
        };
        financials?: { price?: number; originalPrice?: number };
        media?: { mainImage?: string; images?: string[]; videoTourUrl?: string };
        management?: { assignedAgentId?: string; descriptions?: string };
        listingType?: string;
        status?: string;
        // Legacy flat fields for backward compat
        city?: string;
        street?: string;
        price?: number;
        type?: string;
        description?: string;
        agentId?: string;
    };

    // ── Validation ──────────────────────────────────────────────────────────────
    const city = data.address?.city || data.city;
    const price = data.financials?.price ?? data.price;
    if (!city?.trim()) throw new HttpsError('invalid-argument', 'address.city is required.');
    if (!price || price <= 0) throw new HttpsError('invalid-argument', 'financials.price must be positive.');

    const fullAddress = data.address?.fullAddress ||
        `${data.address?.street || data.street || ''} ${city}`.trim();

    // ── Write to subcollection ──────────────────────────────────────────────────
    const propertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc();

    await propertyRef.set({
        agencyId,
        transactionType: data.transactionType || (data.type === 'rent' ? 'rent' : 'forsale'),
        propertyType: data.propertyType || '',
        status: data.status || 'active',
        rooms: data.rooms ?? null,
        floor: data.floor ?? null,
        totalFloors: data.totalFloors ?? null,
        squareMeters: data.squareMeters ?? null,
        address: {
            city: city.trim(),
            street: data.address?.street || data.street || '',
            number: data.address?.number || '',
            neighborhood: data.address?.neighborhood || '',
            fullAddress,
        },
        features: {
            hasElevator: data.features?.hasElevator ?? null,
            hasParking: data.features?.hasParking ?? null,
            parkingSpots: data.features?.parkingSpots ?? null,
            hasBalcony: data.features?.hasBalcony ?? null,
            hasMamad: data.features?.hasMamad ?? null,
            hasStorage: data.features?.hasStorage ?? null,
            isRenovated: data.features?.isRenovated ?? null,
            isFurnished: data.features?.isFurnished ?? null,
            hasAirConditioning: data.features?.hasAirConditioning ?? null,
        },
        financials: {
            price,
            originalPrice: data.financials?.originalPrice ?? null,
        },
        media: {
            mainImage: data.media?.mainImage ?? null,
            images: data.media?.images ?? [],
            videoTourUrl: data.media?.videoTourUrl ?? null,
        },
        management: {
            assignedAgentId: data.management?.assignedAgentId || data.agentId || null,
            descriptions: data.management?.descriptions || data.description || null,
        },
        listingType: data.listingType || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, propertyId: propertyRef.id };
});
