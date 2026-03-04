import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import {
    HardDrive,
    Database,
    Home,
    Users,
    TrendingUp,
    Loader2,
    AlertTriangle,
    RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UsageData {
    storageBytes: number;
    storageMB: number;
    totalProperties: number;
    totalLeads: number;
    totalDeals: number;
    totalUsers: number;
}

interface Props {
    agencyId: string;
    agencyName?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_TIER_MB = 5120; // 5 GB tier
const COST_PER_GB = 0.026;   // Firebase Blaze pricing

// ─── Helper ───────────────────────────────────────────────────────────────────
function formatMB(mb: number): string {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function StorageBar({ usedMB, tierMB }: { usedMB: number; tierMB: number }) {
    const pct = Math.min((usedMB / tierMB) * 100, 100);
    const isWarning = usedMB > tierMB * 0.8;      // > 80% → orange
    const isDanger = usedMB > tierMB * 0.95;      // > 95% → red
    const barColor = isDanger ? '#ef4444' : isWarning ? '#f97316' : '#06b6d4';
    const barGlow = isDanger
        ? 'rgba(239,68,68,0.6)'
        : isWarning
            ? 'rgba(249,115,22,0.6)'
            : 'rgba(6,182,212,0.6)';

    return (
        <div className="mt-3 space-y-1.5">
            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                        width: `${pct}%`,
                        background: barColor,
                        boxShadow: `0 0 10px ${barGlow}`,
                    }}
                />
            </div>
            <div className="flex justify-between text-xs text-slate-600">
                <span>{pct.toFixed(1)}% בשימוש</span>
                <span>{formatMB(tierMB)} מגבלה</span>
            </div>
        </div>
    );
}

interface DocStatRowProps {
    icon: React.ElementType;
    label: string;
    count: number;
    color: string;
}
function DocStatRow({ icon: Icon, label, count, color }: DocStatRowProps) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0">
            <div className="flex items-center gap-2.5">
                <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: `${color}15`, boxShadow: `0 0 8px ${color}20` }}
                >
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
                <span className="text-xs font-semibold text-slate-400">{label}</span>
            </div>
            <span
                className="text-sm font-black tabular-nums"
                style={{ color, textShadow: `0 0 12px ${color}60` }}
            >
                {count.toLocaleString()}
            </span>
        </div>
    );
}

