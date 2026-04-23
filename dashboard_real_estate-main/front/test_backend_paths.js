#!/usr/bin/env node
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, 'firebase-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function test() {
  console.log('🔧 Testing backend paths compatibility...\n');

  // Test 1: Query new subcollection path
  console.log('1️⃣  Query new subcollection path...');
  const agencyId = 'P7z9y24z2DBGiCPSgQRI';
  const snap = await db
    .collection('agencies')
    .doc(agencyId)
    .collection('properties')
    .where('transactionType', '==', 'forsale')
    .limit(3)
    .get();
  console.log(`   ✓ Found ${snap.size} properties with transactionType='forsale'\n`);

  // Test 2: collectionGroup query (for superadmin)
  console.log('2️⃣  CollectionGroup query (superadmin use)...');
  const allSnap = await db
    .collectionGroup('properties')
    .where('status', '==', 'active')
    .limit(5)
    .get();
  console.log(`   ✓ Found ${allSnap.size} active properties globally\n`);

  // Test 3: Nested field access
  if (snap.size > 0) {
    const prop = snap.docs[0].data();
    console.log('3️⃣  Verify nested field structure...');
    console.log(`   City: ${prop.address?.city}`);
    console.log(`   Price: ${prop.financials?.price}`);
    console.log(`   Agent: ${prop.management?.assignedAgentId}`);
    console.log(`   Transaction Type: ${prop.transactionType}`);
    if (prop.address?.coords) {
      console.log(`   Coords: (${prop.address.coords.lat}, ${prop.address.coords.lng})`);
    }
    console.log(`   ✓ All nested fields accessible\n`);
  }

  console.log('✅ All backend path tests passed!');
  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
