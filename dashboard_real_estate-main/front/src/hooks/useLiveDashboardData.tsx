import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Property, Deal, AppTask, Alert, Lead, Agency, SharedCatalog } from '../types';
import { getPlanFeatures } from '../config/plans';
import { isCityMatch } from '../utils/stringUtils';

interface LiveDashboardData {
    properties: Property[];
    deals: Deal[];
    tasks: AppTask[];
    alerts: Alert[];
    leads: Lead[];
    agencySettings: Agency['settings'] | null;
    rawAgency: Agency | null;
    agencyName: string | null;
    agencyLogo: string | null;
    sharedCatalogs: SharedCatalog[];
    loading: boolean;
    error: Error | null;
}

export const DashboardDataContext = createContext<LiveDashboardData | undefined>(undefined);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
    const { userData } = useAuth();

    const [properties, setProperties] = useState<Property[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [tasks, setTasks] = useState<AppTask[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [agencySettings, setAgencySettings] = useState<Agency['settings'] | null>(null);
    const [rawAgency, setRawAgency] = useState<Agency | null>(null);
    const [agencyName, setAgencyName] = useState<string | null>(null);
    const [agencyLogo, setAgencyLogo] = useState<string | null>(null);
    const [citiesCatalog, setCitiesCatalog] = useState<string[]>([]);
    const [sharedCatalogs, setSharedCatalogs] = useState<SharedCatalog[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // 0. Fetch the cities catalog (all document IDs in 'cities') for substring matching
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'cities'), (snap) => {
            setCitiesCatalog(snap.docs.map(doc => doc.id));
        }, (err) => console.error('[useLiveDashboardData] Cities Catalog Error:', err));
        return () => unsub();
    }, []);

    useEffect(() => {
        let isMounted = true;
        if (!userData?.agencyId || !userData?.uid) {
            setLoading(false);
            return;
        }

        const agencyId = userData.agencyId;
        const uid = userData.uid;
        setLoading(true);
        setError(null);

        const loadedFlags = {
            properties: false,
            deals: false,
            leads: false,
            agency: false,
            sharedCatalogs: false
        };

        const checkLoaded = () => {
            if (isMounted && loadedFlags.properties && loadedFlags.deals && loadedFlags.leads && loadedFlags.agency && loadedFlags.sharedCatalogs) {
                setLoading(false);
            }
        };

        // Safety fallback: if some collection is completely missing indices or fails silently
        const safetyTimeout = setTimeout(() => {
            if (isMounted) setLoading(false);
        }, 2000);

        let currentAgencyProperties: Property[] = [];
        let currentCityProperties: Property[] = [];
        let currentWhatsappProperties: Property[] = [];

        const updatePropertiesState = () => {
            if (!isMounted) return;
            const merged = [...currentAgencyProperties, ...currentCityProperties, ...currentWhatsappProperties];
            const seen = new Set<string>();
            const deduped = merged.filter((p) => {
                if (seen.has(p.id)) return false;
                seen.add(p.id);
                return true;
            });
            setProperties(deduped);
        };

        // 1. Properties Query
        const qProperties = query(
            collection(db, 'agencies', agencyId, 'properties')
        );

        let unsubProperties = () => { };
        try {
            unsubProperties = onSnapshot(qProperties, (snap) => {
                currentAgencyProperties = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
                updatePropertiesState();
                loadedFlags.properties = true; checkLoaded();
            }, (err) => {
                console.error('[useLiveDashboardData] Properties Error:', err);
                setError(err);
                loadedFlags.properties = true; checkLoaded();
            });
        } catch (e: any) {
            console.error('[useLiveDashboardData] Properties Sync Error:', e);
            setError(e);
            loadedFlags.properties = true; checkLoaded();
        }

        // 2. WhatsApp Properties subcollection (agencies/{agencyId}/whatsappProperties)
        let unsubWhatsappProperties = () => { };
        try {
            unsubWhatsappProperties = onSnapshot(
                collection(db, 'agencies', agencyId, 'whatsappProperties'),
                (snap) => {
                    currentWhatsappProperties = snap.docs.map(d => ({
                        id: d.id,
                        ...d.data(),
                        source: 'whatsapp_group',
                        status: 'draft',
                        isExclusive: false,
                    } as Property));
                    updatePropertiesState();
                },
                (err) => {
                    console.error('[useLiveDashboardData] WhatsApp Properties Error:', err);
                }
            );
        } catch (e: any) {
            console.error('[useLiveDashboardData] WhatsApp Properties Sync Error:', e);
        }

        // 4. Deals Query
        const qDeals = query(
            collection(db, 'deals'),
            where('agencyId', '==', agencyId)
        );

        let unsubDeals = () => { };
        try {
            unsubDeals = onSnapshot(qDeals, (snap) => {
                if (isMounted) {
                    setDeals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deal)));
                    loadedFlags.deals = true; checkLoaded();
                }
            }, (err) => {
                console.error('[useLiveDashboardData] Deals Error:', err);
                if (isMounted) {
                    setError(err);
                    loadedFlags.deals = true; checkLoaded();
                }
            });
        } catch (e: any) {
            console.error('[useLiveDashboardData] Deals Sync Error:', e);
            if (isMounted) {
                setError(e);
                loadedFlags.deals = true; checkLoaded();
            }
        }

        // 4.5 Shared Catalogs Query
        const qCatalogs = query(
            collection(db, 'shared_catalogs'),
            where('agencyId', '==', agencyId)
        );

        let unsubCatalogs = () => { };
        try {
            unsubCatalogs = onSnapshot(qCatalogs, (snap) => {
                if (isMounted) {
                    setSharedCatalogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as SharedCatalog)));
                    loadedFlags.sharedCatalogs = true; checkLoaded();
                }
            }, (err) => {
                console.error('[useLiveDashboardData] Catalogs Error:', err);
                if (isMounted) {
                    loadedFlags.sharedCatalogs = true; checkLoaded();
                }
            });
        } catch (e: any) {
            console.error('[useLiveDashboardData] Catalogs Sync Error:', e);
            if (isMounted) {
                loadedFlags.sharedCatalogs = true; checkLoaded();
            }
        }

        // 5. Tasks Query (Only for current user)
        const qTasks = query(
            collection(db, 'tasks'),
            where('agencyId', '==', agencyId),
            where('createdBy', '==', uid)
        );

        let unsubTasks = () => { };
        try {
            unsubTasks = onSnapshot(qTasks, (snap) => {
                if (isMounted) {
                    setTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppTask)));
                }
            }, (err) => {
                console.error('[useLiveDashboardData] Tasks Error:', err);
                if (isMounted) setError(err);
            });
        } catch (e: any) {
            console.error('[useLiveDashboardData] Tasks Sync Error:', e);
            if (isMounted) setError(e);
        }

        // 3.5. Leads Query (Sort client-side to avoid composite index requirement)
        const qLeads = query(
            collection(db, 'leads'),
            where('agencyId', '==', agencyId)
        );

        let unsubLeads = () => { };
        try {
            unsubLeads = onSnapshot(qLeads, (snap) => {
                if (isMounted) {
                    const rawLeads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
                    rawLeads.sort((a, b) => {
                        const tA = (a.createdAt as any)?.toMillis?.() || 0;
                        const tB = (b.createdAt as any)?.toMillis?.() || 0;
                        return tB - tA;
                    });
                    setLeads(rawLeads);
                    loadedFlags.leads = true; checkLoaded();
                }
            }, (err) => {
                console.error('Error fetching leads:', err);
                if (isMounted) {
                    setError(err);
                    loadedFlags.leads = true; checkLoaded();
                }
            });
        } catch (e: any) {
            console.error('Sync Error fetching leads:', e);
            if (isMounted) {
                setError(e);
                loadedFlags.leads = true; checkLoaded();
            }
        }

        // 4. Alerts Query (Targeted to user OR broadcast 'all')
        const qAlertsPersonal = query(
            collection(db, 'alerts'),
            where('agencyId', '==', agencyId),
            where('targetAgentId', '==', uid),
            where('isRead', '==', false)
        );

        const qAlertsBroadcast = query(
            collection(db, 'alerts'),
            where('agencyId', '==', agencyId),
            where('targetAgentId', '==', 'all'),
            where('isRead', '==', false)
        );

        // Track personal and broadcast separately and merge them
        let currentPersonalAlerts: Alert[] = [];
        let currentBroadcastAlerts: Alert[] = [];

        const updateAlertsState = () => {
            const merged = [...currentPersonalAlerts, ...currentBroadcastAlerts];
            // Deduplicate by ID
            const seen = new Set<string>();
            const deduped = merged.filter((a) => {
                if (seen.has(a.id)) return false;
                seen.add(a.id);
                return true;
            });
            setAlerts(deduped);
        };

        let unsubAlertsPersonal = () => { };
        let unsubAlertsBroadcast = () => { };
        try {
            unsubAlertsPersonal = onSnapshot(qAlertsPersonal, (snap) => {
                if (isMounted) {
                    currentPersonalAlerts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert));
                    updateAlertsState();
                }
            }, (err) => {
                if (isMounted) setError(err);
            });
        } catch (e: any) {
            console.error('Sync error on personal alerts', e);
            if (isMounted) setError(e);
        }

        try {
            unsubAlertsBroadcast = onSnapshot(qAlertsBroadcast, (snap) => {
                if (isMounted) {
                    currentBroadcastAlerts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert));
                    updateAlertsState();
                }
            }, (err) => {
                if (isMounted) setError(err);
            });
        } catch (e: any) {
            console.error('Sync error on broadcast alerts', e);
            if (isMounted) setError(e);
        }

        // 6. Agency Settings Query
        const agencyRef = doc(db, 'agencies', agencyId);
        let unsubAgency = () => { };
        let globalCityUnsubs: (() => void)[] = [];
        let activeCities: string[] = [];

        try {
            unsubAgency = onSnapshot(agencyRef, (snap) => {
                if (isMounted && snap.exists()) {
                    const data = snap.data();
                    const settings = data?.settings || {};

                    // Merge legacy root-level logoUrl if it's missing from settings
                    let logo = settings.logoUrl || data?.logoUrl;

                    if (logo) {
                        settings.logoUrl = logo;
                        setAgencyLogo(logo);
                    }

                    setAgencySettings(settings);
                    setRawAgency({ id: agencyRef.id, ...data } as Agency);

                    const rawName = data?.agencyName || data?.name || null;
                    if (rawName && rawName.includes(agencyId) && userData?.name) {
                        setAgencyName("סוכנות " + userData.name);
                    } else {
                        setAgencyName(rawName);
                    }

                    // Dynamically subscribe to global city's properties if set AND user has sourcing permission
                    const planFeatures = getPlanFeatures(data?.planId);
                    const canAccessSourcing = planFeatures.canAccessSourcing;

                    const agencyCities = settings?.activeGlobalCities || (data?.mainServiceArea ? [data?.mainServiceArea] : []);
                    const userCities = userData?.serviceAreas || [];
                    const baseCities = canAccessSourcing 
                        ? Array.from(new Set([...agencyCities, ...userCities]))
                        : [];

                    // Expand service areas: find all cities in catalog that match the user's selected areas
                    const catalogMatches = (citiesCatalog.length > 0 && baseCities.length > 0)
                        ? citiesCatalog.filter(catalogCity => isCityMatch(baseCities, catalogCity))
                        : [];

                    // Also subscribe directly to configured cities not found in the catalog.
                    // This handles "phantom" city documents where the subcollection exists
                    // but the parent city document doesn't (so it's invisible to collection queries).
                    const uncoveredBaseCities = baseCities.filter(bc =>
                        !catalogMatches.some(cm => isCityMatch([bc], cm))
                    );

                    const loadedCities = Array.from(new Set([...catalogMatches, ...uncoveredBaseCities]));

                    console.log('[DEBUG cities] Resolved subscription cities:', loadedCities);
                    const citiesChanged = loadedCities.length !== activeCities.length || !loadedCities.every((c: string) => activeCities.includes(c));

                    if (citiesChanged) {
                        activeCities = loadedCities;
                        globalCityUnsubs.forEach(unsub => unsub());
                        globalCityUnsubs = [];
                        currentCityProperties = [];

                        if (loadedCities.length === 0) {
                            updatePropertiesState();
                        } else {
                            const cityPropsMap: Record<string, Property[]> = {};

                            loadedCities.forEach((city: string) => {
                                console.log('[DEBUG cities] Subscribing to city:', city);
                                const qCityProps = collection(db, 'cities', city, 'properties');
                                const unsub = onSnapshot(qCityProps, (citySnap) => {
                                    if (!isMounted) return;
                                    console.log('[DEBUG cities] Snapshot for city', city, '- docs count:', citySnap.docs.length);
                                    cityPropsMap[city] = citySnap.docs.map(doc => {
                                        const data = doc.data();
                                        // Normalize old flat schema → new nested schema
                                        const flatAddr = (typeof data.address === 'string' ? data.address : null) || data.street || 'כתובת חסויה';
                                        const flatCity = data.city || city;
                                        const normalizedAddress = (data.address && typeof data.address === 'object')
                                            ? data.address
                                            : {
                                                fullAddress: flatAddr,
                                                city: flatCity,
                                                street: data.street || '',
                                                ...(data.neighborhood ? { neighborhood: data.neighborhood } : {}),
                                                ...(data.lat && data.lng ? { coords: { lat: data.lat, lng: data.lng } } : {}),
                                            };
                                        const normalizedImages = data.media?.images || data.imageUrls || data.images || [];
                                        return {
                                            id: doc.id,
                                            ...data,
                                            address: normalizedAddress,
                                            financials: data.financials || { price: data.price ?? 0 },
                                            media: { ...(data.media || {}), images: normalizedImages },
                                            transactionType: data.transactionType || (data.type === 'rent' ? 'rent' : 'forsale'),
                                            propertyType: data.propertyType || data.kind || '',
                                            squareMeters: data.squareMeters || data.sqm || null,
                                            rooms: data.rooms || data.roomCount || null,
                                            floor: data.floor || null,
                                            features: data.features || {
                                                hasElevator: data.hasElevator ?? null,
                                                hasParking: data.hasParking ?? null,
                                                parkingSpots: data.parkingSpots ?? null,
                                                hasBalcony: data.hasBalcony ?? null,
                                                hasMamad: data.hasMamad ?? data.hasSafeRoom ?? null,
                                                hasStorage: data.hasStorage ?? null,
                                                isRenovated: data.isRenovated ?? null,
                                                isFurnished: data.isFurnished ?? null,
                                                hasAirConditioning: data.hasAirConditioning ?? null,
                                            },
                                            rawDescription: data.rawDescription || data.description || data.details || '',
                                            isGlobalCityProperty: true,
                                            readonly: true
                                        } as Property;
                                    });

                                    currentCityProperties = Object.values(cityPropsMap).flat();
                                    updatePropertiesState();
                                }, (err) => console.error(`[useLiveDashboardData] City properties error for ${city}:`, err));
                                globalCityUnsubs.push(unsub);
                            });
                        }
                    }
                }
                if (isMounted) {
                    loadedFlags.agency = true; checkLoaded();
                }
            }, (err) => {
                console.error('[useLiveDashboardData] Agency Error:', err);
                if (isMounted) {
                    setError(err);
                    loadedFlags.agency = true; checkLoaded();
                }
            });
        } catch (e: any) {
            console.error('[useLiveDashboardData] Agency Sync Error:', e);
            if (isMounted) {
                setError(e);
                loadedFlags.agency = true; checkLoaded();
            }
        }


        return () => {
            isMounted = false;
            clearTimeout(safetyTimeout);
            unsubProperties();
            unsubWhatsappProperties();
            unsubDeals();
            unsubTasks();
            unsubLeads();
            unsubAlertsPersonal();
            unsubAlertsBroadcast();
            unsubAgency();
            unsubCatalogs();
            globalCityUnsubs.forEach(unsub => unsub());
        };
    }, [userData?.agencyId, userData?.uid, citiesCatalog]);

    // Keep max 10 completed tasks, delete completed ones older than 48 hours
    // --- Task Cleanup Hook ---
    // Periodically removes old/excess completed tasks.
    const isDeletingRef = useRef(false);
    useEffect(() => {
        if (!tasks || tasks.length === 0 || isDeletingRef.current) return;

        const completed = tasks.filter(t => t.isCompleted);
        if (completed.length === 0) return;

        const sorted = [...completed].sort((a, b) => {
            const timeA = a.completedAt?.toMillis ? a.completedAt.toMillis() : (a.completedAt instanceof Date ? a.completedAt.getTime() : (a.completedAt as any)?.seconds * 1000 || 0);
            const timeB = b.completedAt?.toMillis ? b.completedAt.toMillis() : (b.completedAt instanceof Date ? b.completedAt.getTime() : (b.completedAt as any)?.seconds * 1000 || 0);
            return timeB - timeA; // newest first
        });

        const now = Date.now();
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
        const toDelete: string[] = [];

        // 1. Keep max 10
        if (sorted.length > 10) {
            sorted.slice(10).forEach(t => toDelete.push(t.id));
        }

        // 2. Delete older than 48 hours from the kept items
        sorted.slice(0, 10).forEach(t => {
            const completedTime = t.completedAt?.toMillis ? t.completedAt.toMillis() : (t.completedAt instanceof Date ? t.completedAt.getTime() : (t.completedAt as any)?.seconds * 1000 || 0);
            if (completedTime > 0 && now - completedTime > FORTY_EIGHT_HOURS) {
                if (!toDelete.includes(t.id)) toDelete.push(t.id);
            }
        });

        if (toDelete.length > 0) {
            isDeletingRef.current = true;
            import('../services/taskService').then(({ deleteTask }) => {
                Promise.all(toDelete.map(id => {
                    const taskToDelete = tasks.find(t => t.id === id);
                    return taskToDelete ? deleteTask(taskToDelete) : Promise.resolve();
                })).finally(() => {
                    // Release the lock after a short delay to allow Firestore to sync
                    setTimeout(() => { isDeletingRef.current = false; }, 2000);
                });
            }).catch(() => { isDeletingRef.current = false; });
        }
    }, [tasks]);

    return (
        <DashboardDataContext.Provider value={{ properties, deals, tasks, alerts, leads, sharedCatalogs, agencySettings, rawAgency, agencyName, agencyLogo, loading, error }}>
            {children}
        </DashboardDataContext.Provider>
    );
}

export function useLiveDashboardData(): LiveDashboardData {
    const context = useContext(DashboardDataContext);
    if (context === undefined) {
        throw new Error('useLiveDashboardData must be used within a DashboardDataProvider');
    }
    return context;
}
