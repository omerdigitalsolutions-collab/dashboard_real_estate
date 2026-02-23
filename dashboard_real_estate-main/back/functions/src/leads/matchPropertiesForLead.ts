/**
 * matchPropertiesForLead — Server-side property matching engine.
 *
 * Fetches all active properties for an agency and applies deterministic
 * filtering logic against a lead's requirements.
 *
 * Matching Criteria (ALL must pass):
 *   1. property.status === 'active'
 *   2. property.city is in lead.requirements.desiredCity[] (or empty = any city)
 *   3. property.price <= lead.requirements.maxBudget (or null = no limit)
 *   4. property.rooms >= lead.requirements.minRooms (or null = no minimum)
 *   5. property.type is in lead.requirements.propertyType[] (or empty = any type)
 *
 * Security: Caller must be authenticated and belong to the target agencyId.
 *
 * Input:
 *   {
 *     agencyId: string,
 *     requirements: {
 *       desiredCity?: string[],
 *       maxBudget?: number,
 *       minRooms?: number,
 *       propertyType?: string[]
 *     }
 *   }
 *
 * Output: { matches: Property[], totalScanned: number }
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

interface LeadRequirements {
    desiredCity?: string[];
    maxBudget?: number | null;
    minRooms?: number | null;
    propertyType?: string[];
}

export const matchPropertiesForLead = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { agencyId, requirements } = request.data as {
        agencyId?: string;
        requirements?: LeadRequirements;
    };

    if (!agencyId?.trim()) {
        throw new HttpsError('invalid-argument', 'agencyId is required.');
    }

    // ── Agency membership check ─────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || callerDoc.data()?.agencyId !== agencyId) {
        throw new HttpsError('permission-denied', 'Access denied to this agency.');
    }

    // ── Fetch active properties ─────────────────────────────────────────────────
    const snapshot = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .get();

    const allActiveProperties = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    })) as Array<Record<string, any>>;

    const req = requirements ?? {};
    const desiredCities = req.desiredCity?.map((c: string) => c.trim().toLowerCase()) ?? [];
    const propertyTypes = req.propertyType ?? [];

    // ── Deterministic Matching Engine ───────────────────────────────────────────
    const matches = allActiveProperties.filter(property => {
        // 1. City filter (skip if no cities specified)
        if (desiredCities.length > 0) {
            const propCity = (property.city ?? '').trim().toLowerCase();
            if (!desiredCities.includes(propCity)) return false;
        }

        // 2. Budget filter (skip if no max budget)
        if (req.maxBudget != null && req.maxBudget > 0) {
            if ((property.price ?? Infinity) > req.maxBudget) return false;
        }

        // 3. Rooms filter (skip if no minimum rooms)
        if (req.minRooms != null && req.minRooms > 0) {
            if ((property.rooms ?? 0) < req.minRooms) return false;
        }

        // 4. Property type filter (skip if no types specified)
        if (propertyTypes.length > 0) {
            if (!propertyTypes.includes(property.type)) return false;
        }

        return true;
    });

    return {
        matches,
        totalScanned: allActiveProperties.length,
    };
});
