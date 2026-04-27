import {
    collection,
    doc,
    addDoc,
    updateDoc,
    getDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { Contract, Field } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const contractsCol = (agencyId: string) =>
    collection(db, `agencies/${agencyId}/contracts`);

const contractDoc = (agencyId: string, contractId: string) =>
    doc(db, `agencies/${agencyId}/contracts`, contractId);

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Uploads a PDF file to Storage and creates a draft Contract document
 * in Firestore. Returns the new Firestore document reference.
 *
 * Storage path: agencies/{agencyId}/contracts/originals/{timestamp}_{filename}
 */
export async function createContractFromPDF(
    agencyId: string,
    file: File,
    createdBy: string,
    dealId?: string
): Promise<{ contractId: string; pdfUrl: string }> {
    // 1. Upload original PDF to Storage
    const storagePath = `agencies/${agencyId}/contracts/originals/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);

    await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file, { contentType: 'application/pdf' });
        task.on('state_changed', null, reject, () => resolve());
    });

    const pdfUrl = await getDownloadURL(storageRef);

    // 2. Create Firestore document
    const data: any = {
        agencyId,
        ...(dealId ? { dealId } : {}),
        source: 'pdf_upload',
        originalFileUrl: pdfUrl,
        status: 'draft',
        fields: [],
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(contractsCol(agencyId), data);
    return { contractId: docRef.id, pdfUrl };
}

/**
 * Uploads an image (scan) to Storage and creates a draft Contract document.
 */
export async function createContractFromImage(
    agencyId: string,
    file: File,
    createdBy: string,
    dealId?: string
): Promise<{ contractId: string; imageUrl: string }> {
    const storagePath = `agencies/${agencyId}/contracts/scans/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);

    await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
        task.on('state_changed', null, reject, () => resolve());
    });

    const imageUrl = await getDownloadURL(storageRef);

    const data: any = {
        agencyId,
        ...(dealId ? { dealId } : {}),
        source: 'scan',
        originalFileUrl: imageUrl,
        status: 'draft',
        fields: [],
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(contractsCol(agencyId), data);
    return { contractId: docRef.id, imageUrl };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a single contract document.
 * Returns null if the document does not exist.
 */
export async function getContract(
    agencyId: string,
    contractId: string
): Promise<(Contract & { id: string }) | null> {
    const snap = await getDoc(contractDoc(agencyId, contractId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Contract) };
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Overwrites the fields array for a contract.
 * Called by the editor whenever the agent repositions or adds/removes a field.
 * Throws if the contract is already completed (immutable after signing).
 */
export async function updateContractFields(
    agencyId: string,
    contractId: string,
    fields: Field[]
): Promise<void> {
    const snap = await getDoc(contractDoc(agencyId, contractId));

    if (!snap.exists()) throw new Error('Contract not found.');

    const current = snap.data() as Contract;
    if (current.status === 'completed') {
        throw new Error('Cannot edit a contract that has already been signed.');
    }

    await updateDoc(contractDoc(agencyId, contractId), {
        fields,
        updatedAt: serverTimestamp(),
    });
}

/**
 * Real-time listener for all contracts in an agency, ordered by creation date.
 * Returns an unsubscribe function.
 */
export function getLiveContracts(
    agencyId: string,
    callback: (contracts: (Contract & { id: string })[]) => void,
    onError?: (err: Error) => void
): () => void {
    if (!agencyId) {
        callback([]);
        return () => { };
    }

    try {
        const q = query(contractsCol(agencyId), orderBy('createdAt', 'desc'));

        return onSnapshot(
            q,
            snap => {
                const contracts = snap.docs.map(d => ({
                    id: d.id,
                    ...(d.data() as Contract),
                }));
                callback(contracts);
            },
            (err) => {
                console.error(`[contractService] getLiveContracts error for ${agencyId}:`, err);
                if (onError) onError(err);
            }
        );
    } catch (e: any) {
        console.error(`[contractService] Synchronous error in getLiveContracts for ${agencyId}:`, e);
        if (onError) onError(e);
        return () => { };
    }
}

/**
 * Links a contract to a deal by writing the contractId and pdfUrl
 * into the deal's `contract` sub-field.
 */
export async function linkContractToDeal(
    dealId: string,
    contractId: string,
    pdfUrl: string
): Promise<void> {
    await updateDoc(doc(db, 'deals', dealId), {
        contract: {
            contractId,
            pdfUrl,
            status: 'pending',
        },
        updatedAt: serverTimestamp(),
    });
}
