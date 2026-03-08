/**
 * addLead — Manually creates a new lead from within the CRM.
 *
 * Used by: agents adding a lead from a phone call or walk-in.
 * Security: Caller must be authenticated and belong to the target agencyId.
 *
 * Input:
 *   {
 *     agencyId: string,
 *     name: string,
 *     phone: string,
 *     email?: string,
 *     source?: string,
 *     requirements?: { desiredCity?: string[], maxBudget?: number, minRooms?: number, propertyType?: string[] }
 *   }
 *
 * Output: { success: true, leadId: string }
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { validateUserAuth } from '../config/authGuard';

const db = getFirestore();

export const addLead = onCall({ cors: true }, async (request) => {
    // ── Auth & Agency validation ────────────────────────────────────────────────
    const authData = await validateUserAuth(request);

    const data = request.data as {
        name?: string;
        phone?: string;
        email?: string;
        source?: string;
        requirements?: {
            desiredCity?: string[];
            maxBudget?: number;
            minRooms?: number;
            propertyType?: string[];
        };
    };

    // ── Validation ──────────────────────────────────────────────────────────────
    if (!data.name?.trim()) throw new HttpsError('invalid-argument', 'name is required.');
    if (!data.phone?.trim()) throw new HttpsError('invalid-argument', 'phone is required.');

    // ── Create lead ─────────────────────────────────────────────────────────────
    const leadRef = db.collection('leads').doc();

    await leadRef.set({
        agencyId: authData.agencyId,
        name: data.name.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() ?? null,
        source: data.source?.trim() ?? 'manual',
        requirements: {
            desiredCity: data.requirements?.desiredCity ?? [],
            maxBudget: data.requirements?.maxBudget ?? null,
            minRooms: data.requirements?.minRooms ?? null,
            propertyType: data.requirements?.propertyType ?? [],
        },
        assignedAgentId: authData.uid,         // auto-assign to the creating agent
        notes: null,
        status: 'new',                          // always server-injected
        createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true, leadId: leadRef.id };
});
