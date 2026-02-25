import { useState, useEffect } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts';
import {
    Building2,
    Users,
    Home,
    Contact,
    ShieldCheck,
    ShieldAlert,
    Shield,
    TrendingUp,
    Activity,
    Cpu,
    RefreshCw,
} from 'lucide-react';
import { useGlobalStats, AgencyRow } from '../hooks/useGlobalStats';

// ─── Tooltip customisation ───────────────────────────────────────────────────
const NeonBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900/95 border border-cyan-500/30 rounded-xl px-4 py-3 shadow-[0_0_20px_rgba(6,182,212,0.2)] backdrop-blur-xl text-sm">
            <p className="text-cyan-400 font-bold mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ color: p.fill }} className="font-semibold">
                    {p.name}: <span className="text-white">{p.value}</span>
                </p>
            ))}
        </div>
    );
};

const NeonPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const entry = payload[0];
    return (
        <div className="bg-slate-900/95 border border-purple-500/30 rounded-xl px-4 py-3 shadow-[0_0_20px_rgba(168,85,247,0.2)] backdrop-blur-xl text-sm">
            <p style={{ color: entry.payload.color }} className="font-bold">{entry.name}</p>
            <p className="text-white font-semibold">{entry.value} סוכנויות</p>
        </div>
    );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────
interface KpiCardProps {
    label: string;
    value: number | string;
    icon: React.ElementType;
    glowColor: string;         // raw rgba for box-shadow
    loading?: boolean;
}

function KpiCard({ label, value, icon: Icon, glowColor, loading }: KpiCardProps) {
    return (
        <div
            className="relative overflow-hidden rounded-2xl border bg-slate-900/60 backdrop-blur-xl p-5 flex flex-col gap-4 transition-all duration-300 hover:scale-[1.02]"
            style={{
                borderColor: `${glowColor}40`,
                boxShadow: `0 0 30px ${glowColor}15, inset 0 0 20px ${glowColor}05`,
            }}
        >
            {/* Background orb */}
            <div
                className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ backgroundColor: glowColor }}
            />

            <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
                <div
                    className="p-2 rounded-lg"
                    style={{ background: `${glowColor}20`, boxShadow: `0 0 10px ${glowColor}30` }}
                >
                    <Icon className="w-4 h-4" style={{ color: glowColor }} />
                </div>
            </div>

            {loading ? (
                <div className="h-9 w-24 rounded-lg bg-slate-800 animate-pulse" />
            ) : (
                <p
                    className="text-3xl font-black tabular-nums"
                    style={{
                        color: glowColor,
                        textShadow: `0 0 20px ${glowColor}80`,
                    }}
                >
                    {value}
                </p>
            )}

            <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-semibold">פעיל</span>
                <span className="text-xs text-slate-600 mr-1">| מערכת מחוברת</span>
            </div>
        </div>
    );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
    if (status === 'suspended') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-900/40 text-red-400 border border-red-500/30">
                <ShieldAlert className="w-3 h-3" /> מושעה
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">
            <ShieldCheck className="w-3 h-3" /> פעיל
        </span>
    );
}

// ─── Tier badge ──────────────────────────────────────────────────────────────
const TIER_STYLES: Record<string, string> = {
    free: 'bg-cyan-900/40 text-cyan-400 border-cyan-500/30',
    pro: 'bg-purple-900/40 text-purple-400 border-purple-500/30',
    enterprise: 'bg-orange-900/40 text-orange-400 border-orange-500/30',
};
const TIER_LABELS: Record<string, string> = { free: 'חינמי', pro: 'Pro', enterprise: 'Enterprise' };

