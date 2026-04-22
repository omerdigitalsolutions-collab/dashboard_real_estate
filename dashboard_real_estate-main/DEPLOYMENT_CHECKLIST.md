# Phase 2 Deployment Checklist

## ✅ Completed in This Session

### Backend Code Updates
- [x] `back/functions/src/properties/matchmaking.ts` — Updated trigger path & field reads
- [x] `back/functions/src/leads/matchingEngine.ts` — Updated type handling (`forsale` vs `sale`)
- [x] `back/functions/src/leads/matchPropertiesForLead.ts` — Updated field paths
- [x] `back/functions/src/leads/findMatchingLeads.ts` — Updated collections
- [x] `back/functions/src/catalogs/getLiveProperties.ts` — Updated field reads
- [x] `back/functions/src/whatsapp/botPipeline.ts` — Updated collections
- [x] `back/functions/src/handleWeBotReply.ts` — Updated collections & field reads
- [x] `back/functions/src/ai/homerChatBot.ts` — Updated collections
- [x] `back/functions/src/ai/copilot.ts` — Updated collections
- [x] `back/functions/src/ai/agent.ts` — Updated collections
- [x] `back/functions/src/properties/addProperty.ts` — Updated to new schema
- [x] `back/functions/src/properties/updateProperty.ts` — Updated field paths
- [x] `back/functions/src/notifications/newPropertyAlert.ts` — Added `transactionType` fallback
- [x] `back/functions/src/superadmin/usage.ts` — Updated collections
- [x] `back/functions/src/utils/collections.ts` — **NEW** `agencyPropsCol()` helper
- [x] Backend TypeScript: **0 errors** ✓

### Frontend Code Updates
- [x] `front/src/types/index.ts` — New `Property` interface + `Lead.requirements.transactionType`
- [x] `front/src/services/propertyService.ts` — New `agencyPropsCol()` + `NewPropertyData` interface
- [x] `front/src/components/dashboard/PropertyMap.tsx` — lat/lng, type, price, city, sqm
- [x] `front/src/pages/Properties.tsx` — All old field refs → new nested paths
- [x] `front/src/pages/Leads.tsx` — address → address?.fullAddress
- [x] `front/src/pages/Transactions.tsx` — city, price fixed
- [x] `front/src/services/leadService.ts` — city, price, type fixed
- [x] `front/src/pages/AgentDashboard.tsx` — agentId, PropertyMap, TaskDashboardWidget
- [x] `front/src/pages/superadmin/AgencyDrillDown.tsx` — address, price, type, city
- [x] `front/src/context/PreferencesContext.tsx` — preferences → Preferences
- [x] `front/src/types/index.ts` — Added `joinCode`, `isJoinCodeEnabled` to Agency
- [x] `front/src/pages/CatalogPropertyModal.tsx` — Lambda param types
- [x] `front/src/pages/Dashboard.tsx` — isDraggable cast, AddTaskModal address type
- [x] `front/src/components/modals/AddPropertyModal.tsx` — New nested schema
- [x] `front/src/components/modals/AddTaskModal.tsx` — Flexible address handling
- [x] `front/src/pages/VerifyPhonePage.tsx` — Added legalConsent arg
- [x] `front/src/hooks/useFirestoreData.ts` — `useProperties()` → subcollection
- [x] `front/src/hooks/useLiveDashboardData.tsx` — Properties listener → subcollection
- [x] `front/src/hooks/useGlobalStats.ts` — `collectionGroup('properties')`
- [x] `front/src/services/importService.ts` — Collection paths + `buildPropertyDefaults()`
- [x] `front/src/utils/seedDatabase.ts` — New nested schema
- [x] Frontend TypeScript: **0 errors** ✓

### Firestore Rules
- [x] `firestore.rules` — Already has new subcollection rules (lines 203-221)
- [x] Path-based access control: `agencies/{id}/properties/{id}`
- [x] No `agencyIdUnchanged()` guard needed (path enforces immutability)

### Tools & Scripts
- [x] **NEW** `scripts/migratePropertiesToSubcollection.js` — Migration tool
- [x] **NEW** `MIGRATION.md` — Deployment guide
- [x] **NEW** `DEPLOYMENT_CHECKLIST.md` — This checklist

---

## 🚀 Ready to Deploy?

### Pre-Deployment Validation
- [x] Backend TypeScript compiles: `npx tsc --noEmit` ✓
- [x] Frontend TypeScript compiles: `npx tsc -p tsconfig.app.json --noEmit` ✓
- [x] No remaining old collection paths in frontend
- [x] No remaining old field refs in display code
- [x] All nested schema transformations complete

### Deployment Order

```bash
# 1. Build and deploy backend functions
npm run back:build    # Compiles TypeScript → /lib
npm run back:deploy   # Deploys to Firebase

# 2. Deploy Firestore rules (optional — rules already support new paths)
npm run rules:deploy

# 3. Get Firebase service account key
# - Go to Firebase Console → Project Settings → Service Accounts → Generate Key
# - Save as scripts/firebase-key.json

# 4. Run data migration
node scripts/migratePropertiesToSubcollection.js --dry-run      # See what will happen
node scripts/migratePropertiesToSubcollection.js                # Migrate data

# 5. (Optional) Delete old root collection docs
node scripts/migratePropertiesToSubcollection.js --delete-source
```

---

## ⚠️ Important Notes

### Zero Downtime
- Old `properties/{id}` collection and new `agencies/{id}/properties/{id}` will coexist during migration
- Frontend is **already updated** to use the new paths
- Backend functions are **already updated** to the new schema
- Firestore rules **already support** both paths (if needed)

### Migration Safety
- Migration is **idempotent** — can be re-run without duplication
- Dry-run mode lets you verify before actual write
- Each agency processed independently (parallel-safe)
- Error handling logs failures per property

### After Migration
1. Verify data in Firestore Console
2. Test UI in dev mode
3. Check agent properties page, lead matching, shared catalogs
4. Delete old `properties/{id}` docs with `--delete-source` flag

---

## 📊 Summary

| Component | Status | Files Changed |
|-----------|--------|---------------|
| Backend Functions | ✅ Ready | 13 files |
| Frontend TypeScript | ✅ Clean | 20+ files |
| Firestore Rules | ✅ Ready | No changes needed |
| Migration Tool | ✅ Created | 1 script |
| Compilation | ✅ 0 errors | Both stacks |

---

## 🎯 Next Steps

1. **Deploy backend**: `npm run back:deploy`
2. **Download Firebase key** to `scripts/firebase-key.json`
3. **Run migration**: `node scripts/migratePropertiesToSubcollection.js --dry-run`
4. **Verify**: Check Firestore Console for new docs
5. **Test**: Load the UI and confirm everything works
6. **Cleanup**: Run with `--delete-source` to remove old docs (optional)

---

**Estimated time**: 15-30 minutes for full deployment + migration

**Rollback plan**: Keep old `properties` collection intact for 1 week, then delete if app is stable
