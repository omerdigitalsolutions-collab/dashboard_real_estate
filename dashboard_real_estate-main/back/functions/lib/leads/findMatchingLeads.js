"use strict";
/**
 * findMatchingLeads — Reverse matching engine.
 *
 * Given a newly ingested property, find all active leads in the agency
 * whose criteria match the property using real-world Israeli real-estate logic.
 *
 * Business Rules:
 *  1. Deduplication — abort if same property ingested in last 14 days
 *  2. Active Leads Only — ignore closed/won leads and stale ones (>6 months)
 *  3. Price Margin +7% — allow slight negotiation
 *  4. Half-Room Flexibility — ±0.5 rooms
 *  5. Null Benefit of Doubt — missing property amenity data → allow match + flag
 *  6. matchScore (0–100) — percentage match quality
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMatchingLeads = findMatchingLeads;
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
// ─── Constants ────────────────────────────────────────────────────────────────
const PRICE_MARGIN = 1.07; // Allow +7% over maxBudget
const ROOMS_TOLERANCE = 0.5; // Allow ±0.5 rooms
const DEDUP_DAYS = 14; // Don't re-match properties ingested < 14 days ago
const STALE_LEAD_MONTHS = 6; // Ignore leads not updated in > 6 months
const DEAD_STATUSES = ['lost', 'won', 'not_relevant', 'bought'];
// ─── Main Export ──────────────────────────────────────────────────────────────
/**
 * findMatchingLeads
 *
 * @param newProperty - The newly ingested / parsed property
 * @param agencyId    - The agency to search leads in
 * @returns Array of matched leads sorted by matchScore descending.
 *          Returns empty array if property is a duplicate.
 */
async function findMatchingLeads(newProperty, agencyId) {
    // ── 1. Deduplication ─────────────────────────────────────────────────────
    const dupResult = await checkDuplicate(newProperty, agencyId);
    if (dupResult) {
        console.log(`[findMatchingLeads] Duplicate detected for "${newProperty.address}" — aborting.`);
        return [];
    }
    // ── 2. Fetch Active Leads ────────────────────────────────────────────────
    const leads = await fetchActiveLeads(agencyId);
    if (leads.length === 0) {
        console.log(`[findMatchingLeads] No active leads found for agency: ${agencyId}`);
        return [];
    }
    console.log(`[findMatchingLeads] Evaluating ${leads.length} active leads for "${newProperty.address}"`);
    // ── 3–6. Evaluate Each Lead ──────────────────────────────────────────────
    const matched = [];
    for (const lead of leads) {
        const result = evaluateLead(newProperty, lead);
        if (result !== null) {
            matched.push(result);
        }
    }
    // Sort by matchScore descending
    matched.sort((a, b) => b.matchScore - a.matchScore);
    console.log(`[findMatchingLeads] Found ${matched.length} matches.`);
    return matched;
}
// ─── Deduplication ────────────────────────────────────────────────────────────
async function checkDuplicate(property, agencyId) {
    var _a, _b, _c, _d;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DEDUP_DAYS);
    const cutoffTs = firestore_1.Timestamp.fromDate(cutoff);
    const propsCol = db.collection('agencies').doc(agencyId).collection('properties');
    const price = (_b = (_a = property.financials) === null || _a === void 0 ? void 0 : _a.price) !== null && _b !== void 0 ? _b : property.price;
    const fullAddress = (_d = (_c = property.address) === null || _c === void 0 ? void 0 : _c.fullAddress) !== null && _d !== void 0 ? _d : '';
    // Check 1: same sellerPhone within 14 days
    if (property.sellerPhone) {
        const phoneSnap = await propsCol
            .where('sellerPhone', '==', property.sellerPhone)
            .where('createdAt', '>=', cutoffTs)
            .limit(1)
            .get();
        if (!phoneSnap.empty)
            return true;
    }
    // Check 2: same fullAddress + price within 14 days
    if (fullAddress && price != null) {
        const addrSnap = await propsCol
            .where('address.fullAddress', '==', fullAddress)
            .where('financials.price', '==', price)
            .where('createdAt', '>=', cutoffTs)
            .limit(1)
            .get();
        if (!addrSnap.empty)
            return true;
    }
    return false;
}
// ─── Fetch Active Leads ───────────────────────────────────────────────────────
async function fetchActiveLeads(agencyId) {
    const snap = await db.collection('leads')
        .where('agencyId', '==', agencyId)
        .get();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - STALE_LEAD_MONTHS);
    return snap.docs
        .map(d => (Object.assign({ id: d.id }, d.data())))
        .filter(lead => {
        var _a, _b;
        // Filter out dead statuses
        if (DEAD_STATUSES.includes(((_a = lead.status) !== null && _a !== void 0 ? _a : '').toLowerCase()))
            return false;
        // Filter out stale leads (updatedAt or createdAt must be within 6 months)
        const lastActivity = (_b = lead.updatedAt) !== null && _b !== void 0 ? _b : lead.createdAt;
        if (!lastActivity)
            return false;
        const lastDate = lastActivity.toDate ? lastActivity.toDate() : new Date(lastActivity._seconds * 1000);
        return lastDate >= sixMonthsAgo;
    });
}
const matchingEngine_1 = require("./matchingEngine");
// ... checkDuplicate and fetchActiveLeads stay same ...
// ─── Lead Evaluation ──────────────────────────────────────────────────────────
function evaluateLead(property, lead) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const matchingProp = {
        id: property.id || 'temp-id',
        city: (_b = (_a = property.address) === null || _a === void 0 ? void 0 : _a.city) !== null && _b !== void 0 ? _b : property.city,
        neighborhood: (_d = (_c = property.address) === null || _c === void 0 ? void 0 : _c.neighborhood) !== null && _d !== void 0 ? _d : property.neighborhood,
        street: (_e = property.address) === null || _e === void 0 ? void 0 : _e.street,
        price: (_h = (_g = (_f = property.financials) === null || _f === void 0 ? void 0 : _f.price) !== null && _g !== void 0 ? _g : property.price) !== null && _h !== void 0 ? _h : 0,
        rooms: property.rooms,
        transactionType: (property.transactionType || property.type || 'forsale'),
        hasElevator: (_k = (_j = property.features) === null || _j === void 0 ? void 0 : _j.hasElevator) !== null && _k !== void 0 ? _k : property.hasElevator,
        hasParking: (_m = (_l = property.features) === null || _l === void 0 ? void 0 : _l.hasParking) !== null && _m !== void 0 ? _m : property.hasParking,
        hasBalcony: (_p = (_o = property.features) === null || _o === void 0 ? void 0 : _o.hasBalcony) !== null && _p !== void 0 ? _p : property.hasBalcony,
        hasMamad: (_r = (_q = property.features) === null || _q === void 0 ? void 0 : _q.hasMamad) !== null && _r !== void 0 ? _r : property.hasSafeRoom,
    };
    const res = (0, matchingEngine_1.evaluateMatch)(matchingProp, lead.requirements);
    if (!res)
        return null;
    return Object.assign(Object.assign({}, res), { id: lead.id, name: (_s = lead.name) !== null && _s !== void 0 ? _s : 'Unknown', phone: (_t = lead.phone) !== null && _t !== void 0 ? _t : '', email: (_u = lead.email) !== null && _u !== void 0 ? _u : null, agencyId: lead.agencyId, assignedAgentId: (_v = lead.assignedAgentId) !== null && _v !== void 0 ? _v : null, requirements: lead.requirements });
}
//# sourceMappingURL=findMatchingLeads.js.map