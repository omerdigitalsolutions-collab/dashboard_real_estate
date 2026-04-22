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
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
    const propertyCity = ((_a = propertyData.address) === null || _a === void 0 ? void 0 : _a.city) || propertyData.city;
    const propertyPrice = (_c = (_b = propertyData.financials) === null || _b === void 0 ? void 0 : _b.price) !== null && _c !== void 0 ? _c : propertyData.price;
    if (!agencyId || !propertyCity || propertyPrice === undefined) {
        console.log(`Matchmaking skipped for ${propertyId}: Missing city, price, or agencyId.`);
        return;
    }
    const matchingProp = {
        id: propertyId,
        city: propertyCity,
        neighborhood: ((_d = propertyData.address) === null || _d === void 0 ? void 0 : _d.neighborhood) || propertyData.neighborhood || null,
        street: ((_e = propertyData.address) === null || _e === void 0 ? void 0 : _e.street) || propertyData.street || null,
        price: propertyPrice,
        rooms: (_f = propertyData.rooms) !== null && _f !== void 0 ? _f : null,
        transactionType: propertyData.transactionType || propertyData.type || 'forsale',
        hasElevator: (_j = (_h = (_g = propertyData.features) === null || _g === void 0 ? void 0 : _g.hasElevator) !== null && _h !== void 0 ? _h : propertyData.hasElevator) !== null && _j !== void 0 ? _j : null,
        hasParking: (_m = (_l = (_k = propertyData.features) === null || _k === void 0 ? void 0 : _k.hasParking) !== null && _l !== void 0 ? _l : propertyData.hasParking) !== null && _m !== void 0 ? _m : null,
        hasBalcony: (_q = (_p = (_o = propertyData.features) === null || _o === void 0 ? void 0 : _o.hasBalcony) !== null && _p !== void 0 ? _p : propertyData.hasBalcony) !== null && _q !== void 0 ? _q : null,
        hasMamad: (_t = (_s = (_r = propertyData.features) === null || _r === void 0 ? void 0 : _r.hasMamad) !== null && _s !== void 0 ? _s : propertyData.hasSafeRoom) !== null && _t !== void 0 ? _t : null,
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
            source: (_v = (typeof propertyData.source === 'string' ? propertyData.source : (_u = propertyData.source) === null || _u === void 0 ? void 0 : _u.origin)) !== null && _v !== void 0 ? _v : 'manual',
            city: propertyCity,
            price: propertyPrice,
            rooms: (_w = propertyData.rooms) !== null && _w !== void 0 ? _w : undefined,
            transactionType: propertyData.transactionType || propertyData.type,
            address: ((_x = propertyData.address) === null || _x === void 0 ? void 0 : _x.fullAddress) || propertyData.address,
        },
        matchedLeads,
    });
}
/**
 * Triggered whenever a new document is added to the `properties` collection.
 * Runs the shared weighted matching engine against every active lead in the
 * same agency and emits deterministic alerts (idempotent on retries).
 */
exports.onPropertyCreatedMatchmaking = (0, firestore_1.onDocumentCreated)({ document: 'agencies/{agencyId}/properties/{propertyId}', secrets: newPropertyAlert_1.newPropertyAlertSecrets }, async (event) => {
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    const cityName = event.params.cityName;
    const propertyId = event.params.propertyId;
    const propertySnap = event.data;
    if (!propertySnap)
        return;
    const propertyData = propertySnap.data();
    // Cities collection docs still use flat schema
    const propertyPrice = (_b = (_a = propertyData.financials) === null || _a === void 0 ? void 0 : _a.price) !== null && _b !== void 0 ? _b : propertyData.price;
    const propertyRooms = propertyData.rooms;
    const propertyType = propertyData.transactionType || propertyData.type;
    if (!propertyPrice || !propertyType) {
        console.log(`Global matchmaking skipped for ${propertyId}: Missing price or type.`);
        return;
    }
    const matchingProp = {
        id: propertyId,
        city: ((_c = propertyData.address) === null || _c === void 0 ? void 0 : _c.city) || propertyData.city || cityName,
        neighborhood: ((_d = propertyData.address) === null || _d === void 0 ? void 0 : _d.neighborhood) || propertyData.neighborhood || null,
        street: ((_e = propertyData.address) === null || _e === void 0 ? void 0 : _e.street) || propertyData.street || null,
        price: propertyPrice,
        rooms: propertyRooms !== null && propertyRooms !== void 0 ? propertyRooms : null,
        transactionType: propertyType,
        hasElevator: (_h = (_g = (_f = propertyData.features) === null || _f === void 0 ? void 0 : _f.hasElevator) !== null && _g !== void 0 ? _g : propertyData.hasElevator) !== null && _h !== void 0 ? _h : null,
        hasParking: (_l = (_k = (_j = propertyData.features) === null || _j === void 0 ? void 0 : _j.hasParking) !== null && _k !== void 0 ? _k : propertyData.hasParking) !== null && _l !== void 0 ? _l : null,
        hasBalcony: (_p = (_o = (_m = propertyData.features) === null || _m === void 0 ? void 0 : _m.hasBalcony) !== null && _o !== void 0 ? _o : propertyData.hasBalcony) !== null && _p !== void 0 ? _p : null,
        hasMamad: (_s = (_r = (_q = propertyData.features) === null || _q === void 0 ? void 0 : _q.hasMamad) !== null && _r !== void 0 ? _r : propertyData.hasSafeRoom) !== null && _s !== void 0 ? _s : null,
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