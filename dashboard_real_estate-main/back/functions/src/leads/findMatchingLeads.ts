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
import { isCityMatch } from './stringUtils';

const db = getFirestore();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestedProperty {
    id?: string;
    agencyId?: string;
    // New nested schema
    address?: {
        city?: string;
        street?: string;
        neighborhood?: string;
        fullAddress?: string;
    };
    // Legacy flat fields (for backward compat during transition)
    city?: string;
    neighborhood?: string | null;
    financials?: { price?: number };
    price?: number;
    transactionType?: string;
    type?: string;
    rooms?: number | null;
    sellerPhone?: string | null;
    features?: {
        hasElevator?: boolean | null;
        hasParking?: boolean | null;
        hasBalcony?: boolean | null;
        hasMamad?: boolean | null;
    };
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
    category: 'high' | 'medium';   // Added category
    requiresVerification: string[]; // e.g. ['hasElevator', 'hasParking']
    requirements: Record<string, any>;
    isNeighborhoodMatch: boolean;  // Added flag
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

    const propsCol = db.collection('agencies').doc(agencyId).collection('properties');
    const price = property.financials?.price ?? property.price;
    const fullAddress = property.address?.fullAddress ?? '';

    // Check 1: same sellerPhone within 14 days
    if (property.sellerPhone) {
        const phoneSnap = await propsCol
            .where('sellerPhone', '==', property.sellerPhone)
            .where('createdAt', '>=', cutoffTs)
            .limit(1)
            .get();

        if (!phoneSnap.empty) return true;
    }

    // Check 2: same fullAddress + price within 14 days
    if (fullAddress && price != null) {
        const addrSnap = await propsCol
            .where('address.fullAddress', '==', fullAddress)
            .where('financials.price', '==', price)
            .where('createdAt', '>=', cutoffTs)
            .limit(1)
            .get();

        if (!addrSnap.empty) return true;
    }

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

import { evaluateMatch, MatchingProperty } from './matchingEngine';

// ... checkDuplicate and fetchActiveLeads stay same ...

// ─── Lead Evaluation ──────────────────────────────────────────────────────────

function evaluateLead(property: IngestedProperty, lead: any): MatchedLead | null {
    const matchingProp: MatchingProperty = {
        id: property.id || 'temp-id',
        city: property.address?.city ?? property.city,
        neighborhood: property.address?.neighborhood ?? property.neighborhood,
        street: property.address?.street,
        price: property.financials?.price ?? property.price ?? 0,
        rooms: property.rooms,
        transactionType: (property.transactionType || property.type || 'forsale') as any,
        hasElevator: property.features?.hasElevator ?? property.hasElevator,
        hasParking: property.features?.hasParking ?? property.hasParking,
        hasBalcony: property.features?.hasBalcony ?? property.hasBalcony,
        hasMamad: property.features?.hasMamad ?? property.hasSafeRoom,
    };
    const res = evaluateMatch(matchingProp, lead.requirements);
    if (!res) return null;

    return {
        ...res,
        id: lead.id,
        name: lead.name ?? 'Unknown',
        phone: lead.phone ?? '',
        email: lead.email ?? null,
        agencyId: lead.agencyId,
        assignedAgentId: lead.assignedAgentId ?? null,
        requirements: lead.requirements
    };
}
