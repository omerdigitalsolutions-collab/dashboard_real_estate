#!/usr/bin/env node

/**
 * Migration Script: properties/{id} (root) → agencies/{agencyId}/properties/{id}
 *
 * Usage:
 *   node scripts/migratePropertiesToSubcollection.js [--dry-run] [--delete-source]
 *
 * Flags:
 *   --dry-run        : Show what would be migrated without writing
 *   --delete-source  : Delete docs from old collection after successful migration
 */

const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, '..', 'firebase-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const deleteSource = args.includes('--delete-source');

if (dryRun) {
  console.log('🔍 DRY RUN MODE — no changes will be written');
}
if (deleteSource) {
  console.log('🗑️  DELETE SOURCE MODE — old docs will be deleted after migration');
}

/**
 * Strip undefined values recursively (Firestore doesn't accept undefined)
 */
function stripUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => stripUndefined(item)).filter(item => item !== undefined);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj)
      .reduce((acc, [key, value]) => {
        const cleaned = stripUndefined(value);
        if (cleaned !== undefined) {
          acc[key] = cleaned;
        }
        return acc;
      }, {});
  }
  return obj === null ? null : obj;
}

/**
 * Transform old flat schema → new nested schema
 */
function migratePropertyDoc(oldData, id) {
  const {
    agencyId,
    type,
    kind,
    price,
    city,
    street,
    address,
    neighborhood,
    sqm,
    lat,
    lng,
    description,
    imageUrls,
    images,
    agentId,
    hasElevator,
    hasParking,
    parkingSpots,
    hasBalcony,
    hasSafeRoom,
    hasAirCondition,
    ...rest
  } = oldData;

  const doc = {
    id,
    agencyId,
    transactionType: type === 'rent' ? 'rent' : (type === 'sale' ? 'forsale' : 'forsale'),
    propertyType: kind || 'דירה',
    address: {
      city: city || '',
      street: street || '',
      fullAddress: address || `${street || ''} ${city || ''}`.trim(),
      ...(neighborhood ? { neighborhood } : {}),
      ...(lat && lng ? { coords: { lat, lng } } : {}),
    },
    features: {
      ...(hasElevator !== undefined ? { hasElevator } : {}),
      ...(hasParking !== undefined ? { hasParking } : {}),
      ...(parkingSpots !== undefined ? { parkingSpots } : {}),
      ...(hasBalcony !== undefined ? { hasBalcony } : {}),
      ...(hasSafeRoom !== undefined ? { hasMamad: hasSafeRoom } : {}),
      ...(hasAirCondition !== undefined ? { hasAirConditioning: hasAirCondition } : {}),
    },
    financials: {
      price: price || 0,
    },
    media: {
      images: imageUrls || images || [],
    },
    management: {
      ...(agentId ? { assignedAgentId: agentId } : {}),
      ...(description && description !== 'true' ? { descriptions: description } : {}),
    },
    ...(sqm ? { squareMeters: sqm } : {}),
    ...rest, // Keep all other fields (status, createdAt, etc.)
  };

  // Strip any remaining undefined values
  return stripUndefined(doc);
}

async function migrateProperties() {
  console.log('\n📦 Starting property migration...\n');

  // Get all agencies
  const agenciesSnap = await db.collection('agencies').get();
  const agencies = agenciesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Found ${agencies.length} agencies\n`);

  let totalMigrated = 0;
  let totalErrors = 0;

  for (const agency of agencies) {
    const agencyId = agency.id;
    console.log(`Processing agency: ${agency.name} (${agencyId})`);

    try {
      // Get all properties for this agency from OLD location
      const oldPropsSnap = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .get();

      if (oldPropsSnap.empty) {
        console.log(`  ✓ No properties found (already migrated or empty)\n`);
        continue;
      }

      const propsToMigrate = oldPropsSnap.docs.map(d => ({
        id: d.id,
        data: d.data(),
      }));

      console.log(`  Found ${propsToMigrate.length} properties to migrate`);

      // Migrate each property
      const batch = db.batch();
      const oldBatch = db.batch();

      for (const prop of propsToMigrate) {
        try {
          const migratedData = migratePropertyDoc(prop.data, prop.id);
          const newRef = db.doc(`agencies/${agencyId}/properties/${prop.id}`);
          const oldRef = db.doc(`properties/${prop.id}`);

          if (!dryRun) {
            batch.set(newRef, migratedData);
            if (deleteSource) {
              oldBatch.delete(oldRef);
            }
          }
        } catch (err) {
          console.error(`    ✗ Error migrating property ${prop.id}:`, err.message);
          totalErrors++;
        }
      }

      // Commit batches
      if (!dryRun) {
        await batch.commit();
        console.log(`  ✓ Migrated ${propsToMigrate.length} properties to subcollection`);

        if (deleteSource) {
          await oldBatch.commit();
          console.log(`  ✓ Deleted ${propsToMigrate.length} old properties from root`);
        } else {
          console.log(`  💡 Old properties still exist at properties/{id} (use --delete-source to remove)`);
        }
      } else {
        console.log(`  [DRY RUN] Would migrate ${propsToMigrate.length} properties`);
      }

      totalMigrated += propsToMigrate.length;
    } catch (err) {
      console.error(`  ✗ Error processing agency ${agencyId}:`, err.message);
      totalErrors++;
    }

    console.log('');
  }

  console.log(`\n✅ Migration Complete!`);
  console.log(`   Total migrated: ${totalMigrated}`);
  console.log(`   Total errors: ${totalErrors}\n`);

  if (dryRun) {
    console.log('ℹ️  This was a DRY RUN. Re-run without --dry-run to actually migrate.\n');
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

migrateProperties().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
