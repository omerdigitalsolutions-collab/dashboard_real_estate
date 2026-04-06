import admin from 'firebase-admin';

// Initialize with the project ID
admin.initializeApp({
  projectId: 'dashboard-6f9d1'
});

const db = admin.firestore();

const OLD_VARIANTS = ['מודיעין', 'מודיעין-מכבים-רעות'];
const NEW_NAME = 'מודיעין מכבים רעות';

async function migrate() {
  console.log('Starting migration...');

  // 1. Properties
  const props = await db.collection('properties').where('city', 'in', OLD_VARIANTS).get();
  console.log(`Found ${props.size} properties in main collection to update.`);
  for (const doc of props.docs) {
    await doc.ref.update({ city: NEW_NAME });
    console.log(`Updated property: ${doc.id}`);
  }

  // 2. Leads (desiredCity array)
  const leads = await db.collection('leads').get();
  let updatedLeads = 0;
  for (const doc of leads.docs) {
    const data = doc.data();
    const desired = data.requirements?.desiredCity;
    if (Array.isArray(desired)) {
      const hasOld = desired.some(c => OLD_VARIANTS.includes(c));
      if (hasOld) {
        const cleaned = desired.map(c => OLD_VARIANTS.includes(c) ? NEW_NAME : c);
        const unique = [...new Set(cleaned)];
        await doc.ref.update({ 'requirements.desiredCity': unique });
        updatedLeads++;
      }
    }
  }
  console.log(`Updated ${updatedLeads} leads.`);

  // 3. Global Cities Catalog
  for (const oldVariant of OLD_VARIANTS) {
    const oldCityRef = db.collection('cities').doc(oldVariant);
    const subProps = await oldCityRef.collection('properties').get();
    
    if (subProps.empty) {
        console.log(`No global properties found for city variant: ${oldVariant}`);
        continue;
    }
    
    console.log(`Moving ${subProps.size} global properties from cities/${oldVariant} to cities/${NEW_NAME}`);
    
    const newCityRef = db.collection('cities').doc(NEW_NAME);
    
    for (const doc of subProps.docs) {
      const data = doc.data();
      data.city = NEW_NAME;
      await newCityRef.collection('properties').doc(doc.id).set(data);
      await doc.ref.delete();
    }
    
    // Check if there are other subcollections (e.g. from firestore.rules: cities/{cityId}/properties/{propertyId})
    // We already handled 'properties'.
    
    await oldCityRef.delete();
    console.log(`Deleted obsolete city document: ${oldVariant}`);
  }

  console.log('🎉 Migration completed successfully!');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
