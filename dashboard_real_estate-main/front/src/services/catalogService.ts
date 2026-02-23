import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';
import { SharedCatalog } from '../types';

const COLLECTION = 'shared_catalogs';

/**
 * Creates a new shared catalog using the backend Cloud Function.
 */
export async function createCatalog(
    agencyId: string,
    leadId: string,
    leadName: string | undefined, // Not used in the CF directly, but you can pass it if you update the CF
    propertyIds: string[]
): Promise<string> {
    const functions = getFunctions();
    const generateCatalogCF = httpsCallable(functions, 'catalogs-generateCatalog');

    // Call the Cloud Function
    const result = await generateCatalogCF({
        agencyId,
        leadId,
        leadName,
        propertyIds
    });

    const data = result.data as { success: boolean, catalogId: string, url: string };

    if (!data.success) {
        throw new Error('Failed to generate catalog from server');
    }

    return data.catalogId;
}

/**
 * Retrieves a shared catalog by token (Document ID).
 * Returns null if the catalog does not exist or has expired.
 */
export async function getCatalog(token: string): Promise<SharedCatalog | null> {
    const docRef = doc(db, COLLECTION, token);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
        return null; // Might also be because the security rules blocked it (expired)
    }

    const data = { id: snap.id, ...snap.data() } as SharedCatalog;

    // Double check expiration on the client side just in case
    if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
        return null;
    }

    // Increment view count atomically
    try {
        await updateDoc(docRef, {
            viewCount: increment(1)
        });
    } catch (e) {
        console.warn('Could not increment view count (might be missing permissions if not strictly following the rule)', e);
    }

    return data;
}

// Keeping this for backwards compatibility if any components still import it
export const getCatalogWithQueries = getCatalog;
export type { SharedCatalog } from '../types';
