import * as admin from 'firebase-admin';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FIRESTORE MIGRATION TEMPLATE (hOMER)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Use this template to perform bulk updates on Firestore collections.
 *
 * HOW TO USE:
 * 1. Duplicate this file and rename it (e.g., m20240404_add_isArchived_to_leads.ts).
 * 2. Update the COLLECTION_NAME and the update logic within the loop.
 * 3. Run via terminal:
 *    npx ts-node back/scripts/your_migration_file.ts
 *
 * SAFEGUARDS:
 * - Batched writes (450 docs per batch).
 * - Pre-check to avoid redundant writes (if data[FIELD] === undefined).
 * - Console progress logging.
 */

// 1. Initialize Firebase Admin SDK
// This will use default credentials if running in a managed environment
// or credentials from GOOGLE_APPLICATION_CREDENTIALS locally.
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const db = admin.firestore();

async function runMigration() {
    // --- SETTINGS ---
    const COLLECTION_NAME = 'leads'; // Change this
    const FIELD_TO_ADD = 'isArchived'; // Change this
    const DEFAULT_VALUE = false; // Change this
    // ----------------

    console.log(`🚀 Starting migration: Adding '${FIELD_TO_ADD}' to collection '${COLLECTION_NAME}'...`);

    try {
        const snapshot = await db.collection(COLLECTION_NAME).get();
        console.log(`📄 Found ${snapshot.size} documents to check.`);

        let batch = db.batch();
        let processedCount = 0;
        let updatedCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();

            // Only update if the field is missing (Standard safety check)
            if (data[FIELD_TO_ADD] === undefined) {
                batch.update(doc.ref, { [FIELD_TO_ADD]: DEFAULT_VALUE });
                updatedCount++;
            }

            processedCount++;

            // Commit batch every 450 documents (limit is 500)
            if (processedCount % 450 === 0) {
                await batch.commit();
                batch = db.batch(); // Reset for next chunk
                console.log(`⏳ Progress: ${processedCount}/${snapshot.size} processed...`);
            }
        }

        // Final commit for the remaining documents in the last batch
        if (updatedCount > 0 && processedCount % 450 !== 0) {
            await batch.commit();
        }

        console.log(`\n✨ Migration Finished!`);
        console.log(`   - Total Processed: ${processedCount}`);
        console.log(`   - Total Updated:   ${updatedCount}`);
        console.log(`\n✅ Database is now up to date.`);

    } catch (error) {
        console.error('❌ MIGRATION FAILED:', error);
        process.exit(1);
    }
}

// Execute migration
runMigration();
