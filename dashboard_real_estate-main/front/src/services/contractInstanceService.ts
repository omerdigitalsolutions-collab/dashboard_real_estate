import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    onSnapshot,
    Unsubscribe,
    Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ContractInstance } from '../types';

const instancesCol = (agencyId: string) =>
    collection(db, `agencies/${agencyId}/contractInstances`);

const instanceDoc = (agencyId: string, instanceId: string) =>
    doc(db, `agencies/${agencyId}/contractInstances`, instanceId);

export async function createInstance(
    agencyId: string,
    templateId: string,
    initialValues: Record<string, string>,
    createdBy: string,
    dealId?: string,
    leadId?: string
): Promise<string> {
    const docRef = await addDoc(instancesCol(agencyId), {
        agencyId,
        templateId,
        ...(dealId ? { dealId } : {}),
        ...(leadId ? { leadId } : {}),
        status: 'draft',
        values: initialValues,
        createdBy,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
    });
    return docRef.id;
}

export async function getInstance(
    agencyId: string,
    instanceId: string
): Promise<(ContractInstance & { id: string }) | null> {
    const docSnap = await getDoc(instanceDoc(agencyId, instanceId));
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as ContractInstance & { id: string };
}

export function getLiveInstances(
    agencyId: string,
    callback: (instances: (ContractInstance & { id: string })[]) => void,
    onError?: (err: Error) => void
): Unsubscribe {
    const q = query(instancesCol(agencyId), orderBy('createdAt', 'desc'));
    return onSnapshot(
        q,
        (snap) => {
            const instances = snap.docs.map(
                (doc) => ({ id: doc.id, ...doc.data() } as ContractInstance & { id: string })
            );
            callback(instances);
        },
        (err) => {
            console.error('[contractInstanceService] Error fetching instances:', err);
            onError?.(err);
        }
    );
}

export async function updateInstanceValues(
    agencyId: string,
    instanceId: string,
    values: Record<string, string>
): Promise<void> {
    await updateDoc(instanceDoc(agencyId, instanceId), {
        values,
        updatedAt: Timestamp.now()
    });
}

export async function markInstanceSent(agencyId: string, instanceId: string): Promise<void> {
    await updateDoc(instanceDoc(agencyId, instanceId), {
        status: 'sent',
        updatedAt: Timestamp.now()
    });
}

export async function markInstanceSigned(agencyId: string, instanceId: string): Promise<void> {
    await updateDoc(instanceDoc(agencyId, instanceId), {
        status: 'signed',
        updatedAt: Timestamp.now()
    });
}

export async function deleteInstance(agencyId: string, instanceId: string): Promise<void> {
    await deleteDoc(instanceDoc(agencyId, instanceId));
}
