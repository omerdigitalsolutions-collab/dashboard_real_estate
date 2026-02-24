import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

export const triggerSystemAlert = onDocumentUpdated('deals/{dealId}', async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;

    // We only care when the deal enters the "won" stage.
    if (before.stage !== 'won' && after.stage === 'won') {
        const agencyId = after.agencyId;
        const agentId = after.createdBy;
        const propertyId = after.propertyId;
        const actualCommission = after.actualCommission ?? after.projectedCommission ?? 0;

        // Fetch related entities for rich alert content
        let agentName = 'סוכן לא ידוע';
        let propertyAddress = 'נכס לא ידוע';

        try {
            const [userDoc, propDoc] = await Promise.all([
                db.doc(`users/${agentId}`).get(),
                db.doc(`properties/${propertyId}`).get()
            ]);

            if (userDoc.exists) {
                agentName = userDoc.data()?.displayName || userDoc.data()?.email || agentName;
            }
            if (propDoc.exists) {
                propertyAddress = propDoc.data()?.address || propertyAddress;
            }

            // Create the broadcast alert document in the `alerts` collection
            await db.collection('alerts').add({
                agencyId,
                targetAgentId: 'all', // Broadcast to everyone in the agency
                title: 'עסקה חדשה נסגרה!',
                message: `סוכן ${agentName} סגר הרגע עסקה בנכס ${propertyAddress} עם עמלה פוטנציאלית של ${actualCommission.toLocaleString()} ש"ח!`,
                type: 'deal_won',
                isRead: false,
                relatedTo: {
                    id: event.params.dealId,
                    type: 'deal'
                },
                createdAt: FieldValue.serverTimestamp()
            });

            console.info(`[triggerSystemAlert] Broadcasted 'deal_won' alert for deal ${event.params.dealId} at ${agencyId}.`);
        } catch (err) {
            console.error(`[triggerSystemAlert] Error generating alert for deal ${event.params.dealId}:`, err);
        }
    }
});
