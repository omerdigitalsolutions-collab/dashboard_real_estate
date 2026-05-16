import * as admin from 'firebase-admin';
import { ApifyClient } from 'apify-client';
import { classifyFBPost, extractPhone, extractThumbnail } from '../utils/fbClassifier';
import { cleanDescription } from '../utils/descriptionCleaner';

const db = admin.firestore();
const CHUNK = 400;

export interface FBGroupConfig {
    url: string;
    defaultCity: string;
    name?: string;
}

export interface ScrapeResult {
    city: string;
    imported: number;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

export async function scrapeGroupAndWrite(
    apify: ApifyClient,
    cookies: any[],
    group: FBGroupConfig,
    since: Date,
    maxPosts: number,
): Promise<ScrapeResult> {
    const city = group.defaultCity;

    const run = await apify.actor('apify/facebook-groups-scraper').call({
        startUrls: [{ url: group.url }],
        onlyPostsNewerThan: since.toISOString(),
        maxPosts,
        proxyConfiguration: { useApifyProxy: true, groups: ['RESIDENTIAL'], countryCode: 'IL' },
        initialCookies: cookies,
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    const recentItems = (items as any[]).filter(raw =>
        !raw?.time || new Date(raw.time).getTime() >= since.getTime()
    );

    // Pre-fetch existing lead IDs — single batch read to protect status + createdAt
    const postIds = recentItems
        .map((raw: any) => raw?.id || raw?.legacyId)
        .filter(Boolean) as string[];

    const existingLeads = new Set<string>();
    if (postIds.length > 0) {
        const refs = postIds.map(id => db.collection('facebook_leads').doc(id));
        const snaps = await db.getAll(...refs);
        snaps.forEach(s => { if (s.exists) existingLeads.add(s.id); });
    }

    type WriteOp =
        | { ref: admin.firestore.DocumentReference; data: any; mode: 'set' }
        | { ref: admin.firestore.DocumentReference; data: any; mode: 'set-merge' }
        | { ref: admin.firestore.DocumentReference; data: any; mode: 'update' };

    const writes: WriteOp[] = [];
    let imported = 0;

    for (const raw of recentItems) {
        const postId: string | undefined = raw?.id || raw?.legacyId;
        if (!postId) continue;

        const text: string = raw.text || '';
        if (classifyFBPost(text) !== 'PRIVATE') continue;

        const phone = extractPhone(text);
        const thumbnail = extractThumbnail(raw.attachments);
        const publisherName: string = raw?.user?.name || 'לא ידוע';
        const postUrl: string = raw?.url || group.url;
        const publishedAt = raw?.time ? new Date(raw.time) : null;
        const isNew = !existingLeads.has(postId);

        // cities/{city}/properties/{postId}
        writes.push({
            ref: db.collection('cities').doc(city).collection('properties').doc(postId),
            data: {
                source: 'facebook_group',
                city,
                address: { city, street: '', number: '', neighborhood: '', fullAddress: city },
                transactionType: 'forsale',
                propertyType: 'apartment',
                status: 'draft',
                management: { descriptions: cleanDescription(text) },
                publisherName, phone, postUrl, thumbnail, publishedAt,
                rooms: null, squareMeters: null,
                financials: { price: 0, originalPrice: null },
                media: { mainImage: thumbnail, images: thumbnail ? [thumbnail] : [] },
                lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
                ...(isNew ? {
                    isGlobalCityProperty: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                } : {}),
            },
            mode: 'set-merge',
        });

        if (!isNew) {
            // Update only mutable fields — protect status + createdAt on existing leads
            writes.push({
                ref: db.collection('facebook_leads').doc(postId),
                data: {
                    publisherName, phone, text, postUrl, thumbnail, publishedAt,
                    sourceGroup: group.url, groupName: group.name || '', city,
                    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                mode: 'update',
            });
        } else {
            writes.push({
                ref: db.collection('facebook_leads').doc(postId),
                data: {
                    city, propertyId: postId, publisherName, phone, text,
                    postUrl, thumbnail, publishedAt,
                    sourceGroup: group.url, groupName: group.name || '',
                    source: 'facebook_group', status: 'new',
                    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                mode: 'set',
            });
            imported++;
        }
    }

    for (const chunk of chunkArray(writes, CHUNK)) {
        const batch = db.batch();
        for (const op of chunk) {
            if (op.mode === 'set') batch.set(op.ref, op.data);
            else if (op.mode === 'set-merge') batch.set(op.ref, op.data, { merge: true });
            else batch.update(op.ref, op.data);
        }
        await batch.commit();
    }

    return { city, imported };
}
