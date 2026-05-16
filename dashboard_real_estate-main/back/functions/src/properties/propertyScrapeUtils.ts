import * as admin from 'firebase-admin';
import { ApifyClient } from 'apify-client';

const db = admin.firestore();
const BATCH_CHUNK_SIZE = 400;

export function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NormalizedProperty {
    docId:           string;
    source:          'yad2' | 'madlan';
    listingId:       string;
    listingUrl:      string;
    city:            string;
    address:         { city: string; street: string; number: string; neighborhood: string; fullAddress: string };
    transactionType: 'forsale' | 'rent';
    propertyType:    string;
    rooms:           number | null;
    squareMeters:    number | null;
    floor:           number | null;
    totalFloors:     number | null;
    financials:      { price: number; originalPrice: number | null; pricePerMeter: number | null };
    thumbnail:       string | null;
    media:           { mainImage: string | null; images: string[] };
    management:      { descriptions: string };
    publisherName:   string | null;
    phone:           string | null;
    agentListing:    boolean;
    publishedAt:     admin.firestore.Timestamp | null;
}

export interface ScrapeAndWriteResult {
    imported: number;
    updated:  number;
    city:     string;
}

// ── Normalizers ───────────────────────────────────────────────────────────────

export function normalizeYad2Item(raw: any, city: string): NormalizedProperty | null {
    const listingId = raw?.id ?? raw?.token;
    if (!listingId) return null;

    return {
        docId:       `yad2_${listingId}`,
        source:      'yad2',
        listingId:   String(listingId),
        listingUrl:  raw?.url ?? `https://www.yad2.co.il/item/${listingId}`,
        city,
        address: {
            city,
            street:       raw?.street       ?? '',
            number:       raw?.houseNum     ?? '',
            neighborhood: raw?.neighborhood ?? '',
            fullAddress:  [raw?.street, raw?.houseNum, city].filter(Boolean).join(' '),
        },
        transactionType: raw?.categoryId === 1 ? 'forsale' : 'rent',
        propertyType:    raw?.subcategoryId?.toString() ?? 'apartment',
        rooms:           raw?.rooms        ?? null,
        squareMeters:    raw?.squareMeter  ?? null,
        floor:           raw?.floor        ?? null,
        totalFloors:     raw?.totalFloors  ?? null,
        financials: {
            price:         raw?.price         ?? 0,
            originalPrice: raw?.originalPrice ?? null,
            pricePerMeter: raw?.pricePerMeter ?? null,
        },
        thumbnail:       raw?.mainImage    ?? raw?.images?.[0] ?? null,
        media: {
            mainImage:   raw?.mainImage    ?? null,
            images:      raw?.images       ?? [],
        },
        management: {
            descriptions: raw?.info ?? raw?.additionalDetails ?? '',
        },
        publisherName:   raw?.contactName  ?? null,
        phone:           raw?.phone        ?? null,
        agentListing:    raw?.abovePrice === true || raw?.adType === 'commercial',
        publishedAt:     raw?.date
            ? admin.firestore.Timestamp.fromDate(new Date(raw.date))
            : null,
    };
}

export function normalizeMadlanItem(raw: any, city: string): NormalizedProperty | null {
    const listingId = raw?.id ?? raw?.listingId;
    if (!listingId) return null;

    return {
        docId:       `madlan_${listingId}`,
        source:      'madlan',
        listingId:   String(listingId),
        listingUrl:  raw?.url ?? `https://www.madlan.co.il/listing/${listingId}`,
        city,
        address: {
            city,
            street:       raw?.street       ?? '',
            number:       raw?.streetNumber ?? '',
            neighborhood: raw?.neighborhood ?? '',
            fullAddress:  raw?.address      ?? city,
        },
        transactionType: raw?.dealType === 'FOR_SALE' ? 'forsale' : 'rent',
        propertyType:    raw?.assetType?.toLowerCase() ?? 'apartment',
        rooms:           raw?.rooms        ?? null,
        squareMeters:    raw?.squareMeters ?? null,
        floor:           raw?.floor        ?? null,
        totalFloors:     raw?.totalFloors  ?? null,
        financials: {
            price:         raw?.price         ?? 0,
            originalPrice: raw?.originalPrice ?? null,
            pricePerMeter: raw?.pricePerSqm   ?? null,
        },
        thumbnail:       raw?.images?.[0]  ?? null,
        media: {
            mainImage:   raw?.images?.[0]  ?? null,
            images:      raw?.images       ?? [],
        },
        management: {
            descriptions: raw?.description ?? '',
        },
        publisherName:   raw?.contactName  ?? null,
        phone:           raw?.phone        ?? null,
        agentListing:    raw?.isAgent      ?? false,
        publishedAt:     raw?.listingDate
            ? admin.firestore.Timestamp.fromDate(new Date(raw.listingDate))
            : null,
    };
}

