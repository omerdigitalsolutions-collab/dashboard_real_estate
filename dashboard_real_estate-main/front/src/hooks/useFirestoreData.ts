import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, QueryConstraint, DocumentData, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Property, Deal, Lead, AppUser, AppTask, Alert, PendingLead } from '../types';

// Re-exported for convenience — the canonical implementations are in useLiveDashboardData.

/**
 * Safely converts a Firestore value to a Date object.
 */
function safeToDate(ts: any): Date | null {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return ts;
    if (ts && typeof ts === 'object' && '_seconds' in ts) {
        return new Date(ts._seconds * 1000 + (ts._nanoseconds || 0) / 1000000);
    }
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Generic real-time hook to subscribe to any Firestore collection 
 * and automatically filter by the current user's agencyId.
 */
function useAgencyCollection<T>(
    collectionName: string,
    additionalConstraints: QueryConstraint[] = []
) {
    const { userData } = useAuth();
    const agencyId = userData?.agencyId;

    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Capture constraints once — they are always static at call sites, and the default []
    // would otherwise create a new reference on every render and trigger an infinite loop.
    const constraintsRef = useRef(additionalConstraints);

    useEffect(() => {
        if (!agencyId) {
            setData([]);
            setLoading(false);
            return;
        }

        const colRef = collection(db, collectionName);
        const q = query(colRef, where('agencyId', '==', agencyId), ...constraintsRef.current);

        let isMounted = true;
        let unsubscribe = () => { };

        try {
            unsubscribe = onSnapshot(
                q,
                (snapshot) => {
                    if (!isMounted) return;
                    const results: T[] = snapshot.docs.map(doc => ({
                        ...(doc.data() as DocumentData),
                        id: doc.id,
                    })) as T[];

                    setData(results);
                    setLoading(false);
                    setError(null);
                },
                (err) => {
                    if (!isMounted) return;
                    // Firestore index errors contain a console link — always print the full message
                    if (err.message?.includes('index')) {
                        console.error(
                            `[useAgencyCollection] Missing Firestore index for "${collectionName}".`,
                            '\nClick the link in the error below to create it:\n',
                            err.message
                        );
                    } else {
                        console.error(`[useAgencyCollection] Error fetching ${collectionName}:`, err);
                    }
                    setError(err);
                    setLoading(false);
                }
            );
        } catch (e: any) {
            if (isMounted) {
                console.error(`[useAgencyCollection] Synchronous error onSnapshot for ${collectionName}:`, e);
                setError(e);
                setLoading(false);
            }
        }

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [agencyId, collectionName]);

    return { data, loading, error };
}

// ─── Specific High-Level Hooks ────────────────────────────────────────────────

export function useProperties() {
    const { userData } = useAuth();
    const agencyId = userData?.agencyId;

    const [data, setData] = useState<Property[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!agencyId) { setData([]); setLoading(false); return; }
        const colRef = collection(db, 'agencies', agencyId, 'properties');
        const q = query(colRef);
        let unsub = () => {};
        try {
            unsub = onSnapshot(q, (snap) => {
                setData(snap.docs.map(d => ({ ...(d.data() as any), id: d.id }) as Property));
                setLoading(false);
                setError(null);
            }, (err) => { setError(err); setLoading(false); });
        } catch (e: any) { setError(e); setLoading(false); }
        return () => unsub();
    }, [agencyId]);

    return { data, loading, error };
}
export const useDeals = () => useAgencyCollection<Deal>('deals');
export const useLeads = () => useAgencyCollection<Lead>('leads');   // sorted client-side below
export const useAgents = () => {
    const constraints = useState(() => [where('role', 'in', ['admin', 'agent'])])[0];
    return useAgencyCollection<AppUser>('users', constraints);
};
// useTasks — admin sees all agency tasks; non-admin sees only own + assigned tasks (dual query).
export function useTasks() {
    const { userData } = useAuth();
    const agencyId = userData?.agencyId;
    const uid = userData?.uid;
    const isAdminUser = userData?.role === 'admin';

    const [data, setData] = useState<AppTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!agencyId || !uid) { setData([]); setLoading(false); return; }

        if (isAdminUser) {
            const q = query(collection(db, 'tasks'), where('agencyId', '==', agencyId));
            const unsub = onSnapshot(q,
                (snap) => { setData(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppTask))); setLoading(false); setError(null); },
                (err) => { setError(err); setLoading(false); }
            );
            return () => unsub();
        }

        // Non-admin: merge created + assigned
        let created: AppTask[] = [];
        let assigned: AppTask[] = [];
        const merge = () => {
            const seen = new Set<string>();
            setData([...created, ...assigned].filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; }));
            setLoading(false);
            setError(null);
        };
        const unsubCreated = onSnapshot(
            query(collection(db, 'tasks'), where('agencyId', '==', agencyId), where('createdBy', '==', uid)),
            (snap) => { created = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppTask)); merge(); },
            (err) => { setError(err); setLoading(false); }
        );
        const unsubAssigned = onSnapshot(
            query(collection(db, 'tasks'), where('agencyId', '==', agencyId), where('assignedToAgentId', '==', uid)),
            (snap) => { assigned = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppTask)); merge(); },
            (err) => { setError(err); setLoading(false); }
        );
        return () => { unsubCreated(); unsubAssigned(); };
    }, [agencyId, uid, isAdminUser]);

    return { data, loading, error };
}

