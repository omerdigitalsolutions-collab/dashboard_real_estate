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
import { deleteCalendarEvent } from './calendarService';

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
        // Agents see tasks they created OR tasks explicitly assigned to them by an admin.
        // Firestore doesn't support OR queries on different fields in one query,
        // so we run two queries in parallel and merge the results.
        const qCreated = query(
            collection(db, COLLECTION),
            where('agencyId', '==', agencyId),
            where('createdBy', '==', userId),
            orderBy('dueDate', 'asc')
        );

        const qAssigned = query(
            collection(db, COLLECTION),
            where('agencyId', '==', agencyId),
            where('assignedToAgentId', '==', userId),
            orderBy('dueDate', 'asc')
        );

        let createdTasks: AppTask[] = [];
        let assignedTasks: AppTask[] = [];

        const mergeAndCallback = () => {
            const seen = new Set<string>();
            const merged = [...createdTasks, ...assignedTasks].filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
            merged.sort((a: any, b: any) => {
                const aTime = a.dueDate?.toMillis ? a.dueDate.toMillis() : 0;
                const bTime = b.dueDate?.toMillis ? b.dueDate.toMillis() : 0;
                return aTime - bTime;
            });
            callback(merged);
        };

        const unsubCreated = onSnapshot(qCreated,
            (snap) => { createdTasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppTask)); mergeAndCallback(); },
            onError
        );
        const unsubAssigned = onSnapshot(qAssigned,
            (snap) => { assignedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppTask)); mergeAndCallback(); },
            onError
        );

        return () => { unsubCreated(); unsubAssigned(); };
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

/**
 * deleteTask — Deletes a task from the system.
 * If the task is linked to a Google Calendar event, it delegates the deletion
 * to the backend Cloud Function to ensure synchronized cleanup.
 */
export async function deleteTask(task: AppTask): Promise<void> {
    try {
        if (task.googleEventId) {
            // Use the Cloud Function for synchronized deletion (API + DB)
            await deleteCalendarEvent(task.id);
        } else {
            // Local-only task: delete directly from Firestore
            const ref = doc(db, COLLECTION, task.id);
            await deleteDoc(ref);
        }
    } catch (error) {
        console.error('Error in deleteTask:', error);
        throw new Error('שגיאה במחיקת המשימה. אנא נסה שוב.');
    }
}