// ─── Main Widget ─────────────────────────────────────────────────────────────
export default function AgencyUsageWidget({ agencyId, agencyName }: Props) {
    const [usageData, setUsageData] = useState<UsageData | null>(null);
    const [isUsageLoading, setIsUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState<string | null>(null);

    const fetchUsage = async () => {
        setIsUsageLoading(true);
        setUsageError(null);
        try {
            const fn = httpsCallable<{ targetAgencyId: string }, { success: boolean; data: UsageData }>(
                functions,
                'superadmin-superAdminGetAgencyUsage'
            );
            const result = await fn({ targetAgencyId: agencyId });
            if (result.data.success) {
                setUsageData(result.data.data);
            } else {
                setUsageError('שגיאה בטעינת נתוני שימוש');
            }
        } catch (err: any) {
            console.error('[AgencyUsageWidget] Error:', err);
            setUsageError(err?.message ?? 'שגיאה לא ידועה');
        } finally {
            setIsUsageLoading(false);
        }
    };

    useEffect(() => {
        fetchUsage();
    }, [agencyId]);

    // ── Estimated cost ────────────────────────────────────────────────────────
    const estimatedCostUSD =
        usageData ? ((usageData.storageMB / 1024) * COST_PER_GB).toFixed(4) : null;

    return (
        <div
            className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl p-6 space-y-5"
            style={{
                borderColor: 'rgba(6,182,212,0.2)',
                boxShadow: '0 0 40px rgba(6,182,212,0.06), inset 0 0 30px rgba(6,182,212,0.02)',
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div
                        className="p-2 rounded-xl"
                        style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}
                    >
                        <Database className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div>
                        <h3
                            className="text-xs font-bold uppercase tracking-widest text-slate-400"
                            style={{ letterSpacing: '0.15em' }}
                        >
                            RESOURCE CONSUMPTION
                        </h3>
                        {agencyName && (
                            <p className="text-xs text-slate-600 mt-0.5">
                                &lt;{agencyName}&gt;
                            </p>
                        )}
                    </div>
                </div>
                <button
                    onClick={fetchUsage}
                    disabled={isUsageLoading}
                    className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
                    title="רענן"
                >
                    <RefreshCw
                        className={`w-3.5 h-3.5 text-slate-500 ${isUsageLoading ? 'animate-spin' : ''}`}
                    />
                </button>
            </div>

            {/* Loading */}
            {isUsageLoading && !usageData && (
                <div className="flex flex-col items-center gap-3 py-8">
                    <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
                    <p className="text-xs text-slate-600">מחשב שימוש משאבים...</p>
                </div>
            )}

            {/* Error */}
            {usageError && !isUsageLoading && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-900/20 border border-red-500/20 text-red-400 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{usageError}</span>
                </div>
            )}

            {/* Data */}
            {usageData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* ── Storage Card ─────────────────────────────────────── */}
                    <div
                        className="rounded-xl p-4 border"
                        style={{
                            background: 'rgba(6,182,212,0.04)',
                            borderColor: 'rgba(6,182,212,0.15)',
                        }}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <HardDrive className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                Storage
                            </span>
                        </div>

                        <p
                            className="text-3xl font-black tabular-nums mt-2"
                            style={{ color: '#06b6d4', textShadow: '0 0 20px rgba(6,182,212,0.5)' }}
                        >
                            {formatMB(usageData.storageMB)}
                        </p>

                        <StorageBar usedMB={usageData.storageMB} tierMB={STORAGE_TIER_MB} />

                        {/* Cost Estimate */}
                        <p className="text-xs text-slate-600 mt-3">
                            עלות אחסון משוערת:{' '}
                            <span className="text-emerald-400 font-bold">${estimatedCostUSD} / חודש</span>
                        </p>
                        <p className="text-[10px] text-slate-700 mt-0.5">
                            לפי ${COST_PER_GB}/GB (Firebase Blaze)
                        </p>
                    </div>

                    {/* ── Database Card ────────────────────────────────────── */}
                    <div
                        className="rounded-xl p-4 border"
                        style={{
                            background: 'rgba(168,85,247,0.04)',
                            borderColor: 'rgba(168,85,247,0.15)',
                        }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <Database className="w-4 h-4 text-purple-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                Firestore Docs
                            </span>
                        </div>

                        <div className="space-y-0">
                            <DocStatRow
                                icon={Home}
                                label="נכסים"
                                count={usageData.totalProperties}
                                color="#f97316"
                            />
                            <DocStatRow
                                icon={TrendingUp}
                                label="לידים"
                                count={usageData.totalLeads}
                                color="#10b981"
                            />
                            <DocStatRow
                                icon={TrendingUp}
                                label="עסקאות"
                                count={usageData.totalDeals}
                                color="#a855f7"
                            />
                            <DocStatRow
                                icon={Users}
                                label="משתמשים"
                                count={usageData.totalUsers}
                                color="#06b6d4"
                            />
                        </div>

                        {/* Total doc count */}
                        <div
                            className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between"
                        >
                            <span className="text-xs text-slate-600">סה״כ מסמכים</span>
                            <span
                                className="text-sm font-black tabular-nums text-white"
                                style={{ textShadow: '0 0 12px rgba(168,85,247,0.4)' }}
                            >
                                {(
                                    usageData.totalProperties +
                                    usageData.totalLeads +
                                    usageData.totalDeals +
                                    usageData.totalUsers
                                ).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
