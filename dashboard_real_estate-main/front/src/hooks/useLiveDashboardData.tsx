import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Property, Deal, AppTask, Alert, Lead, Agency } from '../types';

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

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
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
            agency: false
        };

        const checkLoaded = () => {
            if (loadedFlags.properties && loadedFlags.deals && loadedFlags.leads && loadedFlags.agency) {
                setLoading(false);
            }
        };

        // Safety fallback: if some collection is completely missing indices or fails silently
        const safetyTimeout = setTimeout(() => {
            setLoading(false);
        }, 2000);

        let currentAgencyProperties: Property[] = [];
        let currentCityProperties: Property[] = [];

        const updatePropertiesState = () => {
            const merged = [...currentAgencyProperties, ...currentCityProperties];
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
            collection(db, 'properties'),
            where('agencyId', '==', agencyId)
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

        // 2. Deals Query
        const qDeals = query(
            collection(db, 'deals'),
            where('agencyId', '==', agencyId)
        );

        let unsubDeals = () => { };
        try {
            unsubDeals = onSnapshot(qDeals, (snap) => {
                setDeals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deal)));
                loadedFlags.deals = true; checkLoaded();
            }, (err) => {
                console.error('[useLiveDashboardData] Deals Error:', err);
                setError(err);
                loadedFlags.deals = true; checkLoaded();
            });
        } catch (e: any) {
            console.error('[useLiveDashboardData] Deals Sync Error:', e);
            setError(e);
            loadedFlags.deals = true; checkLoaded();
        }

        // 3. Tasks Query (Only for current user)
        const qTasks = query(
            collection(db, 'tasks'),
            where('agencyId', '==', agencyId),
            where('createdBy', '==', uid)
        );

        let unsubTasks = () => { };
        try {
            unsubTasks = onSnapshot(qTasks, (snap) => {
                setTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppTask)));
            }, (err) => {
                console.error('[useLiveDashboardData] Tasks Error:', err);
                setError(err);
            });
        } catch (e: any) {
            console.error('[useLiveDashboardData] Tasks Sync Error:', e);
            setError(e);
        }

        // 3.5. Leads Query (Sort client-side to avoid composite index requirement)
        const qLeads = query(
            collection(db, 'leads'),
            where('agencyId', '==', agencyId)
        );

        let unsubLeads = () => { };
        try {
            unsubLeads = onSnapshot(qLeads, (snap) => {
                const rawLeads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
                rawLeads.sort((a, b) => {
                    const tA = (a.createdAt as any)?.toMillis?.() || 0;
                    const tB = (b.createdAt as any)?.toMillis?.() || 0;
                    return tB - tA;
                });
                setLeads(rawLeads);
                loadedFlags.leads = true; checkLoaded();
            }, (err) => {
                console.error('Error fetching leads:', err);
                setError(err);
                loadedFlags.leads = true; checkLoaded();
            });
        } catch (e: any) {
            console.error('Sync Error fetching leads:', e);
            setError(e);
            loadedFlags.leads = true; checkLoaded();
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
                currentPersonalAlerts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert));
                updateAlertsState();
            }, (err) => setError(err));
        } catch (e: any) {
            console.error('Sync error on personal alerts', e);
            setError(e);
        }

        try {
            unsubAlertsBroadcast = onSnapshot(qAlertsBroadcast, (snap) => {
                currentBroadcastAlerts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert));
                updateAlertsState();
            }, (err) => setError(err));
        } catch (e: any) {
            console.error('Sync error on broadcast alerts', e);
            setError(e);
        }

        // 6. Agency Settings Query
        const agencyRef = doc(db, 'agencies', agencyId);
        let unsubAgency = () => { };
        let unsubCityProperties = () => { };
        let activeCity = '';

        try {
            unsubAgency = onSnapshot(agencyRef, (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    const settings = data?.settings || {};

                    // Merge legacy root-level logoUrl if it's missing from settings
                    let logo = settings.logoUrl || data?.logoUrl;

                    if (logo) {
                        settings.logoUrl = logo;
                        setAgencyLogo(logo);
                    }

                    setAgencySettings(settings);
                    setRawAgency({ id: doc.id, ...data } as Agency);

                    const rawName = data?.agencyName || data?.name || null;
                    if (rawName && rawName.includes(agencyId) && userData?.name) {
                        setAgencyName("סוכנות " + userData.name);
                    } else {
                        setAgencyName(rawName);
                    }

                    // Dynamically subscribe to global city's properties if set
                    const newCity = data?.mainServiceArea;
                    if (newCity && newCity !== activeCity) {
                        activeCity = newCity;
                        unsubCityProperties();

                        const qCityProps = collection(db, 'cities', newCity, 'properties');
                        unsubCityProperties = onSnapshot(qCityProps, (citySnap) => {
                            currentCityProperties = citySnap.docs.map(doc => ({
                                id: doc.id,
                                ...doc.data(),
                                isGlobalCityProperty: true,
                                readonly: true
                            } as Property));
                            updatePropertiesState();
                        }, (err) => console.error("[useLiveDashboardData] City properties error:", err));
                    }
                }
                loadedFlags.agency = true; checkLoaded();
            }, (err) => {
                console.error('[useLiveDashboardData] Agency Error:', err);
                setError(err);
                loadedFlags.agency = true; checkLoaded();
            });
        } catch (e: any) {
            console.error('[useLiveDashboardData] Agency Sync Error:', e);
            setError(e);
            loadedFlags.agency = true; checkLoaded();
        }


        return () => {
            clearTimeout(safetyTimeout);
            unsubProperties();
            unsubDeals();
            unsubTasks();
            unsubLeads();
            unsubAlertsPersonal();
            unsubAlertsBroadcast();
            unsubAgency();
            unsubCityProperties();
        };
    }, [userData?.agencyId, userData?.uid]);

    // Keep max 10 completed tasks, delete completed ones older than 48 hours
    useEffect(() => {
        if (!tasks || tasks.length === 0) return;

        const completed = tasks.filter(t => t.isCompleted);
        if (completed.length === 0) return;

        const sorted = [...completed].sort((a, b) => {
            const timeA = a.completedAt?.toMillis ? a.completedAt.toMillis() : 0;
            const timeB = b.completedAt?.toMillis ? b.completedAt.toMillis() : 0;
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
            const completedTime = t.completedAt?.toMillis ? t.completedAt.toMillis() : 0;
            if (completedTime > 0 && now - completedTime > FORTY_EIGHT_HOURS) {
                if (!toDelete.includes(t.id)) toDelete.push(t.id);
            }
        });

        if (toDelete.length > 0) {
            import('../services/taskService').then(({ deleteTask }) => {
                toDelete.forEach(id => deleteTask(id).catch(console.error));
            });
        }
    }, [tasks]);

    return (
        <DashboardDataContext.Provider value={{ properties, deals, tasks, alerts, leads, agencySettings, agencyName, agencyLogo, loading, error }}>
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
