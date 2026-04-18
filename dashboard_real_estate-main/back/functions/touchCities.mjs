import admin from 'firebase-admin';

// Initialize with the project ID
admin.initializeApp({
  projectId: 'dashboard-6f9d1'
});

const db = admin.firestore();

async function run() {
  const cityPath = 'Tel Aviv | תל אביב יפו';
  console.log(`Touching city: ${cityPath}...`);
  
  const cityRef = db.collection('cities').doc(cityPath);
  
  // We explicitly use set with merge to create the document if it doesn't exist
  // adding a simple field to make it a 'real' document.
  await cityRef.set({
    exists: true,
    name: cityPath,
    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  console.log('Successfully touched city document!');
  
  // Optional: scan for other suspected phantom cities if needed, 
  // but for now we fix the reported one.
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