// ── Core write function ───────────────────────────────────────────────────────

/**
 * Calls an Apify actor, normalizes results, and writes to cities/{city}/properties.
 *
 * Freshness fields (isNew, addedToHomerAt, createdAt, isGlobalCityProperty) are
 * set ONLY on genuinely new documents. Existing docs only receive updatedAt.
 */
export async function scrapeAndWrite(
    apify: ApifyClient,
    actorId: string,
    actorInput: Record<string, any>,
    city: string,
    normalize: (raw: any, city: string) => NormalizedProperty | null,
): Promise<ScrapeAndWriteResult> {

    const run = await apify.actor(actorId).call(actorInput);
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    const normalized = (items as any[])
        .map(raw => normalize(raw, city))
        .filter((p): p is NormalizedProperty => p !== null);

    if (normalized.length === 0) {
        return { imported: 0, updated: 0, city };
    }

    // Pre-fetch which doc IDs exist to correctly gate freshness fields
    const docIds = normalized.map(p => p.docId);
    const existingIds = new Set<string>();

    for (const chunk of chunkArray(docIds, 100)) {
        const snaps = await Promise.all(
            chunk.map(id =>
                db.collection('cities').doc(city).collection('properties').doc(id).get()
            )
        );
        snaps.forEach((snap, i) => {
            if (snap.exists) existingIds.add(chunk[i]);
        });
    }

    const writes: { ref: admin.firestore.DocumentReference; data: any; isNew: boolean }[] = [];

    for (const prop of normalized) {
        const isNew = !existingIds.has(prop.docId);
        const ref = db.collection('cities').doc(city).collection('properties').doc(prop.docId);

        writes.push({
            ref,
            isNew,
            data: {
                source:          prop.source,
                listingId:       prop.listingId,
                listingUrl:      prop.listingUrl,
                city:            prop.city,
                address:         prop.address,
                transactionType: prop.transactionType,
                propertyType:    prop.propertyType,
                rooms:           prop.rooms,
                squareMeters:    prop.squareMeters,
                floor:           prop.floor,
                totalFloors:     prop.totalFloors,
                financials:      prop.financials,
                thumbnail:       prop.thumbnail,
                media:           prop.media,
                management:      prop.management,
                publisherName:   prop.publisherName,
                phone:           prop.phone,
                agentListing:    prop.agentListing,
                publishedAt:     prop.publishedAt,
                updatedAt:       admin.firestore.FieldValue.serverTimestamp(),

                // Set on first write only
                ...(isNew ? {
                    isNew:                true,
                    addedToHomerAt:       admin.firestore.FieldValue.serverTimestamp(),
                    createdAt:            admin.firestore.FieldValue.serverTimestamp(),
                    isGlobalCityProperty: true,
                } : {}),
            },
        });
    }

    for (const chunk of chunkArray(writes, BATCH_CHUNK_SIZE)) {
        const batch = db.batch();
        for (const op of chunk) {
            batch.set(op.ref, op.data, { merge: true });
        }
        await batch.commit();
    }

    return {
        imported: writes.filter(w => w.isNew).length,
        updated:  writes.filter(w => !w.isNew).length,
        city,
    };
}
