import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Triggered whenever a new document is added to the `properties` collection.
 * Finds all active leads in the same agency who are looking to buy (`intent == 'buy'`),
 * compares basic matching criteria (city and budget), and generates an alert.
 */
export const onPropertyCreatedMatchmaking = onDocumentCreated(
    'properties/{propertyId}',
    async (event) => {
        const propertyId = event.params.propertyId;
        const propertySnap = event.data;

        if (!propertySnap) return;

        const propertyData = propertySnap.data();
        const agencyId = propertyData.agencyId;
        const propertyCity = propertyData.city;
        const propertyPrice = propertyData.price;
        const propertyVat = propertyData.vat || false;

        // Only proceed if it is a property for sale/rent that has actual details
        // (If it's just a WhatsApp 'draft', it might not have price or city yet)
        if (!agencyId || !propertyCity || propertyPrice === undefined) {
            console.log(`Matchmaking skipped for ${propertyId}: Missing city, price, or agencyId.`);
            return;
        }

        try {
            // Find all active 'buy' (or 'rent', depending on your standard `intent` definition) leads in the same agency
            const leadsSnap = await db.collection('leads')
                .where('agencyId', '==', agencyId)
                .where('status', 'not-in', ['lost', 'won']) // Assuming you don't match closed leads
                .get();

            if (leadsSnap.empty) {
                return;
            }

            // We will batch our notification creation
            const batch = db.batch();
            let matchCount = 0;

            leadsSnap.docs.forEach((doc) => {
                const lead = doc.data();
                const reqs = lead.requirements;

                // Skip leads with no requirements
                if (!reqs) return;

                let isMatch = true;

                // 1. Check City Intent
                if (reqs.desiredCity && Array.isArray(reqs.desiredCity) && reqs.desiredCity.length > 0) {
                    if (!reqs.desiredCity.includes(propertyCity)) {
                        isMatch = false;
                    }
                }

                // 2. Check Max Budget
                if (isMatch && reqs.maxBudget) {
                    // Note: complex VAT inclusive/exclusive logic could go here
                    if (propertyPrice > reqs.maxBudget) {
                        isMatch = false;
                    }
                }

                // 3. Check Min Rooms
                if (isMatch && reqs.minRooms && propertyData.rooms != null) {
                    if (propertyData.rooms < reqs.minRooms) {
                        isMatch = false;
                    }
                }

                if (isMatch) {
                    matchCount++;
                    const notificationRef = db.collection('alerts').doc();
                    batch.set(notificationRef, {
                        agencyId,
                        targetAgentId: doc.data().assignedAgentId || 'all',
                        type: 'property_match',
                        title: 'התאמת נכס חדשה!',
                        message: `הנכס החדש שנוסף ב${propertyCity} מתאים במדויק ללקוח ${lead.name || 'שלך'}!`,
                        link: `/dashboard/leads/${doc.id}`,
                        propertyId: propertyId,
                        leadId: doc.id,
                        isRead: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`Matchmaking: Property ${propertyId} matched with Lead ${doc.id}`);
                }
            });

            if (matchCount > 0) {
                await batch.commit();
                console.log(`Matchmaking complete for ${propertyId}. Generated ${matchCount} notifications.`);
            }

        } catch (err) {
            console.error(`Error during matchmaking for property ${propertyId}:`, err);
        }
    }
);
