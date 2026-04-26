import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Property, SearchAlert } from '../types';

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
const NLS_URL = `https://europe-west1-${PROJECT_ID}.cloudfunctions.net/properties-processNaturalLanguageSearch`;

export type SortBy = 'newest' | 'oldest' | 'price_asc' | 'price_desc';

export interface ExploreFilters {
    city?: string;
    minPrice?: number;
    maxPrice?: number;
    minRooms?: number;
    maxRooms?: number;
    propertyType?: string;
    transactionType?: 'forsale' | 'rent';
}

export interface SearchResult {
    properties: Property[];
    totalCount: number;
    page: number;
    parsedFilters: SearchAlert['filters'];
}

export async function searchPublicProperties(
    query: string,
    filters: ExploreFilters = {},
    sortBy: SortBy = 'newest',
    page = 0,
    pageSize = 12
): Promise<SearchResult> {
    const res = await fetch(NLS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...filters, sortBy, page, pageSize }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || `Search failed (${res.status})`);
    }

    return res.json() as Promise<SearchResult>;
}

export async function createSearchAlert(
    phone: string,
    filters: SearchAlert['filters']
): Promise<void> {
    await addDoc(collection(db, 'searchAlerts'), {
        phone,
        filters,
        active: true,
        createdAt: serverTimestamp(),
    });
}