// useAlerts — only personal (targetAgentId==uid) and broadcast ('all') alerts.
// The Firestore rule enforces this at the document level; the query must match.
export function useAlerts() {
    const { userData } = useAuth();
    const agencyId = userData?.agencyId;
    const uid = userData?.uid;

    const [data, setData] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!agencyId || !uid) { setData([]); setLoading(false); return; }
        const q = query(
            collection(db, 'alerts'),
            where('agencyId', '==', agencyId),
            where('targetAgentId', 'in', [uid, 'all'])
        );
        const unsub = onSnapshot(q,
            (snap) => { setData(snap.docs.map(d => ({ id: d.id, ...d.data() } as Alert))); setLoading(false); setError(null); },
            (err) => { setError(err); setLoading(false); }
        );
        return () => unsub();
    }, [agencyId, uid]);

    return { data, loading, error };
}
export const usePendingLeads = () => useAgencyCollection<PendingLead>('pending_leads');

export function useAgency() {
    const { userData } = useAuth();
    const agencyId = userData?.agencyId;

    const [agency, setAgency] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!agencyId) {
            setAgency(null);
            setLoading(false);
            return;
        }

        const ref_ = doc(db, 'agencies', agencyId);
        const unsubscribe = onSnapshot(
            ref_,
            (snap) => {
                if (snap.exists()) {
                    setAgency({ id: snap.id, ...snap.data() });
                } else {
                    setAgency(null);
                }
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('[useAgency] Error fetching agency:', err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [agencyId]);

    return { agency, loading, error };
}

// ─── Derived Data Hooks ───────────────────────────────────────────────────────

/**
 * Derives monthly revenue from closed (contract) deals for the past 12 months.
 */
export function useRevenueData() {
    const { data: deals, loading } = useDeals();
    const [chartData, setChartData] = useState<Array<{ month: string; revenue: number; monthIndex: number; year: number }>>([]);

    useEffect(() => {
        if (!deals.length) {
            setChartData([]);
            return;
        }

        const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
        const currentMonthIndex = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        // Initialize last 12 months
        const last12Months = Array.from({ length: 12 }).map((_, i) => {
            const d = new Date(currentYear, currentMonthIndex, 1);
            d.setMonth(currentMonthIndex - (11 - i));
            return {
                monthIndex: d.getMonth(),
                year: d.getFullYear(),
                month: months[d.getMonth()],
                revenue: 0,
            };
        });

        // Sum actual revenue from won deals only
        deals.forEach(deal => {
            if (deal.stage !== 'won') return;

            const timestampObj = deal.updatedAt || deal.createdAt;
            if (!timestampObj) return;

            const date = safeToDate(timestampObj);
            if (!date) return;
            const mIdx = date.getMonth();
            const yr = date.getFullYear();

            const targetMonth = last12Months.find(m => m.monthIndex === mIdx && m.year === yr);
            if (targetMonth) {
                targetMonth.revenue += (deal.actualCommission || deal.projectedCommission || 0);
            }
        });

        setChartData(last12Months);

    }, [deals]);

    return { data: chartData, loading };
}

/**
 * Derives a recent activity feed from newly created leads and updated deals.
 */
export function useRecentActivityFeed() {
    const { data: leads, loading: leadsLoading } = useLeads();
    const { data: deals, loading: dealsLoading } = useDeals();

    const [activity, setActivity] = useState<Array<{ id: string; type: string; message: string; detail: string; time: string; timestamp: number }>>([]);

    useEffect(() => {
        const items: any[] = [];

        // Add Leads
        leads.forEach(lead => {
            const date = safeToDate(lead.createdAt);
            if (date) {
                items.push({
                    id: `lead_${lead.id}`,
                    type: 'lead',
                    message: `ליד חדש התקבל (${lead.source})`,
                    detail: lead.name,
                    timestamp: date.getTime(),
                    time: date.toLocaleDateString('he-IL')
                });
            }
        });

        // Add Deals
        deals.forEach(deal => {
            const date = safeToDate(deal.updatedAt || deal.createdAt);
            if (date) {
                let statusMsg = 'התקדמות בעסקה';
                if (deal.stage === 'offer') statusMsg = 'הוגשה הצעה לעסקה';
                if (deal.stage === 'contract') statusMsg = 'עסקה נסגרה בהצלחה!';

                items.push({
                    id: `deal_${deal.id}`,
                    type: deal.stage === 'contract' ? 'contract' : 'deal',
                    message: statusMsg,
                    detail: `צפי עמלה: ₪${(deal.projectedCommission || 0).toLocaleString()}`,
                    timestamp: date.getTime(),
                    time: date.toLocaleDateString('he-IL')
                });
            }
        });

        // Sort by newest first
        items.sort((a, b) => b.timestamp - a.timestamp);

        setActivity(items.slice(0, 50)); // Keep only last 50
    }, [leads, deals]);

    return { data: activity, loading: leadsLoading || dealsLoading };
}

/**
 * Computes agent performance metrics by combining Users (agents) with closed Deals.
 */
export function useAgentPerformance() {
    const { data: agents, loading: agentsLoading } = useAgents();
    const { data: deals, loading: dealsLoading } = useDeals();

    const [performanceData, setPerformanceData] = useState<any[]>([]);

    useEffect(() => {
        // We still render agents even if there are 0 deals
        if (!agents.length) {
            setPerformanceData([]);
            return;
        }

        const colors = [
            'bg-blue-100 text-blue-600',
            'bg-indigo-100 text-indigo-600',
            'bg-violet-100 text-violet-600',
            'bg-emerald-100 text-emerald-600',
            'bg-cyan-100 text-cyan-600'
        ];

        const data = agents
            .map((agent, index) => {
                const uid = agent.uid;
                const closedDeals = uid ? deals.filter(d => (d.agentId === uid || d.createdBy === uid) && d.stage === 'won') : [];
                const totalAssignedDeals = uid ? deals.filter(d => (d.agentId === uid || d.createdBy === uid)) : [];
                const totalSales = closedDeals.reduce((sum, d) => sum + (d.actualCommission ?? d.projectedCommission ?? 0), 0);

                const winRate = totalAssignedDeals.length > 0
                    ? Math.round((closedDeals.length / totalAssignedDeals.length) * 100)
                    : 0;

                const monthlyTarget = agent.goals?.monthly?.revenue || 0;
                const yearlyTarget = agent.goals?.yearly?.revenue || 0;

                return {
                    id: uid || agent.id, // Fallback to doc ID if not yet logged in
                    isStub: !uid, // Indicates user has not logged in yet
                    name: agent.name,
                    role: agent.role,
                    avatar: agent.name.charAt(0),
                    avatarColor: colors[index % colors.length],
                    sales: totalSales,
                    deals: closedDeals.length,
                    winRate: winRate,
                    monthlyAchieved: totalSales,
                    monthlyTarget,
                    yearlyTarget,
                    agentDoc: agent,
                };
            }).sort((a, b) => b.sales - a.sales);

        setPerformanceData(data);
    }, [agents, deals]);

    return { data: performanceData, loading: agentsLoading || dealsLoading };
}
