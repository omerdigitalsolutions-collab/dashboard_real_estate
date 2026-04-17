import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { evaluateMatch, MatchingProperty } from '../leads/matchingEngine';
import { notifyNewProperty, MatchedLead, newPropertyAlertSecrets } from '../notifications/newPropertyAlert';

const db = admin.firestore();

const BATCH_WRITE_LIMIT = 400;
const CLOSED_LEAD_STATUSES = ['lost', 'won'];

type WriteFn = (batch: admin.firestore.WriteBatch) => void;

async function commitWrites(writes: WriteFn[]) {
    for (let i = 0; i < writes.length; i += BATCH_WRITE_LIMIT) {
        const batch = db.batch();
        for (const fn of writes.slice(i, i + BATCH_WRITE_LIMIT)) fn(batch);
        await batch.commit();
    }
}

async function runAgencyMatchmaking(
    propertyId: string,
    propertyData: admin.firestore.DocumentData,
    agencyId: string,
) {
    const propertyCity = propertyData.city;
    const propertyPrice = propertyData.price;

    if (!agencyId || !propertyCity || propertyPrice === undefined) {
        console.log(`Matchmaking skipped for ${propertyId}: Missing city, price, or agencyId.`);
        return;
    }

    const matchingProp: MatchingProperty = {
        id: propertyId,
        city: propertyCity,
        neighborhood: propertyData.neighborhood || null,
        price: propertyPrice,
        rooms: propertyData.rooms ?? null,
        type: propertyData.type,
        hasElevator: propertyData.hasElevator ?? null,
        hasParking: propertyData.hasParking ?? null,
        hasBalcony: propertyData.hasBalcony ?? null,
        hasSafeRoom: propertyData.hasSafeRoom ?? null,
    };

    const leadsSnap = await db.collection('leads')
        .where('agencyId', '==', agencyId)
        .get();

    if (leadsSnap.empty) return;

    const writes: WriteFn[] = [];
    const matchedLeads: MatchedLead[] = [];

    leadsSnap.docs.forEach((doc) => {
        const lead = doc.data();
        if (lead.status && CLOSED_LEAD_STATUSES.includes(lead.status)) return;

        const reqs = lead.requirements;
        if (!reqs) return;

        const result = evaluateMatch(matchingProp, reqs);
        if (!result) return;

        matchedLeads.push({
            id: doc.id,
            name: lead.name,
            assignedAgentId: lead.assignedAgentId,
        });

        const alertRef = db.collection('alerts').doc(`${propertyId}_${doc.id}`);
        writes.push((batch) => batch.set(alertRef, {
            agencyId,
            targetAgentId: lead.assignedAgentId || 'all',
            type: 'property_match',
            title: 'התאמת נכס חדשה!',
            message: `נכס חדש ב${propertyCity} מתאים ל${lead.name || 'לקוח שלך'} (ציון: ${result.matchScore})`,
            link: `/dashboard/leads/${doc.id}`,
            propertyId,
            leadId: doc.id,
            matchScore: result.matchScore,
            matchCategory: result.category,
            requiresVerification: result.requiresVerification,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
        console.log(`Matchmaking: Property ${propertyId} matched with Lead ${doc.id} (score: ${result.matchScore})`);
    });

    const matchCount = matchedLeads.length;
    if (matchCount === 0) return;

    const isExternal = propertyData.listingType === 'external' || propertyData.source === 'whatsapp_group';
    if (isExternal) {
        const managerAlertRef = db.collection('alerts').doc(`${propertyId}_manager`);
        writes.push((batch) => batch.set(managerAlertRef, {
            agencyId,
            targetAgentId: 'all',
            type: 'external_property_match',
            title: 'הזדמנות שיתוף פעולה (B2B)!',
            message: `דירה חדשה ממשרד אחר התווספה ב${propertyCity} ותואמת ל-${matchCount} מחפשי דירות במשרד שלנו!`,
            link: `/dashboard/properties`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
    }

    await commitWrites(writes);
    console.log(`Matchmaking complete for ${propertyId}. Generated ${matchCount} client notifications.`);

    await notifyNewProperty({
        agencyId,
        property: {
            id: propertyId,
            source: propertyData.source ?? 'manual',
            city: propertyCity,
            price: propertyPrice,
            rooms: propertyData.rooms ?? undefined,
            type: propertyData.type,
            address: propertyData.address,
        },
        matchedLeads,
    });
}

/**
 * Triggered whenever a new document is added to the `properties` collection.
 * Runs the shared weighted matching engine against every active lead in the
 * same agency and emits deterministic alerts (idempotent on retries).
 */
export const onPropertyCreatedMatchmaking = onDocumentCreated(
    { document: 'properties/{propertyId}', secrets: newPropertyAlertSecrets },
    async (event) => {
        const propertyId = event.params.propertyId;
        const propertySnap = event.data;
        if (!propertySnap) return;

        const propertyData = propertySnap.data();
        const agencyId = propertyData.agencyId;

        try {
            await runAgencyMatchmaking(propertyId, propertyData, agencyId);
        } catch (err) {
            console.error(`Error during matchmaking for property ${propertyId}:`, err);
        }
    }
);

/**
 * Triggered when a WhatsApp-ingested draft lands in agencies/{agencyId}/whatsappProperties.
 * Reuses the same agency-scoped match logic; draft items marked isExclusive:false.
 */
export const onWhatsappPropertyCreatedMatchmaking = onDocumentCreated(
    { document: 'agencies/{agencyId}/whatsappProperties/{propertyId}', secrets: newPropertyAlertSecrets },
    async (event) => {
        const propertyId = event.params.propertyId;
        const agencyId = event.params.agencyId;
        const propertySnap = event.data;
        if (!propertySnap) return;

        const propertyData = propertySnap.data();

        try {
            await runAgencyMatchmaking(propertyId, propertyData, agencyId);
        } catch (err) {
            console.error(`Error during WhatsApp matchmaking for property ${propertyId}:`, err);
        }
    }
);

/**
 * Triggered whenever a new document is added to the public `cities/{cityName}/properties` collection.
 * Finds all active leads across ALL agencies that are looking in that city,
 * runs the weighted matching engine, and generates alerts for high/medium matches.
 */
export const onGlobalPropertyCreatedMatchmaking = onDocumentCreated(
    { document: 'cities/{cityName}/properties/{propertyId}', secrets: newPropertyAlertSecrets },
    async (event) => {
        const cityName = event.params.cityName;
        const propertyId = event.params.propertyId;
        const propertySnap = event.data;

        if (!propertySnap) return;

        const propertyData = propertySnap.data();
        const propertyPrice = propertyData.price;
        const propertyRooms = propertyData.rooms;
        const propertyType = propertyData.type;

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
            const leadsSnap = await db.collection('leads')
                .where('requirements.desiredCity', 'array-contains', cityName)
                .get();

            if (leadsSnap.empty) {
                console.log(`Global matchmaking: No leads found for city "${cityName}".`);
                return;
            }

            const writes: WriteFn[] = [];
            const perAgency = new Map<string, MatchedLead[]>();

            leadsSnap.docs.forEach((doc) => {
                const lead = doc.data();
                if (lead.status && CLOSED_LEAD_STATUSES.includes(lead.status)) return;

                const reqs = lead.requirements;
                if (!reqs) return;

                const result = evaluateMatch(matchingProp, reqs);
                if (!result) return;

                const leadAgencyId: string | undefined = lead.agencyId;
                if (!leadAgencyId) return;

                const bucket = perAgency.get(leadAgencyId) ?? [];
                bucket.push({ id: doc.id, name: lead.name, assignedAgentId: lead.assignedAgentId });
                perAgency.set(leadAgencyId, bucket);

                const alertRef = db.collection('alerts').doc(`global_${cityName}_${propertyId}_${doc.id}`);
                writes.push((batch) => batch.set(alertRef, {
                    agencyId: leadAgencyId,
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
                    requiresVerification: result.requiresVerification,
                    isRead: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }));

                console.log(`Global matchmaking: Public property ${propertyId} matched lead ${doc.id} (score: ${result.matchScore})`);
            });

            if (perAgency.size === 0) return;

            await commitWrites(writes);
            const totalMatches = Array.from(perAgency.values()).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`Global matchmaking complete for ${propertyId}. Created ${totalMatches} alerts across ${perAgency.size} agencies.`);

            await Promise.all(
                Array.from(perAgency.entries()).map(([agencyId, matchedLeads]) =>
                    notifyNewProperty({
                        agencyId,
                        property: {
                            id: propertyId,
                            source: propertyData.source ?? 'global',
                            city: propertyData.city || cityName,
                            price: propertyPrice,
                            rooms: propertyRooms ?? undefined,
                            type: propertyType,
                            address: propertyData.address,
                        },
                        matchedLeads,
                    }).catch((err: unknown) => console.error(`notifyNewProperty failed for agency ${agencyId}:`, err))
                )
            );

        } catch (err) {
            console.error(`Error during global matchmaking for property ${propertyId}:`, err);
        }
    }
);
