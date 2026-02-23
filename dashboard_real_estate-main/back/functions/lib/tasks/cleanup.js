"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupTasksOnPropertyDelete = exports.cleanupTasksOnLeadDelete = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const db = (0, firestore_2.getFirestore)();
/**
 * Helper to delete all tasks related to a specific entity ID.
 */
async function cleanupRelatedTasks(entityId) {
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
exports.cleanupTasksOnLeadDelete = (0, firestore_1.onDocumentDeleted)('leads/{leadId}', async (event) => {
    const leadId = event.params.leadId;
    if (!leadId)
        return;
    await cleanupRelatedTasks(leadId);
});
/**
 * cleanupTasksOnPropertyDelete
 * Triggered when a document in the `properties` collection is deleted.
 * Finds and deletes all tasks where `relatedTo.id == propertyId`.
 */
exports.cleanupTasksOnPropertyDelete = (0, firestore_1.onDocumentDeleted)('properties/{propertyId}', async (event) => {
    const propertyId = event.params.propertyId;
    if (!propertyId)
        return;
    await cleanupRelatedTasks(propertyId);
});
//# sourceMappingURL=cleanup.js.map