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
import { ContractTemplate } from '../types';

const templatesCol = (agencyId: string) =>
    collection(db, `agencies/${agencyId}/contractTemplates`);

const templateDoc = (agencyId: string, templateId: string) =>
    doc(db, `agencies/${agencyId}/contractTemplates`, templateId);

export async function createTemplate(
    agencyId: string,
    data: {
        title: string;
        rawText: string;
        taggedText: string;
        fieldsMetadata: any[];
    },
    createdBy: string
): Promise<string> {
    const docRef = await addDoc(templatesCol(agencyId), {
        ...data,
        createdBy,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
    });
    return docRef.id;
}

export async function getTemplate(
    agencyId: string,
    templateId: string
): Promise<(ContractTemplate & { id: string }) | null> {
    const docSnap = await getDoc(templateDoc(agencyId, templateId));
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as ContractTemplate & { id: string };
}

export function getLiveTemplates(
    agencyId: string,
    callback: (templates: (ContractTemplate & { id: string })[]) => void,
    onError?: (err: Error) => void
): Unsubscribe {
    const q = query(templatesCol(agencyId), orderBy('createdAt', 'desc'));
    return onSnapshot(
        q,
        (snap) => {
            const templates = snap.docs.map(
                (doc) => ({ id: doc.id, ...doc.data() } as ContractTemplate & { id: string })
            );
            callback(templates);
        },
        (err) => {
            console.error('[contractTemplateService] Error fetching templates:', err);
            onError?.(err);
        }
    );
}

export async function updateTemplate(
    agencyId: string,
    templateId: string,
    updates: Partial<
        Pick<ContractTemplate, 'title' | 'rawText' | 'taggedText' | 'fieldsMetadata'>
    >
): Promise<void> {
    await updateDoc(templateDoc(agencyId, templateId), {
        ...updates,
        updatedAt: Timestamp.now()
    });
}

export async function deleteTemplate(agencyId: string, templateId: string): Promise<void> {
    await deleteDoc(templateDoc(agencyId, templateId));
}
