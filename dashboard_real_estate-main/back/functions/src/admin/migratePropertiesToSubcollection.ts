/**
 * ONE-TIME migration: copies all documents from the root `properties` collection
 * into `agencies/{agencyId}/properties/{id}` subcollections, applying the new
 * nested schema via migratePropertyDoc().
 *
 * Safe to re-run — uses { merge: false } to overwrite, so results are idempotent.
 * Does NOT delete the old collection (leave in place for 2 weeks as fallback).
 *
 * Invoke via: firebase functions:shell or a superadmin HTTP trigger.
 */

import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { migratePropertyDoc } from '../utils/propertyMigrator';

const db = admin.firestore();
const BATCH_SIZE = 400;

export const migratePropertiesToSubcollection = onCall(
    { region: 'europe-west1' },
    async (request) => {
        // Restrict to super-admins only
        const token = request.auth?.token;
        if (!token || token.role !== 'super_admin') {
            throw new Error('Only super-admins can run migration');
        }

        const agencyId: string | undefined = request.data?.agencyId;

        let baseQuery: admin.firestore.Query = db.collection('properties');
        if (agencyId) {
            baseQuery = baseQuery.where('agencyId', '==', agencyId);
        }

        const snap = await baseQuery.get();
        if (snap.empty) {
            return { migrated: 0, message: 'No documents to migrate.' };
        }

        let migrated = 0;
        let batch = db.batch();
        let batchCount = 0;

        for (const doc of snap.docs) {
            const data = doc.data();
            const aid = data.agencyId;
            if (!aid) {
                console.warn(`Skipping ${doc.id} — missing agencyId`);
                continue;
            }

            const newData = migratePropertyDoc(data, doc.id);
            // Remove id from stored doc (it's the document ID)
            const { id: _id, ...storedData } = newData as any;

            const newRef = db
                .collection('agencies')
                .doc(aid)
                .collection('properties')
                .doc(doc.id);

            batch.set(newRef, storedData);
            batchCount++;
            migrated++;

            if (batchCount >= BATCH_SIZE) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        console.log(`Migration complete: ${migrated} properties moved.`);
        return { migrated, message: `Migrated ${migrated} properties to subcollections.` };
    }
);
