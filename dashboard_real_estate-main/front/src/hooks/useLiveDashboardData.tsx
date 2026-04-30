import { useState, useEffect, createContext, useContext, ReactNode, useRef, useMemo } from 'react';
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

    // Properties are split into three sources (agency-owned, whatsapp scrape, global cities)
    // and merged via useMemo so each source can update independently without colliding.
    const [agencyProperties, setAgencyProperties] = useState<Property[]>([]);
    const [whatsappProperties, setWhatsappProperties] = useState<Property[]>([]);
    const [cityProperties, setCityProperties] = useState<Property[]>([]);

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

    // 1. Main agency-scoped subscriptions. Decoupled from citiesCatalog so the
    // catalog snapshot doesn't tear down every other listener.
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

        const safetyTimeout = setTimeout(() => {
            if (isMounted) setLoading(false);
        }, 2000);

        // Properties
        const unsubProperties = onSnapshot(
            collection(db, 'agencies', agencyId, 'properties'),
            (snap) => {
                if (!isMounted) return;
                setAgencyProperties(snap.docs.map(d => ({ id: d.id, ...d.data() } as Property)));
                loadedFlags.properties = true; checkLoaded();
            },
            (err) => {
                console.error('[useLiveDashboardData] Properties Error:', err);
                if (isMounted) { setError(err); loadedFlags.properties = true; checkLoaded(); }
            }
        );

        // WhatsApp Properties
        const unsubWhatsappProperties = onSnapshot(
            collection(db, 'agencies', agencyId, 'whatsappProperties'),
            (snap) => {
                if (!isMounted) return;
                setWhatsappProperties(snap.docs.map(d => ({
                    id: d.id,
                    ...d.data(),
                    source: 'whatsapp_group',
                    status: 'draft',
                    isExclusive: false,
                } as Property)));
            },
            (err) => console.error('[useLiveDashboardData] WhatsApp Properties Error:', err)
        );

        // Deals
        const unsubDeals = onSnapshot(
            query(collection(db, 'deals'), where('agencyId', '==', agencyId)),
            (snap) => {
                if (!isMounted) return;
                setDeals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Deal)));
                loadedFlags.deals = true; checkLoaded();
            },
            (err) => {
                console.error('[useLiveDashboardData] Deals Error:', err);
                if (isMounted) { setError(err); loadedFlags.deals = true; checkLoaded(); }
            }
        );

        // Shared Catalogs
        const unsubCatalogs = onSnapshot(
            query(collection(db, 'shared_catalogs'), where('agencyId', '==', agencyId)),
            (snap) => {
                if (!isMounted) return;
                setSharedCatalogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as SharedCatalog)));
                loadedFlags.sharedCatalogs = true; checkLoaded();
            },
            (err) => {
                console.error('[useLiveDashboardData] Catalogs Error:', err);
                if (isMounted) { loadedFlags.sharedCatalogs = true; checkLoaded(); }
            }
        );

        // Tasks — two parallel queries merged:
        // 1. Tasks created by the current user
        // 2. Tasks explicitly assigned to the current user by an admin
        // Firestore rules allow reading only own/assigned tasks for non-admins,
        // so we must query each condition separately (no OR across different fields).
        let tasksCreated: AppTask[] = [];
        let tasksAssigned: AppTask[] = [];
        const mergeTasks = () => {
            if (!isMounted) return;
            const seen = new Set<string>();
            const merged = [...tasksCreated, ...tasksAssigned].filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
            setTasks(merged);
        };

        const unsubTasksCreated = onSnapshot(
            query(collection(db, 'tasks'), where('agencyId', '==', agencyId), where('createdBy', '==', uid)),
            (snap) => { tasksCreated = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppTask)); mergeTasks(); },
            (err) => { console.error('[useLiveDashboardData] Tasks (created) Error:', err); if (isMounted) setError(err); }
        );

        const unsubTasksAssigned = onSnapshot(
            query(collection(db, 'tasks'), where('agencyId', '==', agencyId), where('assignedToAgentId', '==', uid)),
            (snap) => { tasksAssigned = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppTask)); mergeTasks(); },
            (err) => { console.error('[useLiveDashboardData] Tasks (assigned) Error:', err); if (isMounted) setError(err); }
        );

        // Leads
        const unsubLeads = onSnapshot(
            query(collection(db, 'leads'), where('agencyId', '==', agencyId)),
            (snap) => {
                if (!isMounted) return;
                const rawLeads = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
                rawLeads.sort((a, b) => {
                    const tA = (a.createdAt as any)?.toMillis?.() || 0;
                    const tB = (b.createdAt as any)?.toMillis?.() || 0;
                    return tB - tA;
                });
                setLeads(rawLeads);
                loadedFlags.leads = true; checkLoaded();
            },
            (err) => {
                console.error('Error fetching leads:', err);
                if (isMounted) { setError(err); loadedFlags.leads = true; checkLoaded(); }
            }
        );

        // Alerts (personal + broadcast, merged)
        let currentPersonalAlerts: Alert[] = [];
        let currentBroadcastAlerts: Alert[] = [];

        const updateAlertsState = () => {
            const merged = [...currentPersonalAlerts, ...currentBroadcastAlerts];
            const seen = new Set<string>();
            const deduped = merged.filter((a) => {
                if (seen.has(a.id)) return false;
                seen.add(a.id);
                return true;
            });
            setAlerts(deduped);
        };

        const unsubAlertsPersonal = onSnapshot(
            query(collection(db, 'alerts'), where('agencyId', '==', agencyId), where('targetAgentId', '==', uid), where('isRead', '==', false)),
            (snap) => {
                if (!isMounted) return;
                currentPersonalAlerts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Alert));
                updateAlertsState();
            },
            (err) => { if (isMounted) setError(err); }
        );

        const unsubAlertsBroadcast = onSnapshot(
            query(collection(db, 'alerts'), where('agencyId', '==', agencyId), where('targetAgentId', '==', 'all'), where('isRead', '==', false)),
            (snap) => {
                if (!isMounted) return;
                currentBroadcastAlerts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Alert));
                updateAlertsState();
            },
            (err) => { if (isMounted) setError(err); }
        );

        // Agency document — settings, name, logo. City-properties subscribed in a separate effect.
        const unsubAgency = onSnapshot(
            doc(db, 'agencies', agencyId),
            (snap) => {
                if (!isMounted) return;
                if (snap.exists()) {
                    const data = snap.data();
                    const settings = data?.settings || {};

                    const logo = settings.logoUrl || data?.logoUrl;
                    if (logo) {
                        settings.logoUrl = logo;
                        setAgencyLogo(logo);
                    }

                    setAgencySettings(settings);
                    setRawAgency({ id: agencyId, ...data } as Agency);

                    const rawName = data?.agencyName || data?.name || null;
                    if (rawName && rawName.includes(agencyId) && userData?.name) {
                        setAgencyName('סוכנות ' + userData.name);
                    } else {
                        setAgencyName(rawName);
                    }
                }
                loadedFlags.agency = true; checkLoaded();
            },
            (err) => {
                console.error('[useLiveDashboardData] Agency Error:', err);
                if (isMounted) { setError(err); loadedFlags.agency = true; checkLoaded(); }
            }
        );

        return () => {
            isMounted = false;
            clearTimeout(safetyTimeout);
            unsubProperties();
            unsubWhatsappProperties();
            unsubDeals();
            unsubTasksCreated();
            unsubTasksAssigned();
            unsubLeads();
            unsubAlertsPersonal();
            unsubAlertsBroadcast();
            unsubAgency();
            unsubCatalogs();
        };
    }, [userData?.agencyId, userData?.uid, userData?.name]);

    // 2. Global-city property subscriptions. Decoupled — re-runs only when the
    // resolved set of cities actually changes, not on every other Firestore tick.
    const planId = rawAgency?.planId;
    const mainServiceArea = (rawAgency as any)?.mainServiceArea;
    const activeGlobalCities = agencySettings?.activeGlobalCities;
    const userServiceAreas = userData?.serviceAreas;

    const resolvedCities = useMemo(() => {
        if (!userData?.agencyId) return [] as string[];
        const planFeatures = getPlanFeatures(planId);
        if (!planFeatures.canAccessSourcing) return [];

        const agencyCities = activeGlobalCities || (mainServiceArea ? [mainServiceArea] : []);
        const userCities = userServiceAreas || [];
        const baseCities = Array.from(new Set([...(agencyCities as string[]), ...(userCities as string[])]));
        if (baseCities.length === 0) return [];

        const catalogMatches = citiesCatalog.length > 0
            ? citiesCatalog.filter(catalogCity => isCityMatch(baseCities, catalogCity))
            : [];

        const uncoveredBaseCities = baseCities.filter(bc =>
            !catalogMatches.some(cm => isCityMatch([bc], cm))
        );

        return Array.from(new Set([...catalogMatches, ...uncoveredBaseCities]));
    }, [userData?.agencyId, planId, mainServiceArea, activeGlobalCities, userServiceAreas, citiesCatalog]);

    // Stable key so the subscription effect only re-runs when the resolved set
    // genuinely changes (not on identity changes of the array).
    const resolvedCitiesKey = useMemo(() => [...resolvedCities].sort().join('|'), [resolvedCities]);

    useEffect(() => {
        if (resolvedCities.length === 0) {
            setCityProperties([]);
            return;
        }
        let isMounted = true;
        const cityPropsMap: Record<string, Property[]> = {};
        const unsubs: Array<() => void> = [];

        resolvedCities.forEach((city) => {
            const unsub = onSnapshot(
                collection(db, 'cities', city, 'properties'),
                (citySnap) => {
                    if (!isMounted) return;
                    cityPropsMap[city] = citySnap.docs.map(d => {
                        const data = d.data();
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
                            id: d.id,
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
                    setCityProperties(Object.values(cityPropsMap).flat());
                },
                (err) => console.error(`[useLiveDashboardData] City properties error for ${city}:`, err)
            );
            unsubs.push(unsub);
        });

        return () => {
            isMounted = false;
            unsubs.forEach(u => u());
        };
        // resolvedCitiesKey is the stable dependency; the array itself would re-trigger every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedCitiesKey]);

    // Merge property sources, deduped by id.
    const properties = useMemo(() => {
        const merged = [...agencyProperties, ...cityProperties, ...whatsappProperties];
        const seen = new Set<string>();
        return merged.filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
        });
    }, [agencyProperties, cityProperties, whatsappProperties]);

    // Keep max 10 completed tasks, delete completed ones older than 48 hours
    const isDeletingRef = useRef(false);
    useEffect(() => {
        if (!tasks || tasks.length === 0 || isDeletingRef.current) return;

        const completed = tasks.filter(t => t.isCompleted);
        if (completed.length === 0) return;

        const sorted = [...completed].sort((a, b) => {
            const timeA = a.completedAt?.toMillis ? a.completedAt.toMillis() : (a.completedAt instanceof Date ? a.completedAt.getTime() : (a.completedAt as any)?.seconds * 1000 || 0);
            const timeB = b.completedAt?.toMillis ? b.completedAt.toMillis() : (b.completedAt instanceof Date ? b.completedAt.getTime() : (b.completedAt as any)?.seconds * 1000 || 0);
            return timeB - timeA;
        });

        const now = Date.now();
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
        const toDelete: string[] = [];

        if (sorted.length > 10) {
            sorted.slice(10).forEach(t => toDelete.push(t.id));
        }

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
                    setTimeout(() => { isDeletingRef.current = false; }, 2000);
                });
            }).catch(() => { isDeletingRef.current = false; });
        }
    }, [tasks]);

    const value = useMemo<LiveDashboardData>(
        () => ({ properties, deals, tasks, alerts, leads, sharedCatalogs, agencySettings, rawAgency, agencyName, agencyLogo, loading, error }),
        [properties, deals, tasks, alerts, leads, sharedCatalogs, agencySettings, rawAgency, agencyName, agencyLogo, loading, error]
    );

    return (
        <DashboardDataContext.Provider value={value}>
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
