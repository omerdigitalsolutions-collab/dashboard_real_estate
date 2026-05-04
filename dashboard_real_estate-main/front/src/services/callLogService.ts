import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    getDocs,
    limit,
    Timestamp,
    Unsubscribe,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { CallLog } from '../types';

/** Live subscription to missed calls for an agency today. */
export const getLiveMissedCalls = (
    agencyId: string,
    callback: (logs: CallLog[]) => void
): Unsubscribe => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const q = query(
        collection(db, 'callLogs'),
        where('agencyId', '==', agencyId),
        where('status', '==', 'missed'),
        where('createdAt', '>=', Timestamp.fromDate(todayStart)),
        orderBy('createdAt', 'desc'),
        limit(100)
    );

    return onSnapshot(q, (snap) => {
        const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallLog));
        callback(logs);
    });
};

/** Fetches all call logs for a specific lead (one-time). */
export const getCallLogsForLead = async (leadId: string): Promise<CallLog[]> => {
    const q = query(
        collection(db, 'callLogs'),
        where('leadId', '==', leadId),
        orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallLog));
};

/**
 * Generates a short-lived download URL for a call recording.
 * MUST be called lazily — only when the user clicks Play —
 * to avoid creating hundreds of signed URLs on list load.
 */
export const getRecordingDownloadUrl = async (storagePath: string): Promise<string> => {
    const fileRef = ref(storage, storagePath);
    return getDownloadURL(fileRef);
};
