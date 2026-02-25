import { useState, useEffect } from 'react';
import {
    collection,
    getDocs,
    query,
    Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface AgencyRow {
    id: string;
    name: string;
    adminEmail?: string;
    subscriptionTier?: 'free' | 'pro' | 'enterprise';
    status?: 'active' | 'suspended';
    createdAt?: Timestamp;
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

export interface GlobalStats {
    totalAgencies: number;
    totalUsers: number;
    totalActiveProperties: number;
    totalLeads: number;
    recentAgencies: AgencyRow[];
    monthlyGrowth: MonthlyDataPoint[];
    subscriptionBreakdown: SubscriptionBreakdown[];
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

function monthIndexOffset(ts: Timestamp | undefined | null): number {
    if (!ts) return -1;
    const d = ts.toDate();
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
        recentAgencies: [],
        monthlyGrowth: [],
        subscriptionBreakdown: [],
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

                // Recent 10 agencies sorted in memory (avoids composite index)
                const recentAgencies = [...allAgencies]
                    .sort((a, b) => {
                        const ta = a.createdAt?.seconds ?? 0;
                        const tb = b.createdAt?.seconds ?? 0;
                        return tb - ta;
                    })
                    .slice(0, 10);

                // Subscription breakdown
                const tierCounts: Record<string, number> = { free: 0, pro: 0, enterprise: 0 };
                for (const ag of allAgencies) {
                    const tier = ag.subscriptionTier ?? 'free';
                    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
                }
                const subscriptionBreakdown: SubscriptionBreakdown[] = [
                    { name: 'חינמי', value: tierCounts.free, color: '#06b6d4' },
                    { name: 'Pro', value: tierCounts.pro, color: '#a855f7' },
                    { name: 'Enterprise', value: tierCounts.enterprise, color: '#f97316' },
                ];

                // ── 2. Users (global, no agencyId filter) ─────────────────────
                const usersSnap = await getDocs(collection(db, 'users'));
                const allUsers = usersSnap.docs.map((d) => ({
                    id: d.id,
                    ...(d.data() as { createdAt?: Timestamp }),
                }));

                // ── 3. Properties (active only) ────────────────────────────────
                const propsSnap = await getDocs(
                    query(collection(db, 'properties'))
                );
                const activeProps = propsSnap.docs.filter(
                    (d) => d.data().status === 'active'
                );

                // ── 4. Leads ─────────────────────────────────────────────────
                const leadsSnap = await getDocs(collection(db, 'leads'));

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

                if (!cancelled) {
                    setStats({
                        totalAgencies: allAgencies.length,
                        totalUsers: allUsers.length,
                        totalActiveProperties: activeProps.length,
                        totalLeads: leadsSnap.size,
                        recentAgencies,
                        monthlyGrowth,
                        subscriptionBreakdown,
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
