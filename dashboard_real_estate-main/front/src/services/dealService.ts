import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Deal, DealStage } from '../types';
import { getFunctions, httpsCallable } from 'firebase/functions';

const COLLECTION = 'deals';

// ─── Create ───────────────────────────────────────────────────────────────────

export async function addDeal(
    agencyId: string,
    data: Omit<Deal, 'id' | 'agencyId' | 'createdAt'>
): Promise<string> {
    const functions = getFunctions(undefined, 'europe-west1');
    const addDealFn = httpsCallable<any, { success: boolean; id: string }>(
        functions,
        'deals-addDeal'
    );
    const result = await addDealFn({ ...data, agencyId });
    return result.data.id;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Real-time listener for Deals.
 * Requires Composite Index: (agencyId ASC, createdAt DESC)
 * Grouping into columns is done client-side to avoid N+1 and complex queries.
 */
export function getLiveDeals(
    agencyId: string,
    callback: (deals: Deal[]) => void,
    onError?: (err: Error) => void
): () => void {
    const q = query(
        collection(db, COLLECTION),
        where('agencyId', '==', agencyId),
        orderBy('createdAt', 'desc')
    );

    return onSnapshot(
        q,
        (snap) => {
            const deals = snap.docs.map(
                (d) => ({ id: d.id, ...d.data() } as Deal)
            );
            callback(deals);
        },
        onError
    );
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Optimized updateDoc for stage changes (Kanban drag & drop).
 * Optionally accepts actualCommission if dropping into 'won'.
 */
export async function updateDealStage(
    dealId: string,
    newStage: DealStage,
    actualCommission?: number
): Promise<void> {
    const functions = getFunctions(undefined, 'europe-west1');
    const updateDealFn = httpsCallable<any, { success: boolean }>(
        functions,
        'deals-updateDeal'
    );
    
    const updates: any = {
        stage: newStage
    };

    if (actualCommission !== undefined) {
        updates.actualCommission = actualCommission;
    }

    await updateDealFn({ dealId, updates });
}

export async function updateDeal(
    dealId: string,
    updates: Partial<Omit<Deal, 'id' | 'agencyId' | 'createdAt'>>
): Promise<void> {
    const functions = getFunctions(undefined, 'europe-west1');
    const updateDealFn = httpsCallable<any, { success: boolean }>(
        functions,
        'deals-updateDeal'
    );
    await updateDealFn({ dealId, updates });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteDeal(dealId: string): Promise<void> {
    const functions = getFunctions(undefined, 'europe-west1');
    const deleteDealFn = httpsCallable<any, { success: boolean }>(
        functions,
        'deals-deleteDeal'
    );
    await deleteDealFn({ dealId });
}
