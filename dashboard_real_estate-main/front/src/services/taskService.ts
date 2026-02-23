import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AppTask } from '../types';

const COLLECTION = 'tasks';

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * getLiveTasks — Real-time listener for tasks.
 *
 * Requirements:
 * - If isAdmin: fetch all tasks for the agency.
 * - If !isAdmin: fetch only tasks createdBy the current user.
 * - Order by dueDate ASC.
 *
 * *Developer Note:* Requires Composite Indexes in Firestore:
 * 1. (agencyId ASC, dueDate ASC)
 * 2. (agencyId ASC, createdBy ASC, dueDate ASC)
 */
export function getLiveTasks(
    agencyId: string,
    userId: string,
    isAdmin: boolean,
    callback: (tasks: AppTask[]) => void,
    onError?: (err: Error) => void
): () => void {
    let q;

    if (isAdmin) {
        q = query(
            collection(db, COLLECTION),
            where('agencyId', '==', agencyId),
            orderBy('dueDate', 'asc')
        );
    } else {
        q = query(
            collection(db, COLLECTION),
            where('agencyId', '==', agencyId),
            where('createdBy', '==', userId),
            orderBy('dueDate', 'asc')
        );
    }

    return onSnapshot(
        q,
        (snap) => {
            const tasks = snap.docs.map(
                (d) => ({ id: d.id, ...d.data() } as AppTask)
            );
            callback(tasks);
        },
        onError
    );
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function addTask(
    agencyId: string,
    data: Omit<AppTask, 'id' | 'agencyId' | 'createdAt'>
): Promise<string> {
    const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        agencyId,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateTask(
    taskId: string,
    updates: Partial<Omit<AppTask, 'id' | 'agencyId' | 'createdBy' | 'createdAt'>>
): Promise<void> {
    const ref = doc(db, COLLECTION, taskId);
    await updateDoc(ref, { ...updates });
}

export async function toggleTaskCompletion(
    taskId: string,
    isCompleted: boolean
): Promise<void> {
    const ref = doc(db, COLLECTION, taskId);
    await updateDoc(ref, {
        isCompleted,
        completedAt: isCompleted ? serverTimestamp() : null
    });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteTask(taskId: string): Promise<void> {
    const ref = doc(db, COLLECTION, taskId);
    await deleteDoc(ref);
}
