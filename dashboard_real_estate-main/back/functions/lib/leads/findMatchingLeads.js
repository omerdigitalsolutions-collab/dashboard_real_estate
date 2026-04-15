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
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DEDUP_DAYS);
    const cutoffTs = firestore_1.Timestamp.fromDate(cutoff);
    // Check 1: same sellerPhone within 14 days
    if (property.sellerPhone) {
        const phoneSnap = await db.collection('properties')
            .where('agencyId', '==', agencyId)
            .where('sellerPhone', '==', property.sellerPhone)
            .where('createdAt', '>=', cutoffTs)
            .limit(1)
            .get();
        if (!phoneSnap.empty)
            return true;
    }
    // Check 2: same address + price within 14 days
    const addrSnap = await db.collection('properties')
        .where('agencyId', '==', agencyId)
        .where('address', '==', property.address)
        .where('price', '==', property.price)
        .where('createdAt', '>=', cutoffTs)
        .limit(1)
        .get();
    if (!addrSnap.empty)
        return true;
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
    var _a, _b, _c, _d;
    const matchingProp = {
        id: property.id || 'temp-id',
        city: property.city,
        neighborhood: property.neighborhood,
        price: property.price,
        rooms: property.rooms,
        type: property.type,
        hasElevator: property.hasElevator,
        hasParking: property.hasParking,
        hasBalcony: property.hasBalcony,
        hasSafeRoom: property.hasSafeRoom
    };
    const res = (0, matchingEngine_1.evaluateMatch)(matchingProp, lead.requirements);
    if (!res)
        return null;
    return Object.assign(Object.assign({}, res), { id: lead.id, name: (_a = lead.name) !== null && _a !== void 0 ? _a : 'Unknown', phone: (_b = lead.phone) !== null && _b !== void 0 ? _b : '', email: (_c = lead.email) !== null && _c !== void 0 ? _c : null, agencyId: lead.agencyId, assignedAgentId: (_d = lead.assignedAgentId) !== null && _d !== void 0 ? _d : null, requirements: lead.requirements });
}
//# sourceMappingURL=findMatchingLeads.js.map