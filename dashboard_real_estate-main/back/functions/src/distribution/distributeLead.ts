import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { distributeToAgent, createAdminAlert } from './distributionEngine';
import { sendWhatsAppMessage, WhatsappIntegration } from '../whatsappService';

const db = admin.firestore();

/**
 * Triggered when a new lead document is created.
 * If the lead is unassigned and the agency has distribution enabled,
 * finds the best matching available agent and assigns the lead atomically.
 */
export const distributeLead = onDocumentCreated(
    { document: 'leads/{leadId}' },
    async (event) => {
        const leadSnap = event.data;
        if (!leadSnap) return;

        const lead = leadSnap.data();
        const leadId = event.params.leadId;
        const agencyId: string | undefined = lead.agencyId;

        // Exit early: already assigned (e.g., created via missed call handler)
        if (lead.assignedAgentId) return;
        if (!agencyId) return;

        const agencyDoc = await db.doc(`agencies/${agencyId}`).get();
        if (!agencyDoc.exists) return;

        const agencyData = agencyDoc.data()!;
        const config = agencyData.distributionConfig;

        // Exit early: distribution not enabled for leads
        if (!config?.leadsEnabled) return;

        const strictness: 'strict' | 'flexible' = config.strictness === 'strict' ? 'strict' : 'flexible';

        const context = {
            transactionType: lead.requirements?.transactionType,
            desiredCities: (lead.requirements?.desiredCity as string[]) || [],
        };

        const leadRef = db.doc(`leads/${leadId}`);
        const result = await distributeToAgent(agencyId, leadRef, context, 'lead', strictness);

        if (!result) {
            // No eligible agent found → notify admin
            await createAdminAlert(
                agencyId,
                'unassigned_lead',
                'ליד לא שויך אוטומטית',
                `ליד חדש (${lead.name || 'לא ידוע'}) לא נמצא לו סוכן מתאים — נא לשייך ידנית`,
                `/dashboard/leads/${leadId}`,
            );
            console.log(`[distributeLead] No eligible agent for lead ${leadId} — admin alert created`);
            return;
        }

        // Create in-app alert for the assigned agent
        await db.collection('alerts').add({
            agencyId,
            targetAgentId: result.assignedAgentId,
            type: 'lead_assigned',
            title: 'ליד חדש שויך אליך',
            message: `ליד חדש (${lead.name || 'לא ידוע'}) שויך אליך אוטומטית`,
            link: `/dashboard/leads/${leadId}`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // WhatsApp notification to assigned agent
        const integration: WhatsappIntegration | undefined = agencyData.whatsappIntegration?.isConnected
            ? (agencyData.whatsappIntegration as WhatsappIntegration)
            : undefined;

        if (integration && result.assignedAgentPhone) {
            const cities = context.desiredCities.filter(Boolean).join(', ');
            const locationPart = cities ? `ב${cities}` : '';
            const msg =
                `🔥 ליד חדש! ${lead.name || 'לקוח'} ${locationPart ? `מחפש ${locationPart}` : ''}. ` +
                `הוא מחכה לשיחה ממך. https://app.homer-crm.co.il/dashboard/leads/${leadId}`;
            await sendWhatsAppMessage(integration, result.assignedAgentPhone, msg)
                .catch(err => console.error('[distributeLead] WhatsApp notification failed:', err));
        }

        console.log(`[distributeLead] Lead ${leadId} → agent ${result.assignedAgentId} (${result.assignedAgentName})`);
    }
);