function TierBadge({ tier }: { tier?: string }) {
    const t = tier ?? 'free';
    return (
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${TIER_STYLES[t] ?? TIER_STYLES.free}`}>
            {TIER_LABELS[t] ?? t}
        </span>
    );
}

// ─── Pulsing dot ──────────────────────────────────────────────────────────────
function LiveDot() {
    return (
        <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
    );
}

// ─── Timestamp ────────────────────────────────────────────────────────────────
function LiveClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <span className="font-mono text-cyan-400/80 text-xs">
            {now.toLocaleString('he-IL', {
                dateStyle: 'short',
                timeStyle: 'medium',
                hour12: false,
            })}
        </span>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SuperAdminDashboard() {
    const {
        totalAgencies,
        totalUsers,
        totalActiveProperties,
        totalLeads,
        recentAgencies,
        monthlyGrowth,
        subscriptionBreakdown,
        loading,
    } = useGlobalStats();

    const [search, setSearch] = useState('');

    const filteredAgencies = recentAgencies.filter((ag) =>
        (ag.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (ag.adminEmail ?? '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div
            className="min-h-full space-y-8 pb-12"
            dir="rtl"
            style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
        >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div
                        className="p-3 rounded-2xl"
                        style={{
                            background: 'rgba(6,182,212,0.1)',
                            boxShadow: '0 0 20px rgba(6,182,212,0.3)',
                            border: '1px solid rgba(6,182,212,0.3)',
                        }}
                    >
                        <Shield className="w-7 h-7 text-cyan-400" />
                    </div>
                    <div>
                        <h1
                            className="text-2xl font-black uppercase tracking-widest"
                            style={{
                                background: 'linear-gradient(90deg, #06b6d4 0%, #a855f7 60%, #f97316 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                textShadow: 'none',
                                filter: 'drop-shadow(0 0 12px rgba(6,182,212,0.5))',
                            }}
                        >
                            SUPER ADMIN — CONTROL CENTER
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <LiveDot />
                            <span className="text-xs text-slate-500 font-medium">מחובר לפלטפורמה HOMER</span>
                            <span className="text-slate-700 mx-1">|</span>
                            <LiveClock />
                        </div>
                    </div>
                </div>

                {loading && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        טוען נתוני מערכת...
                    </div>
                )}
            </div>

            {/* ── KPI Cards ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="סה״כ סוכנויות"
                    value={totalAgencies}
                    icon={Building2}
                    glowColor="#06b6d4"
                    loading={loading}
                />
                <KpiCard
                    label="משתמשים פעילים"
                    value={totalUsers}
                    icon={Users}
                    glowColor="#a855f7"
                    loading={loading}
                />
                <KpiCard
                    label="נכסים פעילים"
                    value={totalActiveProperties}
                    icon={Home}
                    glowColor="#f97316"
                    loading={loading}
                />
                <KpiCard
                    label="סה״כ לידים"
                    value={totalLeads}
                    icon={Contact}
                    glowColor="#10b981"
                    loading={loading}
                />
            </div>

            {/* ── Charts Row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bar Chart */}
                <div
                    className="lg:col-span-2 rounded-2xl border bg-slate-900/60 backdrop-blur-xl p-6"
                    style={{
                        borderColor: 'rgba(6,182,212,0.2)',
                        boxShadow: '0 0 30px rgba(6,182,212,0.05)',
                    }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <Activity className="w-5 h-5 text-cyan-400" />
                        <h2
                            className="text-xs font-bold uppercase tracking-widest text-slate-400"
                            style={{ letterSpacing: '0.15em' }}
                        >
                            SYSTEM GROWTH — 6 חודשים אחרונים
                        </h2>
                    </div>

                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlyGrowth} barGap={8}>
                            <XAxis
                                dataKey="month"
                                tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'inherit' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'inherit' }}
                                axisLine={false}
                                tickLine={false}
                                width={28}
                            />
                            <Tooltip content={<NeonBarTooltip />} cursor={{ fill: 'rgba(6,182,212,0.05)' }} />
                            <Bar
                                dataKey="agencies"
                                name="סוכנויות"
                                fill="#06b6d4"
                                radius={[6, 6, 0, 0]}
                                style={{ filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.6))' }}
                            />
                            <Bar
                                dataKey="users"
                                name="משתמשים"
                                fill="#a855f7"
                                radius={[6, 6, 0, 0]}
                                style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.6))' }}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Pie Chart */}
                <div
                    className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl p-6"
                    style={{
                        borderColor: 'rgba(168,85,247,0.2)',
                        boxShadow: '0 0 30px rgba(168,85,247,0.05)',
                    }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <Cpu className="w-5 h-5 text-purple-400" />
                        <h2
                            className="text-xs font-bold uppercase tracking-widest text-slate-400"
                            style={{ letterSpacing: '0.15em' }}
                        >
                            SUBSCRIPTION PLANS
                        </h2>
                    </div>

                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie
                                data={subscriptionBreakdown}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={85}
                                paddingAngle={4}
                                dataKey="value"
                                strokeWidth={0}
                            >
                                {subscriptionBreakdown.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.color}
                                        style={{ filter: `drop-shadow(0 0 8px ${entry.color}80)` }}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<NeonPieTooltip />} />
                            <Legend
                                formatter={(value) => (
                                    <span className="text-xs text-slate-400">{value}</span>
                                )}
                                wrapperStyle={{ paddingTop: '12px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>

                    {/* Numeric legend */}
                    <div className="mt-4 space-y-2">
                        {subscriptionBreakdown.map((item) => (
                            <div key={item.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{
                                            backgroundColor: item.color,
                                            boxShadow: `0 0 6px ${item.color}`,
                                        }}
                                    />
                                    <span className="text-xs text-slate-500">{item.name}</span>
                                </div>
                                <span className="text-xs font-bold" style={{ color: item.color }}>
                                    {item.value}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Recent Agencies Table ────────────────────────────────────── */}
            <div
                className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl overflow-hidden"
                style={{
                    borderColor: 'rgba(249,115,22,0.2)',
                    boxShadow: '0 0 30px rgba(249,115,22,0.05)',
                }}
            >
                {/* Table header */}
                <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-orange-400" />
                        <h2
                            className="text-xs font-bold uppercase tracking-widest text-slate-400"
                            style={{ letterSpacing: '0.15em' }}
                        >
                            RECENT AGENCIES — לקוחות אחרונים
                        </h2>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="חיפוש..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full sm:w-56 pl-3 pr-4 py-2 text-sm rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <thead>
                            <tr className="border-b border-slate-800">
                                {['שם הסוכנות', 'מייל אדמין', 'תאריך הצטרפות', 'מנוי', 'סטטוס'].map((h) => (
                                    <th
                                        key={h}
                                        className="px-6 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-600"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="border-b border-slate-800/50">
                                        {Array.from({ length: 5 }).map((__, j) => (
                                            <td key={j} className="px-6 py-4">
                                                <div className="h-4 rounded-md bg-slate-800 animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : filteredAgencies.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-slate-600">
                                        לא נמצאו סוכנויות
                                    </td>
                                </tr>
                            ) : (
                                filteredAgencies.map((ag: AgencyRow) => (
                                    <tr
                                        key={ag.id}
                                        className="group border-b border-slate-800/50 hover:bg-cyan-500/5 transition-colors"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                                                    style={{
                                                        background: 'rgba(6,182,212,0.1)',
                                                        color: '#06b6d4',
                                                        border: '1px solid rgba(6,182,212,0.2)',
                                                    }}
                                                >
                                                    {(ag.name ?? 'A').charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">
                                                    {ag.name ?? 'ללא שם'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                                            {ag.adminEmail ?? '—'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 text-xs">
                                            {ag.createdAt?.toDate
                                                ? ag.createdAt.toDate().toLocaleDateString('he-IL')
                                                : '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <TierBadge tier={ag.subscriptionTier} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={ag.status} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
