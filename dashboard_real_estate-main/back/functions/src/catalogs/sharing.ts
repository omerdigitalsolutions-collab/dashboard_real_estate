import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

export const generateCatalog = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { agencyId, leadId, leadName, propertyIds } = request.data as {
        agencyId?: string;
        leadId?: string;
        leadName?: string;
        propertyIds?: string[];
    };

    if (!agencyId?.trim()) throw new HttpsError('invalid-argument', 'agencyId is required.');
    if (!leadId?.trim()) throw new HttpsError('invalid-argument', 'leadId is required.');
    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        throw new HttpsError('invalid-argument', 'propertyIds must be a non-empty array.');
    }

    // ── Agency membership check ─────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || callerDoc.data()?.agencyId !== agencyId) {
        throw new HttpsError('permission-denied', 'You do not belong to this agency.');
    }

    // ── Fetch Agency branding ────────────────────────────────────────────────────
    const agencyDoc = await db.doc(`agencies/${agencyId}`).get();
    const agencyData = agencyDoc.data() ?? {};
    const agencyName: string = agencyData.agencyName || agencyData.name || '';
    const agencyLogoUrl: string = agencyData.settings?.logoUrl || '';
    const agencyPhone: string = agencyData.officePhone || agencyData.whatsappIntegration?.phoneNumber || '';

    const catalogRef = db.collection('shared_catalogs').doc();

    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() + 7); // Exactly 7 days from now

    await catalogRef.set({
        agencyId,
        agencyName,
        agencyLogoUrl,
        agencyPhone,
        agentId: request.auth.uid,
        leadId,
        leadName: leadName || '',
        propertyIds: propertyIds, // Storing only the references for live fetching
        viewCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: expiresAt,
    });

    // In a real env, the origin URL might be passed from the client or configured in process.env
    // Here we return a generic path that the client will affix to window.location.origin
    const url = `/catalog/${catalogRef.id}`;

    return {
        success: true,
        catalogId: catalogRef.id,
        url
    };
});
