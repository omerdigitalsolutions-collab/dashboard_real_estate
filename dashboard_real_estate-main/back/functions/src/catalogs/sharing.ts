import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

export const generateCatalog = onCall({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { agencyId, leadId, leadName, propertyIds, title, leadRequirements: providedRequirements } = request.data as {
        agencyId?: string;
        leadId?: string;
        leadName?: string;
        propertyIds?: Array<{ id: string; collectionPath: string }>;
        title?: string;
        leadRequirements?: any;
    };

    if (!agencyId?.trim()) throw new HttpsError('invalid-argument', 'agencyId is required.');
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
    const agencyLogoUrl: string = agencyData.settings?.logoUrl || agencyData.logoUrl || '';
    const callerPhone: string = callerDoc.data()?.phone || '';
    const agencyPhone: string =
        agencyData.officePhone ||
        agencyData.billing?.ownerPhone ||
        agencyData.whatsappIntegration?.phoneNumber ||
        agencyData.phone ||
        callerPhone || '';

    // ── Fetch Lead requirements ──────────────────────────────────────────────────
    let leadRequirements: Record<string, any> | null = providedRequirements || null;
    if (!leadRequirements && leadId) {
        try {
            const leadDoc = await db.doc(`leads/${leadId}`).get();
            if (leadDoc.exists) {
                leadRequirements = leadDoc.data()?.requirements || null;
            }
        } catch { /* non-critical */ }
    }

    const catalogRef = db.collection('shared_catalogs').doc();

    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() + 365); // 1 year from now

    await catalogRef.set({
        agencyId,
        agencyName,
        agencyLogoUrl,
        agencyPhone,
        agentId: request.auth.uid,
        leadId: leadId || null,
        leadName: leadName || '',
        title: title || '',
        propertyIds: propertyIds, // Storing only the references for live fetching
        leadRequirements: leadRequirements || null,
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
