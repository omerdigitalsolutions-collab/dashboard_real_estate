import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../config/firebase';
import { FBLead, FBLeadStatus, FacebookScraperConfig, FBGroupSearchResult } from '../types';

/**
 * Real-time listener for an agency's scraped Facebook leads, newest first.
 */
export function getLiveFBLeads(
    agencyId: string,
    callback: (leads: FBLead[]) => void
): () => void {
    const q = query(
        collection(db, 'fb_leads'),
        where('agencyId', '==', agencyId),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FBLead, 'id'>) })));
    });
}

export async function updateFBLeadStatus(
    leadId: string,
    status: FBLeadStatus
): Promise<void> {
    await updateDoc(doc(db, 'fb_leads', leadId), { status });
}

export async function saveFBScraperConfig(
    agencyId: string,
    config: Omit<FacebookScraperConfig, 'updatedAt'>
): Promise<void> {
    await updateDoc(doc(db, 'agencies', agencyId), {
        facebookScraper: { ...config, updatedAt: serverTimestamp() },
    });
}

export async function searchFBGroups(
    query: string
): Promise<{ groups: FBGroupSearchResult[]; fromCache: boolean }> {
    const fn = httpsCallable<{ query: string }, { groups: FBGroupSearchResult[]; fromCache: boolean }>(
        getFunctions(undefined, 'europe-west1'),
        'facebook-searchFBGroups'
    );
    const result = await fn({ query });
    return result.data;
}
