import { useState, useEffect } from 'react';
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
    agencyName: string | null;
    loading: boolean;
    error: Error | null;
}

export function useLiveDashboardData(): LiveDashboardData {
    const { userData } = useAuth();

    const [properties, setProperties] = useState<Property[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [tasks, setTasks] = useState<AppTask[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [agencySettings, setAgencySettings] = useState<Agency['settings'] | null>(null);
    const [agencyName, setAgencyName] = useState<string | null>(null);

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

        // 1. Properties Query
        const qProperties = query(
            collection(db, 'properties'),
            where('agencyId', '==', agencyId)
        );

        const unsubProperties = onSnapshot(qProperties, (snap) => {
            setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property)));
        }, (err) => {
            console.error('[useLiveDashboardData] Properties Error:', err);
            setError(err);
        });

        // 2. Deals Query
        const qDeals = query(
            collection(db, 'deals'),
            where('agencyId', '==', agencyId)
        );

        const unsubDeals = onSnapshot(qDeals, (snap) => {
            setDeals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deal)));
        }, (err) => {
            console.error('[useLiveDashboardData] Deals Error:', err);
            setError(err);
        });

        // 3. Tasks Query (Only for current user)
        const qTasks = query(
            collection(db, 'tasks'),
            where('agencyId', '==', agencyId),
            where('createdBy', '==', uid)
        );

        const unsubTasks = onSnapshot(qTasks, (snap) => {
            setTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppTask)));
        }, (err) => {
            console.error('[useLiveDashboardData] Tasks Error:', err);
            setError(err);
        });

        // 3.5. Leads Query (Sort client-side to avoid composite index requirement)
        const qLeads = query(
            collection(db, 'leads'),
            where('agencyId', '==', agencyId)
        );

        const unsubLeads = onSnapshot(qLeads, (snap) => {
            const rawLeads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
            rawLeads.sort((a, b) => {
                const tA = (a.createdAt as any)?.toMillis?.() || 0;
                const tB = (b.createdAt as any)?.toMillis?.() || 0;
                return tB - tA;
            });
            setLeads(rawLeads);
        }, (err) => {
            console.error('Error fetching leads:', err);
            setError(err);
        });

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
            // Wait for at least one initial payload before setting loading to false 
            // is a bit tricky with multiple subscriptions. We'll set it here to ensure it flips eventually.
            setLoading(false);
        };

        const unsubAlertsPersonal = onSnapshot(qAlertsPersonal, (snap) => {
            currentPersonalAlerts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert));
            updateAlertsState();
        }, (err) => setError(err));

        const unsubAlertsBroadcast = onSnapshot(qAlertsBroadcast, (snap) => {
            currentBroadcastAlerts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Alert));
            updateAlertsState();
        }, (err) => setError(err));

        // 6. Agency Settings Query
        const agencyRef = doc(db, 'agencies', agencyId);
        const unsubAgency = onSnapshot(agencyRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const settings = data?.settings || {};

                // Merge legacy root-level logoUrl if it's missing from settings
                let logo = settings.logoUrl || data?.logoUrl;

                if (logo) {
                    // console.log('[useLiveDashboardData] Agency Logo found:', logo);
                    settings.logoUrl = logo;
                }

                setAgencySettings(settings);
                setAgencyName(data?.agencyName || data?.name || null);
            }
        }, (err) => {
            console.error('[useLiveDashboardData] Agency Error:', err);
            setError(err);
        });


        return () => {
            unsubProperties();
            unsubDeals();
            unsubTasks();
            unsubLeads();
            unsubAlertsPersonal();
            unsubAlertsBroadcast();
            unsubAgency();
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

    return { properties, deals, tasks, alerts, leads, agencySettings, agencyName, loading, error };
}
