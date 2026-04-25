import {
    collection,
    doc,
    getDocs,
    addDoc,
    Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ContractTemplate } from '../types';

export interface SystemTemplate {
    id: string;
    title: string;
    description?: string;
    category?: string;
    rawText: string;
    taggedText: string;
    fieldsMetadata: ContractTemplate['fieldsMetadata'];
    createdAt: Timestamp;
}

export async function getSystemTemplates(): Promise<SystemTemplate[]> {
    const snap = await getDocs(collection(db, 'systemTemplates'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemTemplate));
}

export async function cloneSystemTemplate(
    agencyId: string,
    template: SystemTemplate,
    createdBy: string
): Promise<string> {
    const docRef = await addDoc(
        collection(db, `agencies/${agencyId}/contractTemplates`),
        {
            agencyId,
            title: template.title,
            rawText: template.rawText,
            taggedText: template.taggedText,
            fieldsMetadata: template.fieldsMetadata,
            createdBy,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        }
    );
    return docRef.id;
}
