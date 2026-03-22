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
exports.superAdminSetPlan = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
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
exports.superAdminSetPlan = (0, https_1.onCall)({ region: 'europe-west1', cors: true }, async (request) => {
    var _a, _b;
    // ── Auth Guard ───────────────────────────────────────────────────────────
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    // Only Bootstrap admins (us) can call this
    const email = (_b = (_a = request.auth.token.email) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : '';
    const isBootstrapAdmin = [
        'omerdigitalsolutions@gmail.com',
        'omerfm4444@gmail.com',
        'omerasis4@gmail.com',
    ].includes(email);
    const isSuperAdmin = (await db.collection('superAdmins').doc(request.auth.uid).get()).exists;
    if (!isBootstrapAdmin && !isSuperAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only super admins can call this function.');
    }
    // ── Input Validation ─────────────────────────────────────────────────────
    const { agencyId, planId, durationDays, requestId } = request.data;
    if (!agencyId || !planId || !durationDays || durationDays <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'agencyId, planId, and a positive durationDays are required.');
    }
    const validPlans = ['starter', 'pro', 'enterprise', 'free_trial'];
    if (!validPlans.includes(planId)) {
        throw new https_1.HttpsError('invalid-argument', `planId must be one of: ${validPlans.join(', ')}`);
    }
    // ── Verify Agency Exists ──────────────────────────────────────────────────
    const agencyRef = db.collection('agencies').doc(agencyId);
    const agencySnap = await agencyRef.get();
    if (!agencySnap.exists) {
        throw new https_1.HttpsError('not-found', `Agency ${agencyId} not found.`);
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
});
//# sourceMappingURL=setAgencyPlan.js.map