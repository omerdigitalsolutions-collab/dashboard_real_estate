import admin from 'firebase-admin';

// Initialize with the project ID from touchCities.mjs
admin.initializeApp({
  projectId: 'dashboard-6f9d1'
});

const db = admin.firestore();

const OLD_CITY_ID = 'Tel Aviv | תל אביב יפו';
const NEW_CITY_ID = 'תל אביב יפו';

const OLD_PATH = `cities/${OLD_CITY_ID}/properties`;
const NEW_PATH = `cities/${NEW_CITY_ID}/properties`;

async function migrate() {
    console.log(`Starting migration: [${OLD_CITY_ID}] -> [${NEW_CITY_ID}]`);
    
    // 1. Ensure target city document exists and is NOT a phantom
    console.log(`Ensuring city document [${NEW_CITY_ID}] exists...`);
    await db.collection('cities').doc(NEW_CITY_ID).set({
        exists: true,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        name: NEW_CITY_ID
    }, { merge: true });
    
    // 2. Scan all properties in the old path
    const snap = await db.collection(OLD_PATH).get();
    console.log(`Found ${snap.size} properties at [${OLD_PATH}].`);
    
    if (snap.empty) {
        console.log('Nothing to migrate.');
        return;
    }

    const batchLimit = 400;
    let count = 0;
    const docs = snap.docs;

    for (let i = 0; i < docs.length; i += batchLimit) {
        const chunk = docs.slice(i, i + batchLimit);
        const batch = db.batch();
        
        chunk.forEach(doc => {
            const data = doc.data();
            // Update the city field inside the property object to the new clean name
            const newData = { 
                ...data, 
                city: NEW_CITY_ID,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            const newRef = db.collection(NEW_PATH).doc(doc.id);
            batch.set(newRef, newData);
            
            // Delete from old location
            batch.delete(doc.ref);
            count++;
        });
        
        await batch.commit();
        console.log(`Processed ${count}/${snap.size} properties...`);
    }
    
    // 3. Optional: Delete the old city document if it's empty
    // (Note: it was a phantom document anyway, but we can explicitly delete the ID)
    await db.collection('cities').doc(OLD_CITY_ID).delete();
    
    console.log('Migration finished successfully!');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
