import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * getAgencyUsageStats
 *
 * Returns Firebase Storage usage (bytes / MB) and Firestore document counts
 * for a specific agency. Restricted to Super Admin callers.
 */
export const superAdminGetAgencyUsage = functions.https.onCall(async (request) => {
    // ── Auth Guard ────────────────────────────────────────────────────────────
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }

    const { targetAgencyId } = request.data as { targetAgencyId?: string };
    if (!targetAgencyId) {
        throw new functions.https.HttpsError('invalid-argument', 'targetAgencyId is required.');
    }

    const db = getFirestore();
    const bucket = getStorage().bucket();

    try {
        // ── Task A: Storage Calculation ───────────────────────────────────────
        const [files] = await bucket.getFiles({ prefix: `agencies/${targetAgencyId}/` });
        const storageBytes = files.reduce((sum, file) => {
            const size = parseInt(String(file.metadata?.size ?? '0'), 10);
            return sum + (isNaN(size) ? 0 : size);
        }, 0);
        const storageMB = parseFloat((storageBytes / (1024 * 1024)).toFixed(2));

        // ── Task B: Firestore Document Counts ─────────────────────────────────
        const [propertiesSnap, leadsSnap, dealsSnap, usersSnap] = await Promise.all([
            db.collection('properties').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('leads').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('deals').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('users').where('agencyId', '==', targetAgencyId).count().get(),
        ]);

        const totalProperties = propertiesSnap.data().count;
        const totalLeads = leadsSnap.data().count;
        const totalDeals = dealsSnap.data().count;
        const totalUsers = usersSnap.data().count;

        return {
            success: true,
            data: {
                storageBytes,
                storageMB,
                totalProperties,
                totalLeads,
                totalDeals,
                totalUsers,
            },
        };
    } catch (error: any) {
        console.error('[superAdminGetAgencyUsage] Error:', error);
        throw new functions.https.HttpsError('internal', 'Error fetching agency usage stats.');
    }
});
