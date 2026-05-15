/**
 * Daily Facebook group scanner.
 *
 * For each agency that has the Facebook scraper enabled, runs the Apify
 * "facebook-groups-scraper" actor against up to 3 configured group URLs,
 * classifies each post as PRIVATE (direct seller) or BROKER, and:
 *   - PRIVATE → creates a draft Property (with cleaned description) +
 *               a seller Lead, both linked back to the fb_leads doc.
 *   - BROKER  → just stores the raw fb_leads record for visibility.
 *
 * Document ID in fb_leads is the Facebook post id, so the function is
 * idempotent — re-runs skip posts already saved.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { ApifyClient } from 'apify-client';
import { classifyFBPost, extractPhone, extractThumbnail } from '../utils/fbClassifier';
import { cleanDescription } from '../utils/descriptionCleaner';

const db = admin.firestore();
const apifyToken = defineSecret('APIFY_TOKEN');

interface FBGroupConfig {
    url: string;
    defaultCity: string;
}

interface FacebookScraperConfig {
    enabled: boolean;
    groups: FBGroupConfig[];
}

const APIFY_ACTOR = 'apify/facebook-groups-scraper';

export const facebookScanner = onSchedule(
    {
        schedule: '0 8 * * *',
        timeZone: 'Asia/Jerusalem',
        memory: '512MiB',
        timeoutSeconds: 540,
        secrets: [apifyToken],
    },
    async () => {
        logger.info('[facebookScanner] starting daily run');

        const agenciesSnap = await db
            .collection('agencies')
            .where('facebookScraper.enabled', '==', true)
            .get();

        if (agenciesSnap.empty) {
            logger.info('[facebookScanner] no agencies with scraper enabled');
            return;
        }

        const apify = new ApifyClient({ token: apifyToken.value() });

        for (const agencyDoc of agenciesSnap.docs) {
            const agencyId = agencyDoc.id;
            const config = agencyDoc.data().facebookScraper as FacebookScraperConfig | undefined;
            if (!config || !Array.isArray(config.groups)) continue;

            for (const group of config.groups) {
                if (!group?.url) continue;

                try {
                    await scanGroup(apify, agencyId, group);
                } catch (err) {
                    logger.error(`[facebookScanner] agency=${agencyId} group=${group.url} failed`, err);
                }
            }
        }

        logger.info('[facebookScanner] finished');
    }
);

async function scanGroup(apify: ApifyClient, agencyId: string, group: FBGroupConfig): Promise<void> {
    logger.info(`[facebookScanner] scanning agency=${agencyId} group=${group.url}`);

    // midnight today in Israel time
    const todayIL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    todayIL.setHours(0, 0, 0, 0);
    const since = todayIL;
    const sinceIso = since.toISOString();

    const run = await apify.actor(APIFY_ACTOR).call({
        startUrls: [{ url: group.url }],
        onlyPostsNewerThan: sinceIso,
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    // client-side guard: skip anything older than 24 h (in case the actor ignores the param)
    const recentItems = (items as any[]).filter(raw => {
        if (!raw?.time) return true;
        return new Date(raw.time).getTime() >= since.getTime();
    });

    logger.info(`[facebookScanner] agency=${agencyId} group=${group.url} fetched ${items.length} posts, ${recentItems.length} within 24 h`);

    for (const raw of recentItems) {
        const postId: string | undefined = raw?.id || raw?.legacyId;
        if (!postId) continue;

        const fbLeadRef = db.collection('fb_leads').doc(postId);
        const existing = await fbLeadRef.get();
        if (existing.exists) continue;

        const text: string = raw.text || '';
        const type = classifyFBPost(text);
        const phone = extractPhone(text);
        const thumbnail = extractThumbnail(raw.attachments);
        const publisherName: string = raw?.user?.name || 'לא ידוע';
        const postUrl: string = raw?.url || group.url;
        const publishedAt: string = raw?.time || new Date().toISOString();

        let leadId: string | null = null;
        let propertyId: string | null = null;

        if (type === 'PRIVATE') {
            try {
                const cleanedDescription = cleanDescription(text);
                const propertyRef = await db
                    .collection('agencies')
                    .doc(agencyId)
                    .collection('properties')
                    .add({
                        agencyId,
                        transactionType: 'forsale',
                        propertyType: 'apartment',
                        status: 'draft',
                        source: 'facebook_group',
                        isExclusive: false,
                        rooms: null,
                        floor: null,
                        totalFloors: null,
                        squareMeters: null,
                        address: {
                            city: group.defaultCity,
                            street: '',
                            number: '',
                            neighborhood: '',
                            fullAddress: group.defaultCity,
                        },
                        features: {
                            hasElevator: null,
                            hasParking: null,
                            parkingSpots: null,
                            hasBalcony: null,
                            hasMamad: null,
                            hasStorage: null,
                            isRenovated: null,
                            isFurnished: null,
                            hasAirConditioning: null,
                        },
                        financials: {
                            price: 0,
                            originalPrice: null,
                        },
                        media: {
                            mainImage: thumbnail || null,
                            images: thumbnail ? [thumbnail] : [],
                            videoTourUrl: null,
                        },
                        management: {
                            assignedAgentId: null,
                            descriptions: cleanedDescription,
                        },
                        visibility: 'draft',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                propertyId = propertyRef.id;

                const leadRef = await db.collection('leads').add({
                    agencyId,
                    type: 'seller',
                    name: publisherName,
                    phone: phone || '',
                    source: 'facebook_group',
                    assignedAgentId: null,
                    status: 'new',
                    requirements: {
                        desiredCity: [group.defaultCity],
                        maxBudget: null,
                        minRooms: null,
                        maxRooms: null,
                        minSizeSqf: null,
                        floorMin: null,
                        floorMax: null,
                        propertyType: [],
                        mustHaveElevator: false,
                        mustHaveParking: false,
                        mustHaveBalcony: false,
                        mustHaveSafeRoom: false,
                        condition: 'any',
                        urgency: 'flexible',
                    },
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                leadId = leadRef.id;
            } catch (err) {
                logger.error(`[facebookScanner] failed creating lead/property for post=${postId}`, err);
            }
        }

        await fbLeadRef.set({
            agencyId,
            sourceGroup: group.url,
            city: group.defaultCity,
            publisherName,
            text,
            postUrl,
            publishedAt,
            phone,
            thumbnail,
            type,
            leadId,
            propertyId,
            status: 'new',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
}
