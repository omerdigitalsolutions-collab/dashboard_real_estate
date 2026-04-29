import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

/**
 * getLiveProperties — Securely fetches live property documents for a shared catalog, stripping agent info.
 * 
 * Invoked by unauthenticated clients viewing a shared catalog.
 * Validates the requested property IDs against the actual catalog document.
 */
export const getLiveProperties = onCall({ cors: true }, async (request) => {
    const { catalogId, propertyIds } = request.data as {
        catalogId?: string;
        propertyIds?: any[];
    };

    if (!catalogId) throw new HttpsError('invalid-argument', 'catalogId is required.');
    if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
        return { success: true, properties: [] };
    }

    // 1. Verify the catalog exists and is not expired
    const catalogDoc = await db.collection('shared_catalogs').doc(catalogId).get();
    if (!catalogDoc.exists) {
        throw new HttpsError('not-found', 'Catalog not found.');
    }

    const catalogData = catalogDoc.data()!;
    if (catalogData.expiresAt && catalogData.expiresAt.toDate() < new Date()) {
        throw new HttpsError('permission-denied', 'Catalog has expired.');
    }

    // 2. Security Check: Only allow fetching properties that are actually in this catalog
    const agencyId: string = catalogData.agencyId || '';
    const defaultPath = agencyId ? `agencies/${agencyId}/properties` : 'properties';
    const allowedMap = new Map<string, string>();
    (catalogData.propertyIds || []).forEach((p: any) => {
        if (typeof p === 'string') {
            allowedMap.set(p, defaultPath);
        } else if (p && p.id) {
            allowedMap.set(p.id, p.collectionPath || defaultPath);
        }
    });

    const requestedItems = propertyIds.filter(p => {
        const id = typeof p === 'string' ? p : p?.id;
        return id && allowedMap.has(id);
    }).map(p => {
        const id = typeof p === 'string' ? p : p.id;
        return { id, collectionPath: allowedMap.get(id)! };
    });

    if (requestedItems.length === 0) {
        return { success: true, properties: [] };
    }

    // 3. Fetch properties grouped by collection path
    const grouped = requestedItems.reduce((acc, item) => {
        if (!acc[item.collectionPath]) acc[item.collectionPath] = [];
        acc[item.collectionPath].push(item.id);
        return acc;
    }, {} as Record<string, string[]>);

    const liveProperties: any[] = [];
    
    for (const [path, ids] of Object.entries(grouped)) {
        // Fetch in chunks of 10 for the 'in' query limitation
        for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10);
            const snap = await db.collection(path).where('__name__', 'in', chunk).get();

            for (const doc of snap.docs) {
                const data = doc.data();
                // Support both new nested schema and legacy flat schema (cities collection)
                const images: string[] =
                    data.media?.images ||
                    data.imageUrls ||
                    data.images ||
                    [];
                const finalImages = images.length > 0 ? images : [PLACEHOLDER_IMAGE];

                const city = data.address?.city || data.city || '';
                const fullAddress = data.address?.fullAddress ||
                    (typeof data.address === 'string' ? data.address : null) ||
                    data.street || 'כתובת חסויה';
                const price = data.financials?.price ?? data.price ?? 0;
                const description = data.management?.descriptions || data.description || null;
                const transactionType = data.transactionType || data.type || 'forsale';
                // Strip agentName: "true" bug
                const rawAgentName = data.agentName;
                const agentName = data.listingType === 'exclusive' && rawAgentName && rawAgentName !== 'true'
                    ? String(rawAgentName) : '';

                liveProperties.push({
                    ...data,
                    id: doc.id,
                    // Normalised flat fields for frontend display
                    address: fullAddress,
                    city,
                    price,
                    rooms: data.rooms || null,
                    squareMeters: data.squareMeters || data.sqm || null,
                    floor: data.floor || null,
                    images: finalImages,
                    transactionType,
                    propertyType: data.propertyType || data.kind || null,
                    listingType: data.listingType || null,
                    description,
                    createdAt: data.createdAt || null,
                    agentName,
                    agentPhone: data.listingType === 'exclusive' ? (data.agentPhone || '') : '',
                    // Pass through nested objects for richer display
                    features: data.features || null,
                    financials: data.financials || { price },
                    media: { ...data.media, images: finalImages },
                    management: data.management || null,
                });
            }
        }
    }

    // Enrich properties with agent photos (exclusive) and assigned-agent phones (external)
    if (agencyId && liveProperties.length > 0) {
        const agentIds = new Set<string>();
        for (const prop of liveProperties) {
            const assignedId = prop.management?.assignedAgentId;
            if (assignedId) agentIds.add(assignedId);
        }

        if (agentIds.size > 0) {
            const agentDocs = await Promise.all(
                Array.from(agentIds).map(id =>
                    db.collection(`agencies/${agencyId}/users`).doc(id).get()
                )
            );
            const agentMap = new Map<string, { photoURL?: string; phone?: string; name?: string }>();
            for (const agentDoc of agentDocs) {
                if (agentDoc.exists) {
                    const d = agentDoc.data()!;
                    agentMap.set(agentDoc.id, {
                        photoURL: d.photoURL || '',
                        phone: d.phone || '',
                        name: d.name || '',
                    });
                }
            }

            for (const prop of liveProperties) {
                const assignedId = prop.management?.assignedAgentId;
                if (!assignedId || !agentMap.has(assignedId)) continue;
                const agent = agentMap.get(assignedId)!;
                if (prop.listingType === 'exclusive') {
                    prop.agentPhotoUrl = agent.photoURL || '';
                    if (!prop.agentPhone && agent.phone) prop.agentPhone = agent.phone;
                } else {
                    // Non-office property: surface assigned office-agent phone for call/WA
                    prop.assignedAgentPhone = agent.phone || '';
                    prop.assignedAgentName = agent.name || '';
                }
            }
        }
    }

    // Fallback: use catalog creator's contact for properties still missing phone/photo
    const creatorId: string = catalogData.agentId || '';
    if (agencyId && creatorId) {
        const creatorDoc = await db.collection(`agencies/${agencyId}/users`).doc(creatorId).get();
        if (creatorDoc.exists) {
            const creator = creatorDoc.data()!;
            const creatorPhone = creator.phone || '';
            const creatorPhotoUrl = creator.photoURL || '';
            const creatorName = creator.name || '';

            for (const prop of liveProperties) {
                const hasPhone = prop.agentPhone || prop.assignedAgentPhone;
                if (!hasPhone && creatorPhone) {
                    if (prop.listingType === 'exclusive') {
                        prop.agentPhone = creatorPhone;
                    } else {
                        prop.assignedAgentPhone = creatorPhone;
                        if (!prop.assignedAgentName) prop.assignedAgentName = creatorName;
                    }
                }
                if (!prop.agentPhotoUrl && creatorPhotoUrl) {
                    prop.agentPhotoUrl = creatorPhotoUrl;
                }
                if (!prop.agentName && creatorName) {
                    prop.agentName = creatorName;
                }
            }
        }
    }

    return {
        success: true,
        properties: liveProperties
    };
});
