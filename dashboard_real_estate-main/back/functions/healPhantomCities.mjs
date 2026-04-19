import admin from 'firebase-admin';

/**
 * Maintenance script to "heal" phantom documents in the 'cities' collection.
 * A phantom document is a parent document that doesn't exist but has subcollections.
 * These phantoms are ignored by collection-wide queries like onSnapshot(collection(db, 'cities')).
 */

admin.initializeApp({
  projectId: 'dashboard-6f9d1'
});

const db = admin.firestore();

async function heal() {
    console.log('--- Starting Phantom City Healing ---');
    const citiesRef = db.collection('cities');
    
    // listDocuments() returns all document references in the collection, 
    // including those that are only "stubs" for subcollections (phantoms).
    const cityRefs = await citiesRef.listDocuments();
    console.log(`Checking ${cityRefs.length} city document references...`);

    let healedCount = 0;
    let skippedCount = 0;
    const batchLimit = 400;
    let batch = db.batch();
    let currentBatchSize = 0;

    for (const cityRef of cityRefs) {
        // Fetch the document to see if it actually exists
        const snap = await cityRef.get();
        
        if (!snap.exists) {
            // It's a phantom reference. Now check if it actually has properties.
            // We only want to heal cities that contain data.
            const propsSnap = await cityRef.collection('properties').limit(1).get();
            
            if (!propsSnap.empty) {
                console.log(`[FIX] Healing phantom city: "${cityRef.id}"`);
                batch.set(cityRef, {
                    name: cityRef.id,
                    exists: true,
                    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                healedCount++;
                currentBatchSize++;

                if (currentBatchSize >= batchLimit) {
                    await batch.commit();
                    batch = db.batch();
                    currentBatchSize = 0;
                    console.log(`Interim batch committed...`);
                }
            } else {
                // It's an empty phantom, likely remnants of previous deletions or testing.
                skippedCount++;
            }
        }
    }

    if (currentBatchSize > 0) {
        await batch.commit();
    }

    console.log('-------------------------------------');
    console.log(`Healing Summary:`);
    console.log(`- Total Fixed:   ${healedCount}`);
    console.log(`- Empty Stubs:   ${skippedCount}`);
    console.log(`- Cities OK:     ${cityRefs.length - healedCount - skippedCount}`);
    console.log('Done.');
}

heal().catch(err => {
    console.error('Healing script failed:', err);
    process.exit(1);
});
