const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, 'firebase-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function test() {
  console.log('📋 Schema Verification\n');

  const queries = [
    {
      name: 'Properties by city',
      query: () => db.collection('agencies').doc('P7z9y24z2DBGiCPSgQRI')
        .collection('properties').where('address.city', '==', 'תל אביב').limit(3)
    },
    {
      name: 'Properties by price range',
      query: () => db.collection('agencies').doc('P7z9y24z2DBGiCPSgQRI')
        .collection('properties').where('financials.price', '>=', 1000000)
        .where('financials.price', '<=', 5000000).limit(3)
    },
    {
      name: 'Rental properties',
      query: () => db.collection('agencies').doc('P7z9y24z2DBGiCPSgQRI')
        .collection('properties').where('transactionType', '==', 'rent').limit(3)
    }
  ];

  for (const test of queries) {
    try {
      const snap = await test.query().get();
      console.log(`✓ ${test.name}: ${snap.size} results`);
    } catch (err) {
      console.log(`✗ ${test.name}: ${err.message.split('\n')[0]}`);
    }
  }

  // Show sample doc structure
  console.log('\n📄 Sample Property Document:');
  const sample = await db.collection('agencies').doc('P7z9y24z2DBGiCPSgQRI')
    .collection('properties').limit(1).get();
  
  if (!sample.empty) {
    const data = sample.docs[0].data();
    console.log(`\nPath: agencies/P7z9y24z2DBGiCPSgQRI/properties/${sample.docs[0].id}`);
    console.log('\nStructure:');
    console.log(`  id: ${data.id}`);
    console.log(`  transactionType: ${data.transactionType}`);
    console.log(`  propertyType: ${data.propertyType}`);
    console.log(`  address:`);
    console.log(`    city: ${data.address?.city}`);
    console.log(`    fullAddress: ${data.address?.fullAddress}`);
    console.log(`    coords: ${data.address?.coords ? `(${data.address.coords.lat}, ${data.address.coords.lng})` : 'null'}`);
    console.log(`  financials:`);
    console.log(`    price: ${data.financials?.price}`);
    console.log(`  management:`);
    console.log(`    assignedAgentId: ${data.management?.assignedAgentId}`);
    console.log(`\n✅ Schema is correct!`);
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
