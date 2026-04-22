import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { evaluateMatch, MatchingProperty } from '../leads/matchingEngine';
import { normalizeCity, isCityMatch } from '../leads/stringUtils';
import { notifyNewProperty, MatchedLead, newPropertyAlertSecrets } from '../notifications/newPropertyAlert';

const db = admin.firestore();

const BATCH_WRITE_LIMIT = 400;
const CLOSED_LEAD_STATUSES = ['lost', 'won'];

type WriteFn = (batch: admin.firestore.WriteBatch) => void;

// In-memory cache for city catalog
let cachedCityNames: string[] | null = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

async function getCompatibleCities(cityName: string): Promise<string[]> {
    const now = Date.now();
    if (!cachedCityNames || (now - lastCacheUpdate > CACHE_TTL)) {
        try {
            const snapshot = await db.collection('cities').select().get();
            cachedCityNames = snapshot.docs.map(doc => doc.id);
            lastCacheUpdate = now;
        } catch (err) {
            console.error('Error fetching city catalog for matchmaking:', err);
            return [cityName];
        }
    }

    // Find all names in our catalog that match the incoming cityName (substring match both ways)
    // E.g. for "תל אביב יפו", find ["תל אביב", "תל אביב-יפו", "יפו"]
    const matches = cachedCityNames.filter(c => isCityMatch([c], cityName));
    
    // Always include the original name just in case
    if (!matches.includes(cityName)) matches.push(cityName);
    
    return matches;
}

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
    const propertyCity = propertyData.address?.city || propertyData.city;
    const propertyPrice = propertyData.financials?.price ?? propertyData.price;

    if (!agencyId || !propertyCity || propertyPrice === undefined) {
        console.log(`Matchmaking skipped for ${propertyId}: Missing city, price, or agencyId.`);
        return;
    }

    const matchingProp: MatchingProperty = {
        id: propertyId,
        city: propertyCity,
        neighborhood: propertyData.address?.neighborhood || propertyData.neighborhood || null,
        street: propertyData.address?.street || propertyData.street || null,
        price: propertyPrice,
        rooms: propertyData.rooms ?? null,
        transactionType: propertyData.transactionType || propertyData.type || 'forsale',
        hasElevator: propertyData.features?.hasElevator ?? propertyData.hasElevator ?? null,
        hasParking: propertyData.features?.hasParking ?? propertyData.hasParking ?? null,
        hasBalcony: propertyData.features?.hasBalcony ?? propertyData.hasBalcony ?? null,
        hasMamad: propertyData.features?.hasMamad ?? propertyData.hasSafeRoom ?? null,
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
    const isYad2OrMadlan = propertyData.source === 'yad2_alert' || propertyData.source === 'madlan_alert';
    if (matchCount === 0 && !isYad2OrMadlan) return;

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
            source: (typeof propertyData.source === 'string' ? propertyData.source : propertyData.source?.origin) ?? 'manual',
            city: propertyCity,
            price: propertyPrice,
            rooms: propertyData.rooms ?? undefined,
            transactionType: propertyData.transactionType || propertyData.type,
            address: propertyData.address?.fullAddress || propertyData.address,
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
    { document: 'agencies/{agencyId}/properties/{propertyId}', secrets: newPropertyAlertSecrets },
    async (event) => {
        const propertyId = event.params.propertyId;
        const agencyId = event.params.agencyId;
        const propertySnap = event.data;
        if (!propertySnap) return;

        const propertyData = propertySnap.data();

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
        // Cities collection docs still use flat schema
        const propertyPrice = propertyData.financials?.price ?? propertyData.price;
        const propertyRooms = propertyData.rooms;
        const propertyType = propertyData.transactionType || propertyData.type;

        if (!propertyPrice || !propertyType) {
            console.log(`Global matchmaking skipped for ${propertyId}: Missing price or type.`);
            return;
        }

        const matchingProp: MatchingProperty = {
            id: propertyId,
            city: propertyData.address?.city || propertyData.city || cityName,
            neighborhood: propertyData.address?.neighborhood || propertyData.neighborhood || null,
            street: propertyData.address?.street || propertyData.street || null,
            price: propertyPrice,
            rooms: propertyRooms ?? null,
            transactionType: propertyType,
            hasElevator: propertyData.features?.hasElevator ?? propertyData.hasElevator ?? null,
            hasParking: propertyData.features?.hasParking ?? propertyData.hasParking ?? null,
            hasBalcony: propertyData.features?.hasBalcony ?? propertyData.hasBalcony ?? null,
            hasMamad: propertyData.features?.hasMamad ?? propertyData.hasSafeRoom ?? null,
        };

        try {
            // 1. Find all potential city names that leads might be using to refer to this city
            // E.g. if cityName is "תל אביב יפו", candidates might be ["תל אביב", "תל אביב-יפו"]
            const candidateCities = await getCompatibleCities(cityName);
            
            // 2. Fetch leads looking for ANY of these candidates
            // array-contains-any limit is 10, so we slice if needed
            const leadsSnap = await db.collection('leads')
                .where('requirements.desiredCity', 'array-contains-any', candidateCities.slice(0, 10))
                .get();

            const isGlobalYad2OrMadlan = propertyData.source === 'yad2_alert' || propertyData.source === 'madlan_alert';

            if (leadsSnap.empty) {
                console.log(`Global matchmaking: No leads found for city "${cityName}".`);
                // For Yad2/Madlan we still want to notify, but without any leads we don't know which agencies to notify
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

            // For Yad2/Madlan: also notify agencies with leads in the city that had no matches
            if (isGlobalYad2OrMadlan) {
                leadsSnap.docs.forEach((doc) => {
                    const leadAgencyId: string | undefined = doc.data().agencyId;
                    if (leadAgencyId && !perAgency.has(leadAgencyId)) {
                        perAgency.set(leadAgencyId, []);
                    }
                });
            }

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
