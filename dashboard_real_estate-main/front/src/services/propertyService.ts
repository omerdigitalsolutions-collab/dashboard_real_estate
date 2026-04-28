import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    query,
    where,
    serverTimestamp,
    writeBatch,
    documentId,
    onSnapshot,
    CollectionReference
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from '../config/firebase';
import { Property, PropertyStatus } from '../types';

// ─── Collection Helper ────────────────────────────────────────────────────────

const agencyPropsCol = (agencyId: string): CollectionReference =>
    collection(db, 'agencies', agencyId, 'properties');

// ─── Create ───────────────────────────────────────────────────────────────────

export interface NewPropertyData {
    address: {
        city: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        fullAddress?: string;
    };
    transactionType: 'forsale' | 'rent';
    propertyType: string;
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
    financials: {
        price: number;
        originalPrice?: number;
    };
    media?: {
        mainImage?: string;
        images?: string[];
        videoTourUrl?: string;
    };
    management?: {
        assignedAgentId?: string;
        descriptions?: string;
    };
    isExclusive?: boolean;
    listingType?: 'private' | 'exclusive' | 'external';
    imageFiles?: File[];
    leadId?: string;
    originalSource?: string;
    externalLink?: string;
}

/**
 * Adds a new property for the given agency in the subcollection.
 */
