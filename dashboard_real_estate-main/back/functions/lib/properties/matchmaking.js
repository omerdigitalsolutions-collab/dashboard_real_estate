"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onGlobalPropertyCreatedMatchmaking = exports.onWhatsappPropertyCreatedMatchmaking = exports.onPropertyCreatedMatchmaking = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const matchingEngine_1 = require("../leads/matchingEngine");
const stringUtils_1 = require("../leads/stringUtils");
const newPropertyAlert_1 = require("../notifications/newPropertyAlert");
const db = admin.firestore();
const BATCH_WRITE_LIMIT = 400;
const CLOSED_LEAD_STATUSES = ['lost', 'won'];
// In-memory cache for city catalog
let cachedCityNames = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
async function getCompatibleCities(cityName) {
    const now = Date.now();
    if (!cachedCityNames || (now - lastCacheUpdate > CACHE_TTL)) {
        try {
            const snapshot = await db.collection('cities').select().get();
            cachedCityNames = snapshot.docs.map(doc => doc.id);
            lastCacheUpdate = now;
        }
        catch (err) {
            console.error('Error fetching city catalog for matchmaking:', err);
            return [cityName];
        }
    }
    // Find all names in our catalog that match the incoming cityName (substring match both ways)
    // E.g. for "תל אביב יפו", find ["תל אביב", "תל אביב-יפו", "יפו"]
    const matches = cachedCityNames.filter(c => (0, stringUtils_1.isCityMatch)([c], cityName));
    // Always include the original name just in case
    if (!matches.includes(cityName))
        matches.push(cityName);
    return matches;
}
async function commitWrites(writes) {
    for (let i = 0; i < writes.length; i += BATCH_WRITE_LIMIT) {
        const batch = db.batch();
        for (const fn of writes.slice(i, i + BATCH_WRITE_LIMIT))
            fn(batch);
        await batch.commit();
    }
}
async function runAgencyMatchmaking(propertyId, propertyData, agencyId) {
    var _a, _b, _c, _d, _e, _f, _g;
    const propertyCity = propertyData.city;
    const propertyPrice = propertyData.price;
    if (!agencyId || !propertyCity || propertyPrice === undefined) {
        console.log(`Matchmaking skipped for ${propertyId}: Missing city, price, or agencyId.`);
        return;
    }
    const matchingProp = {
        id: propertyId,
        city: propertyCity,
        neighborhood: propertyData.neighborhood || null,
        price: propertyPrice,
        rooms: (_a = propertyData.rooms) !== null && _a !== void 0 ? _a : null,
        type: propertyData.type,
        hasElevator: (_b = propertyData.hasElevator) !== null && _b !== void 0 ? _b : null,
        hasParking: (_c = propertyData.hasParking) !== null && _c !== void 0 ? _c : null,
        hasBalcony: (_d = propertyData.hasBalcony) !== null && _d !== void 0 ? _d : null,
        hasSafeRoom: (_e = propertyData.hasSafeRoom) !== null && _e !== void 0 ? _e : null,
    };
    const leadsSnap = await db.collection('leads')
        .where('agencyId', '==', agencyId)
        .get();
    if (leadsSnap.empty)
        return;
    const writes = [];
    const matchedLeads = [];
    leadsSnap.docs.forEach((doc) => {
        const lead = doc.data();
        if (lead.status && CLOSED_LEAD_STATUSES.includes(lead.status))
            return;
        const reqs = lead.requirements;
        if (!reqs)
            return;
        const result = (0, matchingEngine_1.evaluateMatch)(matchingProp, reqs);
        if (!result)
            return;
        matchedLeads.push({
            id: doc.id,
            name: lead.name,
            assignedAgentId: lead.assignedAgentId,
        });
        const alertRef = db.collection('alerts').doc(`${propertyId}_${doc.id}`);
        writes.push((batch) => batch.set(alertRef, {
            agencyId,
            targetAgentId: lead.assignedAgentId || 'all',
            type: 'property_match',
            title: 'התאמת נכס חדשה!',
            message: `נכס חדש ב${propertyCity} מתאים ל${lead.name || 'לקוח שלך'} (ציון: ${result.matchScore})`,
            link: `/dashboard/leads/${doc.id}`,
            propertyId,
            leadId: doc.id,
            matchScore: result.matchScore,
            matchCategory: result.category,
            requiresVerification: result.requiresVerification,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
        console.log(`Matchmaking: Property ${propertyId} matched with Lead ${doc.id} (score: ${result.matchScore})`);
    });
    const matchCount = matchedLeads.length;
    const isYad2OrMadlan = propertyData.source === 'yad2_alert' || propertyData.source === 'madlan_alert';
    if (matchCount === 0 && !isYad2OrMadlan)
        return;
    const isExternal = propertyData.listingType === 'external' || propertyData.source === 'whatsapp_group';
    if (isExternal) {
        const managerAlertRef = db.collection('alerts').doc(`${propertyId}_manager`);
        writes.push((batch) => batch.set(managerAlertRef, {
            agencyId,
            targetAgentId: 'all',
            type: 'external_property_match',
            title: 'הזדמנות שיתוף פעולה (B2B)!',
            message: `דירה חדשה ממשרד אחר התווספה ב${propertyCity} ותואמת ל-${matchCount} מחפשי דירות במשרד שלנו!`,
            link: `/dashboard/properties`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
    }
    await commitWrites(writes);
    console.log(`Matchmaking complete for ${propertyId}. Generated ${matchCount} client notifications.`);
    await (0, newPropertyAlert_1.notifyNewProperty)({
        agencyId,
        property: {
            id: propertyId,
            source: (_f = propertyData.source) !== null && _f !== void 0 ? _f : 'manual',
            city: propertyCity,
            price: propertyPrice,
            rooms: (_g = propertyData.rooms) !== null && _g !== void 0 ? _g : undefined,
            type: propertyData.type,
            address: propertyData.address,
        },
        matchedLeads,
    });
}
/**
 * Triggered whenever a new document is added to the `properties` collection.
 * Runs the shared weighted matching engine against every active lead in the
 * same agency and emits deterministic alerts (idempotent on retries).
 */
exports.onPropertyCreatedMatchmaking = (0, firestore_1.onDocumentCreated)({ document: 'properties/{propertyId}', secrets: newPropertyAlert_1.newPropertyAlertSecrets }, async (event) => {
    const propertyId = event.params.propertyId;
    const propertySnap = event.data;
    if (!propertySnap)
        return;
    const propertyData = propertySnap.data();
    const agencyId = propertyData.agencyId;
    try {
        await runAgencyMatchmaking(propertyId, propertyData, agencyId);
    }
    catch (err) {
        console.error(`Error during matchmaking for property ${propertyId}:`, err);
    }
});
/**
 * Triggered when a WhatsApp-ingested draft lands in agencies/{agencyId}/whatsappProperties.
 * Reuses the same agency-scoped match logic; draft items marked isExclusive:false.
 */
exports.onWhatsappPropertyCreatedMatchmaking = (0, firestore_1.onDocumentCreated)({ document: 'agencies/{agencyId}/whatsappProperties/{propertyId}', secrets: newPropertyAlert_1.newPropertyAlertSecrets }, async (event) => {
    const propertyId = event.params.propertyId;
    const agencyId = event.params.agencyId;
    const propertySnap = event.data;
    if (!propertySnap)
        return;
    const propertyData = propertySnap.data();
    try {
        await runAgencyMatchmaking(propertyId, propertyData, agencyId);
    }
    catch (err) {
        console.error(`Error during WhatsApp matchmaking for property ${propertyId}:`, err);
    }
});
/**
 * Triggered whenever a new document is added to the public `cities/{cityName}/properties` collection.
 * Finds all active leads across ALL agencies that are looking in that city,
 * runs the weighted matching engine, and generates alerts for high/medium matches.
 */
exports.onGlobalPropertyCreatedMatchmaking = (0, firestore_1.onDocumentCreated)({ document: 'cities/{cityName}/properties/{propertyId}', secrets: newPropertyAlert_1.newPropertyAlertSecrets }, async (event) => {
    var _a, _b, _c, _d;
    const cityName = event.params.cityName;
    const propertyId = event.params.propertyId;
    const propertySnap = event.data;
    if (!propertySnap)
        return;
    const propertyData = propertySnap.data();
    const propertyPrice = propertyData.price;
    const propertyRooms = propertyData.rooms;
    const propertyType = propertyData.type;
    if (!propertyPrice || !propertyType) {
        console.log(`Global matchmaking skipped for ${propertyId}: Missing price or type.`);
        return;
    }
    const matchingProp = {
        id: propertyId,
        city: propertyData.city || cityName,
        neighborhood: propertyData.neighborhood || null,
        price: propertyPrice,
        rooms: propertyRooms !== null && propertyRooms !== void 0 ? propertyRooms : null,
        type: propertyType,
        hasElevator: (_a = propertyData.hasElevator) !== null && _a !== void 0 ? _a : null,
        hasParking: (_b = propertyData.hasParking) !== null && _b !== void 0 ? _b : null,
        hasBalcony: (_c = propertyData.hasBalcony) !== null && _c !== void 0 ? _c : null,
        hasSafeRoom: (_d = propertyData.hasSafeRoom) !== null && _d !== void 0 ? _d : null,
    };
    try {
        // 1. Find all potential city names that leads might be using to refer to this city
        // E.g. if cityName is "תל אביב יפו", candidates might be ["תל אביב", "תל אביב-יפו"]
        const candidateCities = await getCompatibleCities(cityName);
        // 2. Fetch leads looking for ANY of these candidates
        // array-contains-any limit is 10, so we slice if needed
        const leadsSnap = await db.collection('leads')
            .where('requirements.desiredCity', 'array-contains-any', candidateCities.slice(0, 10))
            .get();
        const isGlobalYad2OrMadlan = propertyData.source === 'yad2_alert' || propertyData.source === 'madlan_alert';
        if (leadsSnap.empty) {
            console.log(`Global matchmaking: No leads found for city "${cityName}".`);
            // For Yad2/Madlan we still want to notify, but without any leads we don't know which agencies to notify
            return;
        }
        const writes = [];
        const perAgency = new Map();
        leadsSnap.docs.forEach((doc) => {
            var _a;
            const lead = doc.data();
            if (lead.status && CLOSED_LEAD_STATUSES.includes(lead.status))
                return;
            const reqs = lead.requirements;
            if (!reqs)
                return;
            const result = (0, matchingEngine_1.evaluateMatch)(matchingProp, reqs);
            if (!result)
                return;
            const leadAgencyId = lead.agencyId;
            if (!leadAgencyId)
                return;
            const bucket = (_a = perAgency.get(leadAgencyId)) !== null && _a !== void 0 ? _a : [];
            bucket.push({ id: doc.id, name: lead.name, assignedAgentId: lead.assignedAgentId });
            perAgency.set(leadAgencyId, bucket);
            const alertRef = db.collection('alerts').doc(`global_${cityName}_${propertyId}_${doc.id}`);
            writes.push((batch) => batch.set(alertRef, {
                agencyId: leadAgencyId,
                targetAgentId: lead.assignedAgentId || 'all',
                type: 'global_property_match',
                title: 'נכס מהמאגר הציבורי תואם ללקוח!',
                message: `נמצא נכס ב${cityName} מהמאגר הציבורי שתואם ל${lead.name || 'לקוח שלך'} (ציון: ${result.matchScore})`,
                link: `/dashboard/leads/${doc.id}`,
                propertyId: propertyId,
                propertyCollectionPath: `cities/${cityName}/properties`,
                leadId: doc.id,
                matchScore: result.matchScore,
                matchCategory: result.category,
                requiresVerification: result.requiresVerification,
                isRead: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }));
            console.log(`Global matchmaking: Public property ${propertyId} matched lead ${doc.id} (score: ${result.matchScore})`);
        });
        // For Yad2/Madlan: also notify agencies with leads in the city that had no matches
        if (isGlobalYad2OrMadlan) {
            leadsSnap.docs.forEach((doc) => {
                const leadAgencyId = doc.data().agencyId;
                if (leadAgencyId && !perAgency.has(leadAgencyId)) {
                    perAgency.set(leadAgencyId, []);
                }
            });
        }
        if (perAgency.size === 0)
            return;
        await commitWrites(writes);
        const totalMatches = Array.from(perAgency.values()).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`Global matchmaking complete for ${propertyId}. Created ${totalMatches} alerts across ${perAgency.size} agencies.`);
        await Promise.all(Array.from(perAgency.entries()).map(([agencyId, matchedLeads]) => {
            var _a;
            return (0, newPropertyAlert_1.notifyNewProperty)({
                agencyId,
                property: {
                    id: propertyId,
                    source: (_a = propertyData.source) !== null && _a !== void 0 ? _a : 'global',
                    city: propertyData.city || cityName,
                    price: propertyPrice,
                    rooms: propertyRooms !== null && propertyRooms !== void 0 ? propertyRooms : undefined,
                    type: propertyType,
                    address: propertyData.address,
                },
                matchedLeads,
            }).catch((err) => console.error(`notifyNewProperty failed for agency ${agencyId}:`, err));
        }));
    }
    catch (err) {
        console.error(`Error during global matchmaking for property ${propertyId}:`, err);
    }
});
//# sourceMappingURL=matchmaking.js.map