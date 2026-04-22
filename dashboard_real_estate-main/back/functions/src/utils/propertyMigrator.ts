/**
 * Converts a legacy flat property document (from root `properties` collection)
 * to the new nested schema (for `agencies/{agencyId}/properties/{id}` subcollection).
 *
 * Safe to run multiple times — idempotent.
 */
export interface NewPropertySchema {
    id?: string;
    agencyId: string;
    transactionType: 'forsale' | 'rent';
    propertyType: string;
    status: string;
    rooms?: number | null;
    floor?: number | null;
    totalFloors?: number | null;
    squareMeters?: number | null;

    address: {
        city: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        fullAddress: string;
        coords?: { lat: number; lng: number };
    };

    features: {
        hasElevator?: boolean | null;
        hasParking?: boolean | null;
        parkingSpots?: number | null;
        hasBalcony?: boolean | null;
        hasMamad?: boolean | null;
        hasStorage?: boolean | null;
        isRenovated?: boolean | null;
        isFurnished?: boolean | null;
        hasAirConditioning?: boolean | null;
    };

    financials: {
        price: number;
        originalPrice?: number | null;
    };

    media: {
        mainImage?: string | null;
        images?: string[];
        videoTourUrl?: string | null;
    };

    source?: {
        origin?: string;
        sourceUrl?: string | null;
        scraperBatchId?: string | null;
    };

    management: {
        assignedAgentId?: string | null;
        descriptions?: string | null;
    };

    listingType?: string | null;
    isGlobalCityProperty?: boolean;
    readonly?: boolean;
    createdAt?: any;
    updatedAt?: any;
}

export function migratePropertyDoc(old: any, id: string): NewPropertySchema {
    // Normalize transaction type: 'sale' → 'forsale', keep 'rent', handle Hebrew
    let transactionType: 'forsale' | 'rent' = 'forsale';
    const rawType = (old.type || old.transactionType || '').toString().toLowerCase();
    if (rawType === 'rent' || rawType.includes('שכיר') || rawType.includes('שכר')) {
        transactionType = 'rent';
    }

    // Build address object
    const street = old.street || old.address?.street || '';
    const city = old.city || old.address?.city || '';
    const fullAddress =
        old.address?.fullAddress ||
        (typeof old.address === 'string' ? old.address : null) ||
        `${street} ${city}`.trim();

    const coords =
        old.address?.coords ??
        (old.lat != null && old.lng != null ? { lat: old.lat, lng: old.lng } : undefined);

    // Strip agentName: "true" bug — keep only real string names
    const rawDescriptions = old.description || old.management?.descriptions;
    const descriptions =
        rawDescriptions && rawDescriptions !== 'true' && rawDescriptions !== true
            ? String(rawDescriptions)
            : null;

    // Images: prefer media.images → imageUrls → images
    const images: string[] =
        old.media?.images ||
        old.imageUrls ||
        old.images ||
        [];

    return {
        agencyId: old.agencyId,
        transactionType,
        propertyType: old.kind || old.propertyType || '',
        status: old.status || 'active',
        rooms: old.rooms ?? null,
        floor: old.floor ?? null,
        totalFloors: old.floorsTotal ?? old.totalFloors ?? null,
        squareMeters: old.sqm ?? old.squareMeters ?? null,

        address: {
            city,
            street,
            number: old.streetNumber || old.address?.number || '',
            neighborhood: old.neighborhood || old.address?.neighborhood || '',
            fullAddress,
            ...(coords ? { coords } : {}),
        },

        features: {
            hasElevator: old.features?.hasElevator ?? old.hasElevator ?? null,
            hasParking: old.features?.hasParking ?? old.hasParking ?? null,
            parkingSpots: old.features?.parkingSpots ?? old.parkingSpots ?? null,
            hasBalcony: old.features?.hasBalcony ?? old.hasBalcony ?? null,
            hasMamad: old.features?.hasMamad ?? old.hasSafeRoom ?? null,
            hasStorage: old.features?.hasStorage ?? old.hasStorage ?? null,
            isRenovated: old.features?.isRenovated ?? (old.condition === 'renovated' ? true : null),
            isFurnished: old.features?.isFurnished ?? null,
            hasAirConditioning: old.features?.hasAirConditioning ?? old.hasAirCondition ?? null,
        },

        financials: {
            price: old.financials?.price ?? old.price ?? 0,
            originalPrice: old.financials?.originalPrice ?? old.originalPrice ?? null,
        },

        media: {
            mainImage: old.media?.mainImage ?? images[0] ?? null,
            images,
            videoTourUrl: old.media?.videoTourUrl ?? old.videoUrl ?? old.videoUrls?.[0] ?? null,
        },

        ...(old.source || old.yad2Link
            ? {
                  source: {
                      origin: (typeof old.source === 'string' ? old.source : old.source?.origin) ?? undefined,
                      sourceUrl: old.yad2Link ?? old.source?.sourceUrl ?? null,
                      scraperBatchId: old.source?.scraperBatchId ?? null,
                  },
              }
            : {}),

        management: {
            assignedAgentId: old.management?.assignedAgentId ?? old.agentId ?? null,
            descriptions,
        },

        listingType: old.listingType ?? null,
        isGlobalCityProperty: old.isGlobalCityProperty ?? false,
        readonly: old.readonly ?? false,
        createdAt: old.createdAt ?? null,
        updatedAt: old.updatedAt ?? old.ingestedAt ?? old.createdAt ?? null,
    };
}
