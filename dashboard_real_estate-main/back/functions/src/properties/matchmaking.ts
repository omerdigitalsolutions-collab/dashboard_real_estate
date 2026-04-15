import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { evaluateMatch, MatchingProperty } from '../leads/matchingEngine';

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
                // If this is an external property, alert the manager/entire office
                const isExternal = propertyData.listingType === 'external' || propertyData.source === 'whatsapp_group';
                if (isExternal) {
                    const managerAlertRef = db.collection('alerts').doc();
                    batch.set(managerAlertRef, {
                        agencyId,
                        targetAgentId: 'all', // Send to everyone or specifically admins via frontend filtering
                        type: 'external_property_match',
                        title: 'הזדמנות שיתוף פעולה (B2B)!',
                        message: `דירה חדשה ממשרד אחר התווספה ב${propertyCity} ותואמת ל-${matchCount} מחפשי דירות במשרד שלנו!`,
                        link: `/dashboard/properties`, // Adjust to properties list since we can't link to a nonexistent deal
                        isRead: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }

                await batch.commit();
                console.log(`Matchmaking complete for ${propertyId}. Generated ${matchCount} client notifications and potentially 1 manager notification.`);
            }

        } catch (err) {
            console.error(`Error during matchmaking for property ${propertyId}:`, err);
        }
    }
);

/**
 * Triggered whenever a new document is added to the public `cities/{cityName}/properties` collection.
 * Finds all active leads across ALL agencies that are looking in that city,
 * runs the weighted matching engine, and generates alerts for high/medium matches.
 */
export const onGlobalPropertyCreatedMatchmaking = onDocumentCreated(
    'cities/{cityName}/properties/{propertyId}',
    async (event) => {
        const cityName = event.params.cityName;
        const propertyId = event.params.propertyId;
        const propertySnap = event.data;

        if (!propertySnap) return;

        const propertyData = propertySnap.data();
        const propertyPrice = propertyData.price;
        const propertyRooms = propertyData.rooms;
        const propertyType = propertyData.type; // 'sale' | 'rent'

        // Skip if missing critical data
        if (!propertyPrice || !propertyType) {
            console.log(`Global matchmaking skipped for ${propertyId}: Missing price or type.`);
            return;
        }

        const matchingProp: MatchingProperty = {
            id: propertyId,
            city: propertyData.city || cityName,
            neighborhood: propertyData.neighborhood || null,
            price: propertyPrice,
            rooms: propertyRooms ?? null,
            type: propertyType,
            hasElevator: propertyData.hasElevator ?? null,
            hasParking: propertyData.hasParking ?? null,
            hasBalcony: propertyData.hasBalcony ?? null,
            hasSafeRoom: propertyData.hasSafeRoom ?? null,
        };

        try {
            // Query all active leads looking in this city (across all agencies)
            const leadsSnap = await db.collection('leads')
                .where('requirements.desiredCity', 'array-contains', cityName)
                .where('status', 'not-in', ['lost', 'won'])
                .get();

            if (leadsSnap.empty) {
                console.log(`Global matchmaking: No active leads found for city "${cityName}".`);
                return;
            }

            const batch = db.batch();
            let matchCount = 0;

            leadsSnap.docs.forEach((doc) => {
                const lead = doc.data();
                const reqs = lead.requirements;
                if (!reqs) return;

                const result = evaluateMatch(matchingProp, reqs);
                if (!result) return;

                matchCount++;
                const alertRef = db.collection('alerts').doc();
                batch.set(alertRef, {
                    agencyId: lead.agencyId,
                    targetAgentId: lead.assignedAgentId || 'all',
                    type: 'global_property_match',
                    title: 'נכס מהמאגר הציבורי תואם ללקוח!',
                    message: `נמצא נכס ב${cityName} מהמאגר הציבורי שתואם ל${lead.name || 'לקוח שלך'} (ציון: ${result.matchScore})`,
                    link: `/dashboard/leads/${doc.id}`,
                    propertyId: propertyId,
                    propertyCollectionPath: `cities/${cityName}/properties`,
                    leadId: doc.id,
                    matchScore: result.matchScore,
                    matchCategory: result.category,
                    isRead: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                console.log(`Global matchmaking: Public property ${propertyId} matched lead ${doc.id} (score: ${result.matchScore})`);
            });

            if (matchCount > 0) {
                await batch.commit();
                console.log(`Global matchmaking complete for ${propertyId}. Created ${matchCount} alerts.`);
            }

        } catch (err) {
            console.error(`Error during global matchmaking for property ${propertyId}:`, err);
        }
    }
);
