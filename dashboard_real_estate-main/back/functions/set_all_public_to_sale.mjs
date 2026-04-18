import admin from 'firebase-admin';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

// Load the refresh token stored by firebase CLI
const fbConfig = JSON.parse(
  readFileSync(path.join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8')
);
const { refresh_token } = fbConfig.tokens;

// Firebase CLI's well-known OAuth2 client credentials (public)
const client = new UserRefreshClient(
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  'j9iVZfS8hhqkLclcR1NcpKXC',
  refresh_token
);

admin.initializeApp({
  credential: {
    getAccessToken: async () => {
      const token = await client.getAccessToken();
      return { access_token: token.token, expires_in: 3600 };
    }
  },
  projectId: 'dashboard-6f9d1'
});

const db = admin.firestore();

async function setAllPublicPropertiesToSale() {
  console.log('Starting migration: setting all public properties type → "sale"...');

  // 1. List all city documents
  const citiesSnap = await db.collection('cities').get();
  console.log(`Found ${citiesSnap.size} city documents.`);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const cityDoc of citiesSnap.docs) {
    const cityName = cityDoc.id;
    const propsSnap = await db
      .collection('cities')
      .doc(cityName)
      .collection('properties')
      .get();

    if (propsSnap.empty) continue;

    // Process in batches of 400 (Firestore limit is 500)
    const toUpdate = propsSnap.docs.filter(d => d.data().type !== 'sale');
    totalSkipped += propsSnap.size - toUpdate.length;

    if (toUpdate.length === 0) {
      console.log(`  ${cityName}: all ${propsSnap.size} already "sale", skipping.`);
      continue;
    }

    console.log(`  ${cityName}: updating ${toUpdate.length}/${propsSnap.size} properties...`);

    const batchSize = 400;
    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const chunk = toUpdate.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach(doc => batch.update(doc.ref, { type: 'sale' }));
      await batch.commit();
    }

    totalUpdated += toUpdate.length;
  }

  console.log('\nDone!');
  console.log(`  Updated : ${totalUpdated} properties`);
  console.log(`  Skipped : ${totalSkipped} (already "sale")`);
}

setAllPublicPropertiesToSale().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
