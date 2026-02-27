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

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestedProperty {
    id?: string;
    agencyId?: string;
    address: string;
    city: string;
    price: number;
    rooms?: number | null;
    type: 'sale' | 'rent';
    sellerPhone?: string | null;
    hasElevator?: boolean | null;
    hasParking?: boolean | null;
    hasBalcony?: boolean | null;
    hasSafeRoom?: boolean | null;
    createdAt?: Timestamp;
}

export interface MatchedLead {
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    agencyId: string;
    assignedAgentId: string | null;
    matchScore: number;           // 0–100
    requiresVerification: string[]; // e.g. ['hasElevator', 'hasParking']
    requirements: Record<string, any>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRICE_MARGIN = 1.07;          // Allow +7% over maxBudget
const ROOMS_TOLERANCE = 0.5;       // Allow ±0.5 rooms
const DEDUP_DAYS = 14;             // Don't re-match properties ingested < 14 days ago
const STALE_LEAD_MONTHS = 6;       // Ignore leads not updated in > 6 months
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
export async function findMatchingLeads(
    newProperty: IngestedProperty,
    agencyId: string
): Promise<MatchedLead[]> {

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
    const matched: MatchedLead[] = [];

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

async function checkDuplicate(property: IngestedProperty, agencyId: string): Promise<boolean> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DEDUP_DAYS);
    const cutoffTs = Timestamp.fromDate(cutoff);

    // Check 1: same sellerPhone within 14 days
    if (property.sellerPhone) {
        const phoneSnap = await db.collection('properties')
            .where('agencyId', '==', agencyId)
            .where('sellerPhone', '==', property.sellerPhone)
            .where('createdAt', '>=', cutoffTs)
            .limit(1)
            .get();

        if (!phoneSnap.empty) return true;
    }

    // Check 2: same address + price within 14 days
    const addrSnap = await db.collection('properties')
        .where('agencyId', '==', agencyId)
        .where('address', '==', property.address)
        .where('price', '==', property.price)
        .where('createdAt', '>=', cutoffTs)
        .limit(1)
        .get();

    if (!addrSnap.empty) return true;

    return false;
}

// ─── Fetch Active Leads ───────────────────────────────────────────────────────

async function fetchActiveLeads(agencyId: string): Promise<any[]> {
    const snap = await db.collection('leads')
        .where('agencyId', '==', agencyId)
        .get();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - STALE_LEAD_MONTHS);

    return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Record<string, any>))
        .filter(lead => {
            // Filter out dead statuses
            if (DEAD_STATUSES.includes((lead.status ?? '').toLowerCase())) return false;
            // Filter out stale leads (updatedAt or createdAt must be within 6 months)
            const lastActivity = lead.updatedAt ?? lead.createdAt;
            if (!lastActivity) return false;
            const lastDate = lastActivity.toDate ? lastActivity.toDate() : new Date(lastActivity._seconds * 1000);
            return lastDate >= sixMonthsAgo;
        });
}

// ─── Lead Evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluates a single lead against the property.
 * Returns null if no match, or a MatchedLead with score if match found.
 */
function evaluateLead(property: IngestedProperty, lead: any): MatchedLead | null {
    const req = lead.requirements ?? {};
    const requiresVerification: string[] = [];
    let scorePoints = 0;
    let scorePossible = 0;

    // ── City filter ───────────────────────────────────────────────────────────
    const desiredCities: string[] = (req.desiredCity ?? []).map((c: string) => c.trim().toLowerCase());
    if (desiredCities.length > 0) {
        scorePossible += 25;
        const propCity = property.city.trim().toLowerCase();
        if (!desiredCities.includes(propCity)) return null; // Hard reject
        scorePoints += 25;
    }

    // ── Property type filter (sale vs rent) ───────────────────────────────────
    const wantedTypes: string[] = req.propertyType ?? [];
    if (wantedTypes.length > 0) {
        scorePossible += 10;
        if (wantedTypes.includes(property.type)) scorePoints += 10;
        // No hard reject — type preference is soft
    }

    // ── Price with +7% margin ─────────────────────────────────────────────────
    if (req.maxBudget != null && req.maxBudget > 0) {
        scorePossible += 30;
        const effectiveBudget = req.maxBudget * PRICE_MARGIN;
        if (property.price > effectiveBudget) return null; // Hard reject over budget

        // Score based on how much room below budget
        const headroom = (effectiveBudget - property.price) / effectiveBudget;
        // Full score if price is ≤ maxBudget (headroom > 0.07), partial if in the +7% zone
        scorePoints += headroom >= 0.07 ? 30 : Math.round(30 * (headroom / 0.07));
    }

    // ── Rooms with ±0.5 tolerance ─────────────────────────────────────────────
    const desiredMin = req.minRooms != null ? req.minRooms : null;
    const desiredMax = req.maxRooms != null ? req.maxRooms : null;

    if ((desiredMin != null || desiredMax != null) && property.rooms != null) {
        scorePossible += 20;

        const roomsOk =
            (desiredMin == null || property.rooms >= desiredMin - ROOMS_TOLERANCE) &&
            (desiredMax == null || property.rooms <= desiredMax + ROOMS_TOLERANCE);

        if (!roomsOk) return null; // Hard reject outside room range

        // Perfect score if within strict range, partial for tolerance zone
        const strictOk =
            (desiredMin == null || property.rooms >= desiredMin) &&
            (desiredMax == null || property.rooms <= desiredMax);
        scorePoints += strictOk ? 20 : 10;
    }

    // ── Amenity checks with Null Benefit of Doubt ─────────────────────────────
    const amenityChecks: Array<{ reqField: keyof typeof req; propField: keyof IngestedProperty; label: string }> = [
        { reqField: 'mustHaveElevator', propField: 'hasElevator', label: 'hasElevator' },
        { reqField: 'mustHaveParking', propField: 'hasParking', label: 'hasParking' },
        { reqField: 'mustHaveBalcony', propField: 'hasBalcony', label: 'hasBalcony' },
        { reqField: 'mustHaveSafeRoom', propField: 'hasSafeRoom', label: 'hasSafeRoom' },
    ];

    let amenityScore = 0;
    const amenityMax = amenityChecks.filter(a => req[a.reqField] === true).length * 4;
    if (amenityMax > 0) scorePossible += amenityMax;

    for (const { reqField, propField, label } of amenityChecks) {
        if (req[reqField] !== true) continue; // Lead doesn't require this amenity

        const propValue = property[propField];

        if (propValue === false) {
            return null; // Hard reject: property explicitly doesn't have required amenity
        } else if (propValue === true) {
            amenityScore += 4; // Perfect — property has the amenity
        } else {
            // null/undefined — benefit of the doubt, but flag for agent to verify
            requiresVerification.push(label);
            amenityScore += 2; // Partial score for unknown
        }
    }
    scorePoints += amenityScore;

    // ── Final score calculation ───────────────────────────────────────────────
    // Minimum possible score (just city + price = 55 pts) → already a match.
    // If scorePossible is 0 (no requirements), give a 50% baseline score.
    const matchScore = scorePossible > 0
        ? Math.min(100, Math.round((scorePoints / scorePossible) * 100))
        : 50;

    return {
        id: lead.id,
        name: lead.name ?? 'Unknown',
        phone: lead.phone ?? '',
        email: lead.email ?? null,
        agencyId: lead.agencyId,
        assignedAgentId: lead.assignedAgentId ?? null,
        matchScore,
        requiresVerification,
        requirements: req,
    };
}
