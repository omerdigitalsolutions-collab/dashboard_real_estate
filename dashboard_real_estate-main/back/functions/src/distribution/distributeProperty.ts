import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { distributeToAgent, createAdminAlert } from './distributionEngine';
import { sendWhatsAppMessage, WhatsappIntegration } from '../whatsappService';

const db = admin.firestore();

/**
 * Triggered when a new property document is created under an agency.
 * If the property is unassigned and the agency has distribution enabled,
 * finds the best matching available agent and assigns the property atomically.
 */
export const distributeProperty = onDocumentCreated(
    { document: 'agencies/{agencyId}/properties/{propertyId}' },
    async (event) => {
        const propertySnap = event.data;
        if (!propertySnap) return;

        const property = propertySnap.data();
        const propertyId = event.params.propertyId;
        const agencyId = event.params.agencyId;

        // Exit early: already assigned
        if (property.management?.assignedAgentId) return;

        const agencyDoc = await db.doc(`agencies/${agencyId}`).get();
        if (!agencyDoc.exists) return;

        const agencyData = agencyDoc.data()!;
        const config = agencyData.distributionConfig;

        // Exit early: distribution not enabled for properties
        if (!config?.propertiesEnabled) return;

        const strictness: 'strict' | 'flexible' = config.strictness === 'strict' ? 'strict' : 'flexible';

        const city: string = property.address?.city || '';
        const context = {
            transactionType: property.transactionType,
            city,
        };

        const propertyRef = db.doc(`agencies/${agencyId}/properties/${propertyId}`);
        const result = await distributeToAgent(agencyId, propertyRef, context, 'property', strictness);

        if (!result) {
            await createAdminAlert(
                agencyId,
                'unassigned_property',
                'נכס לא שויך אוטומטית',
                `נכס חדש ב${city || 'מיקום לא ידוע'} לא נמצא לו סוכן מתאים — נא לשייך ידנית`,
                `/dashboard/properties/${propertyId}`,
            );
            console.log(`[distributeProperty] No eligible agent for property ${propertyId} — admin alert created`);
            return;
        }

        // In-app alert for assigned agent
        await db.collection('alerts').add({
            agencyId,
            targetAgentId: result.assignedAgentId,
            type: 'property_assigned',
            title: 'נכס חדש שויך אליך',
            message: `נכס חדש ב${city || 'מיקום לא ידוע'} שויך אליך אוטומטית`,
            link: `/dashboard/properties/${propertyId}`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // WhatsApp notification to assigned agent
        const integration: WhatsappIntegration | undefined = agencyData.whatsappIntegration?.isConnected
            ? (agencyData.whatsappIntegration as WhatsappIntegration)
            : undefined;

        if (integration && result.assignedAgentPhone) {
            const txLabel = property.transactionType === 'rent' ? 'להשכרה' : 'למכירה';
            const rooms = property.rooms ? `${property.rooms} חדרים ` : '';
            const msg =
                `🏠 נכס חדש שויך אליך! ${rooms}${txLabel} ב${city || 'מיקום לא ידוע'}. ` +
                `https://app.homer-crm.co.il/dashboard/properties/${propertyId}`;
            await sendWhatsAppMessage(integration, result.assignedAgentPhone, msg)
                .catch(err => console.error('[distributeProperty] WhatsApp notification failed:', err));
        }

        console.log(`[distributeProperty] Property ${propertyId} → agent ${result.assignedAgentId} (${result.assignedAgentName})`);
    }
);
