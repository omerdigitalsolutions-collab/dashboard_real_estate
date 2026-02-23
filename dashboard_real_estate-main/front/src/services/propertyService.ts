import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    where,
    serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { Property, PropertyStatus } from '../types';

const COLLECTION = 'properties';

// ─── Create ───────────────────────────────────────────────────────────────────

export interface NewPropertyData {
    address: string;
    city: string;
    type: 'sale' | 'rent';
    kind: string;      // e.g. דירה, בית פרטי, פנטהאוז, מסחרי
    price: number;
    rooms?: number;
    floor?: number;
    agentId?: string;
    lat?: number;
    lng?: number;
    description?: string;
    images?: string[];
    isExclusive?: boolean;
    imageFiles?: File[];
}

/**
 * Adds a new property for the given agency.
 * Auto-injects agencyId, status:'active', daysOnMarket:0, and createdAt.
 */
export async function addProperty(
    agencyId: string,
    data: NewPropertyData
): Promise<string> {
    const { imageFiles, ...restData } = data;

    // 1. Create the Property document first to get the ID
    const docRef = await addDoc(collection(db, COLLECTION), {
        ...restData,
        agencyId,
        status: 'active',
        daysOnMarket: 0,
        createdAt: serverTimestamp(),
    });

    const propertyId = docRef.id;

    // 2. Upload images if provided
    if (imageFiles && imageFiles.length > 0) {
        const uploadPromises = imageFiles.map(async (file) => {
            const ext = file.name.split('.').pop() ?? 'jpg';
            const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
            const storageRef = ref(storage, `agencies/${agencyId}/properties/${propertyId}/images/${uniqueFilename}`);
            const snapshot = await uploadBytes(storageRef, file);
            return getDownloadURL(snapshot.ref);
        });

        const imageUrls = await Promise.all(uploadPromises);

        // 3. Update the document with the image URLs
        await updateDoc(docRef, { imageUrls });
    }

    return propertyId;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches all properties that belong to the given agency.
 * Optionally filter by status, agentId, or type.
 */
export async function getPropertiesByAgency(
    agencyId: string,
    filters?: {
        status?: PropertyStatus;
        agentId?: string;
    }
): Promise<Property[]> {
    let q = query(
        collection(db, COLLECTION),
        where('agencyId', '==', agencyId)
    );

    if (filters?.status) {
        q = query(q, where('status', '==', filters.status));
    }
    if (filters?.agentId) {
        q = query(q, where('agentId', '==', filters.agentId));
    }

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Property));
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Partially updates a property document.
 * Only the fields present in `updates` are modified.
 */
export async function updateProperty(
    propertyId: string,
    updates: Partial<Omit<Property, 'id' | 'agencyId'>>
): Promise<void> {
    const ref = doc(db, COLLECTION, propertyId);
    await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Permanently deletes a property document.
 * Prefer soft-deletes (status = 'withdrawn') in production.
 */
export async function deleteProperty(propertyId: string): Promise<void> {
    const ref = doc(db, COLLECTION, propertyId);
    await deleteDoc(ref);
}
