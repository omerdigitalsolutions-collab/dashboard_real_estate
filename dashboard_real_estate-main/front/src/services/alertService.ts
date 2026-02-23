import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    query,
    where,
    serverTimestamp,
    onSnapshot,
    orderBy,
    limit
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Alert, AlertType } from '../types';

const COLLECTION = 'alerts';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Pushes a new alert to a specific agent, or broadcasts to all agents
 * in the agency by setting targetAgentId = 'all'.
 */
export async function addAlert(
    agencyId: string,
    data: Omit<Alert, 'id'>
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        agencyId,
        isRead: false,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

/**
 * Shorthand to broadcast an agency-wide alert.
 */
export async function broadcastAlert(
    agencyId: string,
    message: string,
    type: AlertType = 'info'
): Promise<string> {
    return addAlert(agencyId, {
        agencyId,
        targetAgentId: 'all',
        message,
        type,
        isRead: false,
    });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Returns all unread alerts for a given agent,
 * including both personal alerts and agency-wide broadcasts.
 */
export async function getUnreadAlerts(
    agencyId: string,
    agentId: string
): Promise<Alert[]> {
    // Personal alerts
    const personalQ = query(
        collection(db, COLLECTION),
        where('agencyId', '==', agencyId),
        where('targetAgentId', '==', agentId),
        where('isRead', '==', false)
    );

    // Broadcast alerts
    const broadcastQ = query(
        collection(db, COLLECTION),
        where('agencyId', '==', agencyId),
        where('targetAgentId', '==', 'all'),
        where('isRead', '==', false)
    );

    const [personalSnap, broadcastSnap] = await Promise.all([
        getDocs(personalQ),
        getDocs(broadcastQ),
    ]);

    const personal = personalSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Alert));
    const broadcast = broadcastSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Alert));

    // Deduplicate by id
    const seen = new Set<string>();
    return [...personal, ...broadcast].filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
    });
}

/**
 * Subscribes to new alerts in real-time.
 * Fetches the user's personal alerts and agency-wide broadcast alerts.
 */
export function getLiveAlerts(
    agencyId: string,
    agentId: string,
    limitNum: number = 20,
    callback: (alerts: Alert[]) => void,
    onError?: (err: Error) => void
): () => void {
    const q = query(
        collection(db, COLLECTION),
        where('agencyId', '==', agencyId),
        // Filter where targetAgentId is in [agentId, 'all']
        where('targetAgentId', 'in', [agentId, 'all']),
        orderBy('createdAt', 'desc'),
        limit(limitNum)
    );

    return onSnapshot(
        q,
        (snap) => {
            const alerts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Alert));
            callback(alerts);
        },
        onError
    );
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Marks a specific alert as read (dismisses the notification bubble).
 */
export async function markAlertAsRead(alertId: string): Promise<void> {
    const ref = doc(db, COLLECTION, alertId);
    await updateDoc(ref, { isRead: true });
}

/**
 * Marks all unread alerts for an agent as read in a single batch.
 */
export async function markAllAlertsAsRead(
    agencyId: string,
    agentId: string
): Promise<void> {
    const alerts = await getUnreadAlerts(agencyId, agentId);
    await Promise.all(alerts.map((a) => markAlertAsRead(a.id)));
}
