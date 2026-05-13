import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Property } from '../types';

/**
 * For super admins only — subscribes to every city in the `cities` top-level
 * collection and returns a flat, live list of all their properties.
 */
export function useSuperAdminAllCityProperties(enabled: boolean) {
    const [cityIds, setCityIds] = useState<string[]>([]);
    const [propertiesByCity, setPropertiesByCity] = useState<Record<string, Property[]>>({});
    const [loading, setLoading] = useState(true);

    // Step 1: get all city IDs
    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }
        const unsub = onSnapshot(
            collection(db, 'cities'),
            (snap) => setCityIds(snap.docs.map(d => d.id)),
            (err) => console.error('[useSuperAdminAllCityProperties] cities error:', err)
        );
        return () => unsub();
    }, [enabled]);

    // Step 2: subscribe to each city's properties
    const cityIdsKey = useMemo(() => [...cityIds].sort().join('|'), [cityIds]);

    useEffect(() => {
        if (!enabled || cityIds.length === 0) {
            if (enabled) setLoading(false);
            return;
        }

        setLoading(true);
        let isMounted = true;
        const map: Record<string, Property[]> = {};
        const unsubs: Array<() => void> = [];
        let resolved = 0;

        cityIds.forEach((city) => {
            const unsub = onSnapshot(
                collection(db, 'cities', city, 'properties'),
                (snap) => {
                    if (!isMounted) return;
                    map[city] = snap.docs.map(d => {
                        const data = d.data();
                        const rawType = (data.type || data.transactionType || '').toString().toLowerCase().trim();
                        const isRent = rawType === 'rent' || rawType === 'השכרה' || rawType === 'lease';
                        const flatAddr = (typeof data.address === 'string' ? data.address : null) || data.street || data.fullAddress || 'כתובת חסויה';
                        const flatCity = data.city || city;
                        const normalizedAddress = (data.address && typeof data.address === 'object')
                            ? { fullAddress: data.address.fullAddress || flatAddr, city: data.address.city || flatCity, street: data.address.street || '', neighborhood: data.address.neighborhood || '' }
                            : { fullAddress: flatAddr, city: flatCity, street: data.street || '' };

                        return {
                            id: d.id,
                            ...data,
                            address: normalizedAddress,
                            financials: data.financials || { price: data.price ?? 0 },
                            media: { ...(data.media || {}), images: data.media?.images || data.imageUrls || data.images || [] },
                            transactionType: data.transactionType || (isRent ? 'rent' : 'forsale'),
                            propertyType: data.propertyType || data.kind || '',
                            squareMeters: data.squareMeters || data.sqm || null,
                            rooms: data.rooms || data.roomCount || null,
                            floor: data.floor || null,
                            features: data.features || {},
                            rawDescription: data.rawDescription || data.description || '',
                            isGlobalCityProperty: true,
                            readonly: true,
                        } as Property;
                    });
                    setPropertiesByCity({ ...map });
                    resolved++;
                    if (resolved >= cityIds.length) setLoading(false);
                },
                (err) => {
                    console.error(`[useSuperAdminAllCityProperties] Error for city ${city}:`, err);
                    resolved++;
                    if (resolved >= cityIds.length && isMounted) setLoading(false);
                }
            );
            unsubs.push(unsub);
        });

        return () => {
            isMounted = false;
            unsubs.forEach(u => u());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, cityIdsKey]);

    const properties = useMemo(() => Object.values(propertiesByCity).flat(), [propertiesByCity]);

    return { properties, loading, cityCount: cityIds.length };
}