export async function addProperty(
    agencyId: string,
    data: NewPropertyData
): Promise<string> {
    const { imageFiles, ...restData } = data;

    const city = restData.address.city?.trim() ?? '';
    const street = restData.address.street ?? '';
    const fullAddress = restData.address.fullAddress || `${street} ${city}`.trim();

    const docRef = await addDoc(agencyPropsCol(agencyId), {
        agencyId,
        transactionType: restData.transactionType,
        propertyType: restData.propertyType || '',
        status: 'active',
        rooms: restData.rooms ?? null,
        floor: restData.floor ?? null,
        totalFloors: restData.totalFloors ?? null,
        squareMeters: restData.squareMeters ?? null,
        address: {
            city,
            street,
            number: restData.address.number ?? '',
            neighborhood: restData.address.neighborhood ?? '',
            fullAddress,
        },
        features: {
            hasElevator: restData.features?.hasElevator ?? null,
            hasParking: restData.features?.hasParking ?? null,
            parkingSpots: restData.features?.parkingSpots ?? null,
            hasBalcony: restData.features?.hasBalcony ?? null,
            hasMamad: restData.features?.hasMamad ?? null,
            hasStorage: restData.features?.hasStorage ?? null,
            isRenovated: restData.features?.isRenovated ?? null,
            isFurnished: restData.features?.isFurnished ?? null,
            hasAirConditioning: restData.features?.hasAirConditioning ?? null,
        },
        financials: {
            price: restData.financials.price,
            originalPrice: restData.financials.originalPrice ?? null,
        },
        media: {
            mainImage: restData.media?.mainImage ?? null,
            images: restData.media?.images ?? [],
            videoTourUrl: restData.media?.videoTourUrl ?? null,
        },
        management: {
            assignedAgentId: restData.management?.assignedAgentId ?? null,
            descriptions: restData.management?.descriptions ?? null,
        },
        isExclusive: restData.isExclusive ?? false,
        listingType: restData.listingType ?? null,
        leadId: restData.leadId ?? null,
        originalSource: restData.originalSource ?? null,
        externalLink: restData.externalLink ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    const propertyId = docRef.id;

    if (imageFiles && imageFiles.length > 0) {
        const uploadPromises = imageFiles.map(async (file) => {
            const ext = file.name.split('.').pop() ?? 'jpg';
            const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
            const storageRef = ref(storage, `agencies/${agencyId}/properties/${propertyId}/images/${uniqueFilename}`);
            const snapshot = await uploadBytes(storageRef, file);
            return getDownloadURL(snapshot.ref);
        });

        const imageUrls = await Promise.all(uploadPromises);
        await updateDoc(docRef, { 'media.images': imageUrls });
    }

    return propertyId;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches all properties that belong to the given agency.
 */
export async function getPropertiesByAgency(
    agencyId: string,
    filters?: {
        status?: PropertyStatus;
    }
): Promise<Property[]> {
    let q = query(agencyPropsCol(agencyId));

    if (filters?.status) {
        q = query(q, where('status', '==', filters.status));
    }

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Property));
}

/**
 * getLiveProperties — Real-time listener for agency properties.
 */
export function getLiveProperties(
    agencyId: string,
    callback: (properties: Property[]) => void,
    onError?: (err: Error) => void
): () => void {
    return onSnapshot(
        agencyPropsCol(agencyId),
        (snap) => {
            const properties = snap.docs.map(
                (d) => ({ id: d.id, ...d.data() } as Property)
            );
            callback(properties);
        },
        onError
    );
}

/**
 * Fetches multiple properties by their IDs within an agency's subcollection.
 */
export async function getPropertiesByIds(agencyId: string, propertyIds: string[]): Promise<Property[]> {
    if (!propertyIds || propertyIds.length === 0) return [];

    const uniqueIds = Array.from(new Set(propertyIds));
    const chunks: string[][] = [];

    for (let i = 0; i < uniqueIds.length; i += 10) {
        chunks.push(uniqueIds.slice(i, i + 10));
    }

    const promises = chunks.map(async (chunk) => {
        const q = query(
            agencyPropsCol(agencyId),
            where(documentId(), 'in', chunk)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Property));
    });

    const results = await Promise.all(promises);
    return results.flat();
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Partially updates a property document via the backend Cloud Function.
 */
export async function updateProperty(
    propertyId: string,
    updates: Partial<Omit<Property, 'id' | 'agencyId'>>,
    cityHint?: string
): Promise<string> {
    console.log(`[propertyService] updateProperty called for ${propertyId}`, { cityHint, updates });
    const functions = getFunctions(undefined, 'europe-west1');
    const updateFn = httpsCallable<{ propertyId: string; updates: any; cityName?: string }, { success: boolean; propertyId: string }>(
        functions,
        'properties-updateProperty'
    );
    try {
        const result = await updateFn({ propertyId, updates, cityName: cityHint });
        console.log(`[propertyService] updateProperty success for ${propertyId}`, result.data);
        return result.data.propertyId || propertyId;
    } catch (err) {
        console.error(`[propertyService] updateProperty FAILED for ${propertyId}:`, err);
        throw err;
    }
}

/**
 * Merges duplicate properties into a primary one.
 */
export async function mergeProperties(
    agencyId: string,
    primaryId: string,
    duplicateIds: string[],
    mergedData: Partial<Property>
): Promise<void> {
    const batch = writeBatch(db);

    const primaryRef = doc(agencyPropsCol(agencyId), primaryId);
    batch.update(primaryRef, { ...mergedData, updatedAt: serverTimestamp() });

    duplicateIds.forEach(id => {
        const dupRef = doc(agencyPropsCol(agencyId), id);
        batch.delete(dupRef);
    });

    await batch.commit();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Calls the backend Cloud Function to delete a property.
 */
export async function deleteProperty(propertyId: string): Promise<void> {
    const functions = getFunctions(undefined, 'europe-west1');
    const deleteFn = httpsCallable<{ propertyId: string }, { success: boolean }>(functions, 'properties-deleteProperty');
    await deleteFn({ propertyId });
}

/**
 * Uploads additional images for a property and returns their URLs.
 */
export async function uploadPropertyImages(
    agencyId: string,
    propertyId: string,
    imageFiles: File[],
    isGlobal?: boolean,
    isSuperAdmin?: boolean
): Promise<string[]> {
    if (!imageFiles || imageFiles.length === 0) return [];

    const uploadPromises = imageFiles.map(async (file) => {
        const ext = file.name.split('.').pop() ?? 'jpg';
        const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;

        const path = (isGlobal && isSuperAdmin)
            ? `global/properties/${propertyId}/images/${uniqueFilename}`
            : `agencies/${agencyId}/properties/${propertyId}/images/${uniqueFilename}`;

        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        return getDownloadURL(snapshot.ref);
    });

    return await Promise.all(uploadPromises);
}

export async function uploadPropertyVideo(
    agencyId: string,
    propertyId: string,
    videoFile: File,
    isGlobal?: boolean,
    isSuperAdmin?: boolean
): Promise<string> {
    const ext = videoFile.name.split('.').pop() ?? 'mp4';
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;

    const path = (isGlobal && isSuperAdmin)
        ? `global/properties/${propertyId}/videos/${uniqueFilename}`
        : `agencies/${agencyId}/properties/${propertyId}/videos/${uniqueFilename}`;

    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, videoFile);
    return getDownloadURL(snapshot.ref);
}

export async function importPropertyFromUrl(url: string): Promise<{
    city: string;
    address: string;
    price: number | null;
    rooms: number | null;
    sqm: number | null;
    floor: number | null;
    type: 'forsale' | 'rent';
    kind: string;
    description: string;
    images: string[];
    externalLink: string;
}> {
    const fns = getFunctions(app, 'europe-west1');
    const importFn = httpsCallable(fns, 'properties-importPropertyFromUrl');
    const result = await importFn({ url });
    return result.data as any;
}
