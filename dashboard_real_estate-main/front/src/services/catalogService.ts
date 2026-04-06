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
    leadName: string | undefined,
    propertyIds: Array<string | { id: string; collectionPath: string }>
): Promise<string> {
    const fns = getFunctions(undefined, 'europe-west1');
    const generateCatalogCF = httpsCallable<
        { agencyId: string, leadId: string, leadName: string | undefined, propertyIds: Array<string | { id: string; collectionPath: string }> },
        { success: boolean, catalogId: string, url: string }
    >(fns, 'catalogs-generateCatalog');

    // Call the Cloud Function
    const result = await generateCatalogCF({
        agencyId,
        leadId,
        leadName,
        propertyIds
    });

    const data = result.data;

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

    // Note: we intentionally do NOT block access based on expiresAt here.
    // Catalogs remain accessible until explicitly deleted by the agency.
    // expiresAt is used only for display/informational purposes.

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

/**
 * Persists the liked property IDs to the catalog document.
 * No auth required — public anonymous update allowed by Firestore rules.
 */
export async function saveCatalogLikes(token: string, likedPropertyIds: string[]): Promise<void> {
    const docRef = doc(db, COLLECTION, token);
    await updateDoc(docRef, { likedPropertyIds });
}

/**
 * Updates an existing catalog's property IDs.
 */
export async function updateCatalog(token: string, propertyIds: Array<string | { id: string; collectionPath: string }>): Promise<void> {
    const docRef = doc(db, COLLECTION, token);
    await updateDoc(docRef, {
        propertyIds,
        updatedAt: new Date() // track when it was last updated
    });
}

/**
 * Fetches only the liked property IDs for a catalog, used by the admin panel.
 */
export async function getCatalogsByLeadId(leadId: string, agencyId: string): Promise<import('../types').SharedCatalog[]> {
    const { getDocs, query: fsQuery, where, collection: col } = await import('firebase/firestore');
    const snap = await getDocs(
        fsQuery(col(db, COLLECTION), where('leadId', '==', leadId), where('agencyId', '==', agencyId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as import('../types').SharedCatalog));
}

/**
 * Fetch live property data for the given propertyIds from the secure Cloud Function.
 */
export async function getLiveCatalogProperties(catalogId: string, propertyIds: Array<string | { id: string; collectionPath: string }>): Promise<any[]> {
    if (!catalogId || !propertyIds || propertyIds.length === 0) return [];
    try {
        const fns = getFunctions(undefined, 'europe-west1');
        const getLivePropsFn = httpsCallable<
            { catalogId: string, propertyIds: Array<string | { id: string; collectionPath: string }> },
            { success: boolean, properties: any[] }
        >(fns, 'catalogs-getLiveProperties');

        const result = await getLivePropsFn({ catalogId, propertyIds });
        const data = result.data;

        if (data.success) {
            return data.properties || [];
        }
        return [];
    } catch (err: any) {
        console.error('Error fetching live properties for catalog:', err);
        return [];
    }
}

// Keeping this for backwards compatibility if any components still import it
export const getCatalogWithQueries = getCatalog;
export type { SharedCatalog } from '../types';
