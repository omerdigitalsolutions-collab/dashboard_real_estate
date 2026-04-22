# Properties Migration Guide

This guide covers deploying the new architecture and migrating existing property data from the root collection to the new agency subcollection.

## ✅ What's Complete

- ✅ Backend Cloud Functions updated
- ✅ Frontend fully migrated to new schema
- ✅ Firestore rules already support new subcollection path
- ✅ TypeScript: 0 errors (frontend + backend)

## 🚀 Deployment Steps

### Step 1: Deploy Firestore Rules (already updated)

```bash
npm run rules:deploy
```

This deploys the rules that enforce:
- Read/write access to `agencies/{agencyId}/properties/{propId}`
- Agent can only update their own properties
- Billing checks on creates/updates

### Step 2: Deploy Cloud Functions

```bash
npm run back:deploy
```

This deploys all backend Cloud Functions with the new schema handling.

### Step 3: Migrate Property Data

The migration script will copy all properties from the old root collection to the new subcollection structure, automatically transforming the schema.

#### 3a. Download Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click ⚙️ **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Save as `scripts/firebase-key.json`

#### 3b. Run Migration (Dry Run First)

```bash
# First: test what will be migrated
node scripts/migratePropertiesToSubcollection.js --dry-run

# Output will show:
# - Found X agencies
# - Found Y properties per agency
# - What will be transformed
```

#### 3c. Run Actual Migration

```bash
# Migrate data to new location
node scripts/migratePropertiesToSubcollection.js

# Optional: also delete old docs after migration
node scripts/migratePropertiesToSubcollection.js --delete-source
```

**⚠️ WARNING**: Only use `--delete-source` after:
- ✓ Confirming dry-run succeeded
- ✓ Verifying new subcollection has all data
- ✓ Testing the app works with new paths

### Step 4: Verify Migration

After migration, spot-check in Firebase Console:
1. Open Firestore → `agencies/{id}/properties` → confirm docs exist
2. Check a property doc structure — should have nested `address`, `financials`, etc.
3. Test the app in dev mode to confirm data loads correctly

## 📋 Rollback Plan

If migration fails partway:

1. Stop the script (Ctrl+C)
2. Check the error output
3. Fix any data issues in the old collection
4. Re-run migration for remaining properties

The migration is idempotent — re-running with the same source won't create duplicates.

## 🔄 Schema Transformation

Old flat structure:
```ts
{
  id: "prop_123",
  agencyId: "agency_1",
  address: "123 Main St",
  city: "Tel Aviv",
  price: 5000000,
  type: "sale",
  kind: "דירה",
  agentId: "agent_1",
  description: "Nice apartment",
  images: ["url1", "url2"],
  lat: 32.0637,
  lng: 34.7745
}
```

New nested structure:
```ts
{
  id: "prop_123",
  agencyId: "agency_1",
  address: {
    fullAddress: "123 Main St",
    city: "Tel Aviv",
    coords: { lat: 32.0637, lng: 34.7745 }
  },
  transactionType: "forsale",
  propertyType: "דירה",
  financials: { price: 5000000 },
  management: {
    assignedAgentId: "agent_1",
    descriptions: "Nice apartment"
  },
  media: { images: ["url1", "url2"] }
}
```

## 📚 Files Changed

- `firestore.rules` — Already has subcollection rules (no changes needed)
- `back/functions/src/**/*.ts` — All updated to new schema (already compiled)
- `front/src/**/*.tsx` — All updated to new schema (TypeScript clean)
- `scripts/migratePropertiesToSubcollection.js` — NEW migration tool

## ❓ Questions?

If migration fails, check:
1. Does `scripts/firebase-key.json` exist and have correct permissions?
2. Is your Firebase project accessible?
3. Does the script have read/write access to Firestore?
4. Are there unusual field values in existing properties (corrupted data)?

---

**Next**: Run `npm run rules:deploy && npm run back:deploy` when ready! 🎉
