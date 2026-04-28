import { useState, useEffect } from 'react';
import {
    collection,
    collectionGroup,
    getDocs,
    query,
    Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';

export interface AgencyRow {
    id: string;
    name: string;
    adminEmail?: string;
    planId?: string;
    status?: 'active' | 'suspended' | 'pending_approval';
    isWhatsappConnected?: boolean;
    createdAt?: Timestamp;
    billing?: {
        planId?: string;
        status?: string;
        trialEndsAt?: Timestamp;
        ownerPhone?: string;
    };
}

export interface MonthlyDataPoint {
    month: string;
    agencies: number;
    users: number;
}

export interface SubscriptionBreakdown {
    name: string;
    value: number;
    color: string;
}

export interface ExpensesBreakdown {
    fixed: number;
    variable: number;
    marketing: number;
    total: number;
}

export interface GlobalStats {
    totalAgencies: number;
    totalUsers: number;
    totalActiveProperties: number;
    totalLeads: number;
    allAgencies: AgencyRow[];
    allUsers: any[]; // List of all system users
    monthlyGrowth: MonthlyDataPoint[];
    subscriptionBreakdown: SubscriptionBreakdown[];
    expenses: ExpensesBreakdown | null;
    loading: boolean;
    error: string | null;
}

function buildLast6Months(): MonthlyDataPoint[] {
    const result: MonthlyDataPoint[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });
        result.push({ month: label, agencies: 0, users: 0 });
    }
    return result;
}

function monthIndexOffset(ts: any): number {
    if (!ts) return -1;
    
    let d: Date;
    if (typeof ts.toDate === 'function') {
        d = ts.toDate();
    } else if (ts instanceof Date) {
        d = ts;
    } else if (typeof ts === 'string' || typeof ts === 'number') {
        d = new Date(ts);
    } else if (ts.seconds !== undefined) {
        // Fallback for objects that look like Timestamps but lost their methods
        d = new Date(ts.seconds * 1000);
    } else {
        return -1;
    }

    if (isNaN(d.getTime())) return -1;

    const now = new Date();
    const diffMonths =
        (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    return 5 - diffMonths; // slot index in last-6-months array
}

export function useGlobalStats(): GlobalStats {
    const [stats, setStats] = useState<GlobalStats>({
        totalAgencies: 0,
        totalUsers: 0,
        totalActiveProperties: 0,
        totalLeads: 0,
        allAgencies: [],
        allUsers: [],
        monthlyGrowth: [],
        subscriptionBreakdown: [],
        expenses: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        let cancelled = false;

        const fetchAll = async () => {
            try {
                // ── 1. Agencies ────────────────────────────────────────────────
                const agenciesSnap = await getDocs(collection(db, 'agencies'));
                const allAgencies = agenciesSnap.docs.map((d) => ({
                    id: d.id,
                    ...(d.data() as Omit<AgencyRow, 'id'>),
                })) as AgencyRow[];

                // ── 2. Users (global, no agencyId filter) ─────────────────────
                const usersSnap = await getDocs(collection(db, 'users'));
                const allUsers = usersSnap.docs.map((d) => ({
                    id: d.id,
                    ...(d.data() as { createdAt?: Timestamp; email?: string; role?: string; agencyId?: string }),
                }));

                // Attach admin email & sort agencies
                const allAgenciesWithAdmin = [...allAgencies]
                    .map((ag) => {
                        const adminUser = allUsers.find(
                            (u) => u.agencyId === ag.id && u.role === 'admin' && !!u.email
                        );
                        return { ...ag, adminEmail: adminUser?.email };
                    })
                    .sort((a, b) => {
                        const ta = a.createdAt?.seconds ?? 0;
                        const tb = b.createdAt?.seconds ?? 0;
                        return tb - ta;
                    });

                // Subscription breakdown
                const tierCounts: Record<string, number> = { basic: 0, advanced: 0, premium: 0 };
                for (const ag of allAgencies) {
                    const plan = ag.planId?.toLowerCase() || 'basic';
                    let bucket = 'basic';
                    if (plan === 'advanced' || plan === 'pro' || plan === 'boutique') bucket = 'advanced';
                    else if (plan === 'premium' || plan === 'enterprise') bucket = 'premium';
                    tierCounts[bucket] = (tierCounts[bucket] ?? 0) + 1;
                }
                const subscriptionBreakdown: SubscriptionBreakdown[] = [
                    { name: 'בסיסי', value: tierCounts.basic, color: '#06b6d4' },
                    { name: 'Advanced', value: tierCounts.advanced, color: '#a855f7' },
                    { name: 'Premium', value: tierCounts.premium, color: '#f97316' },
                ];

                // (Users data already fetched in step 2)

                // ── 3. Properties (active only) ────────────────────────────────
                let activeProps: any[] = [];
                try {
                    const propsSnap = await getDocs(
                        query(collectionGroup(db, 'properties'))
                    );
                    activeProps = propsSnap.docs.filter(
                        (d) => d.data().status === 'active'
                    );
                } catch (propsErr) {
                    console.warn('[useGlobalStats] Could not fetch properties:', propsErr);
                }

                // ── 4. Leads ─────────────────────────────────────────────────
                let leadsSize = 0;
                try {
                    const leadsSnap = await getDocs(collection(db, 'leads'));
                    leadsSize = leadsSnap.size;
                } catch (leadsErr) {
                    console.warn('[useGlobalStats] Could not fetch leads:', leadsErr);
                }

                // ── 5. Monthly growth (last 6 months) ─────────────────────────
                const monthlyGrowth = buildLast6Months();

                for (const ag of allAgencies) {
                    const idx = monthIndexOffset(ag.createdAt);
                    if (idx >= 0 && idx < 6) monthlyGrowth[idx].agencies += 1;
                }
                for (const u of allUsers) {
                    const idx = monthIndexOffset(u.createdAt);
                    if (idx >= 0 && idx < 6) monthlyGrowth[idx].users += 1;
                }

                // ── 6. Expenses (via Cloud Function) ────────────────────────
                let expenses: ExpensesBreakdown | null = null;
                try {
                    const getDashboardStats = httpsCallable(functions, 'superadmin-superAdminGetDashboardStats');
                    const statsRes = await getDashboardStats();
                    const statsData = (statsRes.data as any)?.data;
                    if (statsData?.totals?.expenses) {
                        expenses = statsData.totals.expenses as ExpensesBreakdown;
                    }
                } catch (err) {
                    console.error('[useGlobalStats] Error fetching expenses:', err);
                }

                if (!cancelled) {
                    setStats({
                        totalAgencies: allAgencies.length,
                        totalUsers: allUsers.length,
                        totalActiveProperties: activeProps.length,
                        totalLeads: leadsSize,
                        allAgencies: allAgenciesWithAdmin,
                        allUsers: allUsers,
                        monthlyGrowth,
                        subscriptionBreakdown,
                        expenses,
                        loading: false,
                        error: null,
                    });
                }
            } catch (err: any) {
                console.error('[useGlobalStats]', err);
                if (!cancelled) {
                    setStats((prev) => ({ ...prev, loading: false, error: err.message }));
                }
            }
        };

        fetchAll();
        return () => { cancelled = true; };
    }, []);

    return stats;
}
