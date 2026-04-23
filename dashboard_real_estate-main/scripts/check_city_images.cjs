const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, '..', 'firebase-key.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function check() {
  const citiesSnap = await db.collection('cities').limit(5).get();
  
  for (const cityDoc of citiesSnap.docs) {
    const propsSnap = await db.collection('cities').doc(cityDoc.id).collection('properties').limit(3).get();
    if (propsSnap.empty) continue;
    
    console.log(`\nCity: ${cityDoc.id}`);
    for (const p of propsSnap.docs) {
      const d = p.data();
      const imageFields = Object.keys(d).filter(k => 
        k.toLowerCase().includes('image') || k.toLowerCase().includes('photo') || 
        k.toLowerCase().includes('pic') || k.toLowerCase().includes('media')
      );
      console.log(`  Property ${p.id}:`);
      imageFields.forEach(f => {
        const val = d[f];
        if (Array.isArray(val)) console.log(`    ${f}: [${val.length} items] → ${val[0]?.substring(0, 80) || '(empty)'}...`);
        else if (typeof val === 'object') console.log(`    ${f}: {${Object.keys(val).join(', ')}}`);
        else console.log(`    ${f}: ${String(val).substring(0, 80)}`);
      });
      if (imageFields.length === 0) console.log(`    (no image fields found) keys: ${Object.keys(d).join(', ')}`);
    }
  }
  process.exit(0);
}

check().catch(e => { console.error(e.message); process.exit(1); });
