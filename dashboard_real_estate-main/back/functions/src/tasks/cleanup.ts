import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Helper to delete all tasks related to a specific entity ID.
 */
async function cleanupRelatedTasks(entityId: string) {
    const tasksRef = db.collection('tasks');
    // Note: We use query without agencyId here because the relatedTo.id is unique enough.
    // Ensure the client structure passes relatedTo: { id: entityId, type: 'lead'|'property' }
    const q = tasksRef.where('relatedTo.id', '==', entityId);

    const snapshot = await q.get();

    if (snapshot.empty) {
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
}

/**
 * cleanupTasksOnLeadDelete
 * Triggered when a document in the `leads` collection is deleted.
 * Finds and deletes all tasks where `relatedTo.id == leadId`.
 */
export const cleanupTasksOnLeadDelete = onDocumentDeleted(
    'leads/{leadId}',
    async (event) => {
        const leadId = event.params.leadId;
        if (!leadId) return;

        await cleanupRelatedTasks(leadId);
    }
);

/**
 * cleanupTasksOnPropertyDelete
 * Triggered when a document in the `properties` collection is deleted.
 * Finds and deletes all tasks where `relatedTo.id == propertyId`.
 */
export const cleanupTasksOnPropertyDelete = onDocumentDeleted(
    'properties/{propertyId}',
    async (event) => {
        const propertyId = event.params.propertyId;
        if (!propertyId) return;

        await cleanupRelatedTasks(propertyId);
    }
);
