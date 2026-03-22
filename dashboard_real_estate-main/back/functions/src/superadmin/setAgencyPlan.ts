import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * superAdminSetPlan — Called by the super admin to manually activate, change, or revoke a plan for an agency.
 *
 * This is a manual step in the billing workflow:
 *   1. User submits a subscription request form on the Landing Page.
 *   2. Super admin reviews the request in the admin dashboard.
 *   3. After receiving payment, super admin calls this function to unlock the agency.
 *
 * Input:  { agencyId: string, planId: 'starter' | 'pro' | 'enterprise', durationDays: number, requestId?: string }
 * Output: { success: true }
 */
export const superAdminSetPlan = onCall(
    { region: 'europe-west1', cors: true },
    async (request) => {
        // ── Auth Guard ───────────────────────────────────────────────────────────
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Must be signed in.');
        }

        // Only Bootstrap admins (us) can call this
        const email = request.auth.token.email?.toLowerCase() ?? '';
        const isBootstrapAdmin = [
            'omerdigitalsolutions@gmail.com',
            'omerfm4444@gmail.com',
            'omerasis4@gmail.com',
        ].includes(email);

        const isSuperAdmin = (await db.collection('superAdmins').doc(request.auth.uid).get()).exists;

        if (!isBootstrapAdmin && !isSuperAdmin) {
            throw new HttpsError('permission-denied', 'Only super admins can call this function.');
        }

        // ── Input Validation ─────────────────────────────────────────────────────
        const { agencyId, planId, durationDays, requestId } = request.data as {
            agencyId: string;
            planId: string;
            durationDays: number;
            requestId?: string;
        };

        if (!agencyId || !planId || !durationDays || durationDays <= 0) {
            throw new HttpsError('invalid-argument', 'agencyId, planId, and a positive durationDays are required.');
        }

        const validPlans = ['starter', 'pro', 'enterprise', 'free_trial'];
        if (!validPlans.includes(planId)) {
            throw new HttpsError('invalid-argument', `planId must be one of: ${validPlans.join(', ')}`);
        }

        // ── Verify Agency Exists ──────────────────────────────────────────────────
        const agencyRef = db.collection('agencies').doc(agencyId);
        const agencySnap = await agencyRef.get();
        if (!agencySnap.exists) {
            throw new HttpsError('not-found', `Agency ${agencyId} not found.`);
        }

        // ── Calculate Expiry ──────────────────────────────────────────────────────
        const paidUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

        // ── Atomic Update ─────────────────────────────────────────────────────────
        const batch = db.batch();

        // Update the agency's billing status
        batch.update(agencyRef, {
            status: admin.firestore.FieldValue.delete(), // remove 'locked' status
            'billing.planId': planId,
            'billing.status': 'paid',
            'billing.paidUntil': admin.firestore.Timestamp.fromDate(paidUntil),
            'billing.activatedBy': request.auth.uid,
            'billing.activatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });

        // If a subscription request ID was provided, mark it as approved
        if (requestId) {
            const reqRef = db.collection('subscription_requests').doc(requestId);
            batch.update(reqRef, {
                status: 'approved',
                approvedBy: request.auth.uid,
                approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                planActivated: planId,
            });
        }

        await batch.commit();

        console.log(`[superAdminSetPlan] Agency ${agencyId} plan set to ${planId} until ${paidUntil.toISOString()} by ${email}`);

        return { success: true, paidUntil: paidUntil.toISOString() };
    }
);
