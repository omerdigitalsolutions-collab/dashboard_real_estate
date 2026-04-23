#!/usr/bin/env node
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, 'firebase-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function verify() {
  console.log('🔍 Verifying migration...\n');

  // Get an agency with migrated properties
  const agenciesSnap = await db.collection('agencies').get();
  const agenciesWithProps = [];

  for (const agencyDoc of agenciesSnap.docs) {
    const propsSnap = await db
      .collection('agencies')
      .doc(agencyDoc.id)
      .collection('properties')
      .limit(1)
      .get();

    if (!propsSnap.empty) {
      agenciesWithProps.push({ agencyId: agencyDoc.id, name: agencyDoc.data().name });
    }
  }

  console.log(`Found ${agenciesWithProps.length} agencies with properties\n`);

  // Check sample property from first agency
  if (agenciesWithProps.length > 0) {
    const sample = agenciesWithProps[0];
    const propSnap = await db
      .collection('agencies')
      .doc(sample.agencyId)
      .collection('properties')
      .limit(1)
      .get();

    if (!propSnap.empty) {
      const prop = propSnap.docs[0];
      console.log(`📍 Sample property from "${sample.name || 'unnamed'}"\n`);
      console.log(`   Path: agencies/${sample.agencyId}/properties/${prop.id}`);
      console.log(`   Schema:`);
      console.log(JSON.stringify(prop.data(), null, 2));
    }
  }

  // Count total properties across all agencies
  let totalCount = 0;
  for (const agency of agenciesWithProps) {
    const count = await db
      .collection('agencies')
      .doc(agency.agencyId)
      .collection('properties')
      .count()
      .get();
    totalCount += count.data().count;
  }

  console.log(`\n✅ Total properties in new subcollection: ${totalCount}`);
  process.exit(0);
}

verify().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
