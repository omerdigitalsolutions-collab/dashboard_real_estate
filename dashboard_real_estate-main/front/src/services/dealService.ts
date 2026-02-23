import {
    collection,
    addDoc,
    updateDoc,
    doc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    deleteDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Deal, DealStage } from '../types';

const COLLECTION = 'deals';

// ─── Create ───────────────────────────────────────────────────────────────────

export async function addDeal(
    agencyId: string,
    data: Omit<Deal, 'id' | 'agencyId' | 'createdAt'>
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        agencyId,
        createdAt: serverTimestamp(),
    });
    return ref.id;
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
    const ref = doc(db, COLLECTION, dealId);
    const updates: any = {
        stage: newStage,
        updatedAt: serverTimestamp()
    };

    if (actualCommission !== undefined) {
        updates.actualCommission = actualCommission;
    }

    await updateDoc(ref, updates as any);
}

export async function updateDeal(
    dealId: string,
    updates: Partial<Omit<Deal, 'id' | 'agencyId' | 'createdAt'>>
): Promise<void> {
    const ref = doc(db, COLLECTION, dealId);
    await updateDoc(ref, {
        ...updates,
        updatedAt: serverTimestamp()
    });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteDeal(dealId: string): Promise<void> {
    const ref = doc(db, COLLECTION, dealId);
    await deleteDoc(ref);
}
