#!/usr/bin/env node

/**
 * Migration: Populate available_instances registry (keyed by idInstance)
 *
 * Problem: existing available_instances docs may use agencyId as doc ID instead of idInstance.
 * This script rebuilds the registry so every doc ID = idInstance, enabling O(1) direct lookups.
 *
 * Usage:
 *   node scripts/migrateInstancesToRegistry.js [--dry-run]
 */

const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, '..', 'firebase-key.json'));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const DRY_RUN = process.argv.includes('--dry-run');

async function migrate() {
  console.log(`\n=== migrateInstancesToRegistry ${DRY_RUN ? '[DRY RUN]' : ''} ===\n`);

  // Step 1: Fix existing available_instances docs — ensure doc ID = idInstance
  console.log('Step 1: Fixing available_instances doc keys...');
  const existingSnap = await db.collection('available_instances').get();
  for (const doc of existingSnap.docs) {
    const data = doc.data();
    const docId = doc.id;
    const instanceId = data.idInstance;

    if (!instanceId) {
      console.log(`  SKIP ${docId}: no idInstance field`);
      continue;
    }

    if (docId === instanceId) {
      console.log(`  OK   ${docId}: already keyed correctly`);
      // Ensure isActive and agencyId fields exist
      if (data.isActive === undefined) {
        console.log(`    → Adding isActive=false, agencyId=null`);
        if (!DRY_RUN) await doc.ref.update({ isActive: false, agencyId: null });
      }
    } else {
      // Doc ID is wrong (e.g. agencyId used as key) — recreate under correct ID
      console.log(`  FIX  ${docId} → ${instanceId} (wrong key, rebuilding)`);
      if (!DRY_RUN) {
        const newRef = db.collection('available_instances').doc(instanceId);
        await newRef.set({
          idInstance: instanceId,
          apiTokenInstance: data.apiTokenInstance || null,
          isActive: data.isActive ?? false,
          agencyId: data.agencyId || null,
          returnedAt: data.returnedAt || null,
        });
        await doc.ref.delete();
        console.log(`    → Recreated as ${instanceId}, deleted ${docId}`);
      }
    }
  }

  // Step 2: Register all active (allocated) instances from private_credentials
  console.log('\nStep 2: Registering active (allocated) instances from agencies...');
  const agenciesSnap = await db.collection('agencies').get();

  // Track which instance is allocated to which agency (detect duplicates)
  const instanceToAgency = new Map();
  for (const agencyDoc of agenciesSnap.docs) {
    const agencyId = agencyDoc.id;
    const credsDoc = await agencyDoc.ref.collection('private_credentials').doc('whatsapp').get();
    if (!credsDoc.exists) continue;

    const idInstance = credsDoc.data()?.idInstance;
    if (!idInstance) continue;

    if (instanceToAgency.has(idInstance)) {
      console.warn(`  ⚠️  DUPLICATE: instance ${idInstance} is in both agency ${instanceToAgency.get(idInstance)} and ${agencyId}`);
      continue;
    }
    instanceToAgency.set(idInstance, agencyId);
    console.log(`  Agency ${agencyId}: instance ${idInstance} → isActive=true`);

    if (!DRY_RUN) {
      await db.collection('available_instances').doc(idInstance).set({
        idInstance,
        isActive: true,
        agencyId,
        apiTokenInstance: null,
        assignedAt: credsDoc.data()?.assignedAt || admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  console.log(`\nDone. Active instances: ${instanceToAgency.size}`);
  if (DRY_RUN) console.log('\n[DRY RUN] No changes were written.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
}).finally(() => process.exit(0));
