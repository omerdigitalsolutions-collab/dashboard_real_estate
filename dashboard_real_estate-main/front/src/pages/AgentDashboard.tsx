import { useMemo, useState } from 'react';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAuth } from '../context/AuthContext';
import { useAgents } from '../hooks/useFirestoreData';
import { Deal, Lead } from '../types';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell,
} from 'recharts';
import PropertyMap from '../components/dashboard/PropertyMap';
import TaskDashboardWidget from '../components/dashboard/TaskDashboardWidget';
import { TrendingUp, Briefcase, Users, DollarSign, Target } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (v: number) => {
    if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `₪${(v / 1_000).toFixed(0)}K`;
    return `₪${v}`;
};

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const STATUS_LABELS: Record<string, string> = {
    new: 'חדש',
    contacted: 'בטיפול',
    meeting_set: 'נקבעה פגישה',
    won: 'נסגר',
    lost: 'אבד',
};

const STATUS_COLORS: Record<string, string> = {
    new: '#3B82F6',
    contacted: '#F59E0B',
    meeting_set: '#8B5CF6',
    won: '#10B981',
    lost: '#64748B',
};

const DEAL_COLORS = ['#F97316', '#3B82F6', '#8B5CF6', '#10B981', '#06B6D4'];

// ─── KPI Card Component ───────────────────────────────────────────────────────

function AgentKpiCard({ title, value, subtitle, icon: Icon, color }: {
    title: string;
    value: string;
    subtitle: string;
    icon: React.ComponentType<any>;
    color: string;
}) {
    const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
        blue:    { bg: 'bg-blue-500/10',   text: 'text-blue-400',   ring: 'ring-blue-500/20' },
        emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/20' },
        amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   ring: 'ring-amber-500/20' },
        purple:  { bg: 'bg-purple-500/10',  text: 'text-purple-400',  ring: 'ring-purple-500/20' },
    };
    const c = colorMap[color] || colorMap.blue;

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center ring-1 ${c.ring} flex-shrink-0`}>
                <Icon size={22} className={c.text} />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-400 truncate">{title}</p>
                <p className="text-2xl font-black text-white mt-0.5">{value}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
            </div>
        </div>
    );
}

// ─── Revenue Chart (agent-scoped) ─────────────────────────────────────────────

function AgentRevenueChart({ deals }: { deals: Deal[] }) {
    const [range, setRange] = useState<'3M' | '6M' | '1Y'>('6M');

    const chartData = useMemo(() => {
        const now = new Date();
        const months = Array.from({ length: 12 }).map((_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
            return { month: MONTHS_HE[d.getMonth()], monthIndex: d.getMonth(), year: d.getFullYear(), revenue: 0 };
        });

        deals.forEach(deal => {
            if (deal.stage !== 'won') return;
            const ts = deal.updatedAt || deal.createdAt;
            if (!ts) return;
            const date = ts.toDate();
            const target = months.find(m => m.monthIndex === date.getMonth() && m.year === date.getFullYear());
            if (target) target.revenue += (deal.actualCommission || deal.projectedCommission || 0);
        });

        const sliceCount = range === '3M' ? 3 : range === '6M' ? 6 : 12;
        return months.slice(-sliceCount);
    }, [deals, range]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload?.length) {
            return (
                <div className="bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-3 shadow-2xl border border-slate-700 text-right" dir="rtl">
                    <p className="text-sm font-bold text-white mb-1">{label}</p>
                    <p className="text-xs text-cyan-400 font-medium">
                        הכנסות: <span className="font-bold text-white">₪{payload[0].value.toLocaleString()}</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 lg:p-6 flex flex-col">
            <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                    <h2 className="text-base font-bold text-white">הכנסות בפועל</h2>
                    <p className="text-xs text-slate-400 mt-0.5">עמלות שנגבו — הנתונים שלי</p>
                </div>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                    {(['3M', '6M', '1Y'] as const).map(k => (
                        <button key={k} onClick={() => setRange(k)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${range === k ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
                            {k === '3M' ? '3 חודשים' : k === '6M' ? '6 חודשים' : 'שנה'}
                        </button>
                    ))}
                </div>
            </div>
            <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="agentRevGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="agentRevStroke" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#06b6d4" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} strokeOpacity={0.5} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={8} />
                        <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeWidth: 1.5 }} />
                        <Area type="monotone" dataKey="revenue" stroke="url(#agentRevStroke)" strokeWidth={3}
                            fill="url(#agentRevGrad)" dot={false}
                            activeDot={{ r: 6, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
                            style={{ filter: 'drop-shadow(0px 0px 10px rgba(6,182,212,0.5))' }} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// ─── Deal Stage Pie ───────────────────────────────────────────────────────────

function AgentDealsChart({ deals, agencySettings }: { deals: Deal[]; agencySettings: any }) {
    const stageData = useMemo(() => {
        const customStages = agencySettings?.customDealStages || [];
        const stageMap = new Map<string, { label: string; count: number }>();

        const getLabel = (stageId: string) => {
            if (customStages.length > 0) {
                const cs = customStages.find((s: any) => s.id === stageId);
                if (cs) return cs.label;
            }
            const defaults: Record<string, string> = { qualification: 'בירור צרכים', negotiation: 'משא ומתן', won: 'נסגר בהצלחה' };
            return defaults[stageId] || stageId;
        };

        deals.forEach(d => {
            const label = getLabel(d.stage);
            const existing = stageMap.get(d.stage);
            stageMap.set(d.stage, { label, count: (existing?.count || 0) + 1 });
        });

        return Array.from(stageMap.values()).map(v => ({ name: v.label, value: v.count }));
    }, [deals, agencySettings]);

    if (stageData.length === 0) {
        return (
            <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col">
                <h2 className="text-base font-bold text-white mb-2">עסקאות לפי שלב</h2>
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">אין עסקאות להצגה</div>
            </div>
        );
    }

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col">
            <h2 className="text-base font-bold text-white mb-1">עסקאות לפי שלב</h2>
            <p className="text-xs text-slate-400 mb-4">הנתונים שלי בלבד</p>
            <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={stageData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                            paddingAngle={4} dataKey="value" stroke="#0f172a" strokeWidth={2}>
                            {stageData.map((_e, i) => <Cell key={i} fill={DEAL_COLORS[i % DEAL_COLORS.length]} />)}
                        </Pie>
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, color: '#fff', fontSize: 12 }}
                            formatter={(v: any, name: string) => [v + ' עסקאות', name]}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
                {stageData.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DEAL_COLORS[i % DEAL_COLORS.length] }} />
                            <span className="text-[10px] text-slate-400 truncate max-w-[70px]">{item.name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-white">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Leads Status Chart ────────────────────────────────────────────────────────

function AgentLeadsChart({ leads }: { leads: Lead[] }) {
    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        leads.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });
        return Object.entries(counts).map(([status, count]) => ({ status, count, label: STATUS_LABELS[status] || status }));
    }, [leads]);

    const total = statusData.reduce((s, i) => s + i.count, 0);

    if (total === 0) {
        return (
            <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col">
                <h2 className="text-base font-bold text-white mb-2">סטטוס לידים</h2>
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">אין לידים להצגה</div>
            </div>
        );
    }

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col">
            <h2 className="text-base font-bold text-white mb-1">סטטוס לידים</h2>
            <p className="text-xs text-slate-400 mb-4">הלידים המשויכים אליי</p>
            <div className="space-y-3">
                {statusData.map(item => {
                    const pct = total > 0 ? (item.count / total) * 100 : 0;
                    const color = STATUS_COLORS[item.status] || '#64748b';
                    return (
                        <div key={item.status}>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-semibold text-slate-300">{item.label}</span>
                                <span className="text-xs font-black text-white">{item.count}</span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main AgentDashboard ──────────────────────────────────────────────────────

export default function AgentDashboard() {
    const { userData } = useAuth();
    const { deals, leads, properties, agencySettings, loading } = useLiveDashboardData();
    const { data: agents } = useAgents();

    const uid = userData?.uid;

    // Filter all data to this agent only
    const myDeals = useMemo(() => deals.filter(d => d.createdBy === uid || d.agentId === uid), [deals, uid]);
    const myLeads = useMemo(() => leads.filter(l => l.assignedAgentId === uid), [leads, uid]);
    const myProperties = useMemo(() => properties.filter(p => p.agentId === uid && !p.isGlobalCityProperty), [properties, uid]);

    // KPIs
    const totalPotential = useMemo(() => myDeals.filter(d => d.stage !== 'won').reduce((s, d) => s + (d.projectedCommission || 0), 0), [myDeals]);
    const activeDeals = useMemo(() => myDeals.filter(d => d.stage !== 'won').length, [myDeals]);
    const activeLeads = useMemo(() => myLeads.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length, [myLeads]);
    const actualRevenue = useMemo(() => myDeals.filter(d => d.stage === 'won').reduce((s, d) => s + (d.actualCommission || d.projectedCommission || 0), 0), [myDeals]);

    const agentName = userData?.name || 'סוכן';

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-400 text-sm animate-pulse">טוען נתונים...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12" dir="rtl">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-black text-white">שלום, {agentName} 👋</h1>
                <p className="text-sm text-slate-400 mt-1">הדאשבורד האישי שלך — הנתונים שלי בלבד</p>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <AgentKpiCard
                    title="פוטנציאל הכנסות"
                    value={formatCurrency(totalPotential)}
                    subtitle="בעסקאות פעילות"
                    icon={Target}
                    color="blue"
                />
                <AgentKpiCard
                    title="הכנסות בפועל"
                    value={formatCurrency(actualRevenue)}
                    subtitle="מעסקאות שנסגרו"
                    icon={DollarSign}
                    color="emerald"
                />
                <AgentKpiCard
                    title="עסקאות פעילות"
                    value={String(activeDeals)}
                    subtitle="עסקאות בתהליך"
                    icon={Briefcase}
                    color="amber"
                />
                <AgentKpiCard
                    title="לידים פעילים"
                    value={String(activeLeads)}
                    subtitle="לידים חמים"
                    icon={Users}
                    color="purple"
                />
            </div>

            {/* Revenue Chart + Tasks */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <AgentRevenueChart deals={myDeals} />
                </div>
                <div>
                    <TaskDashboardWidget />
                </div>
            </div>

            {/* Map */}
            {myProperties.length > 0 && (
                <div>
                    <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-5 bg-blue-500 rounded-full inline-block" />
                        הנכסים שלי במפה
                    </h2>
                    <div style={{ height: 380 }} className="rounded-2xl overflow-hidden border border-slate-800">
                        <PropertyMap properties={myProperties} />
                    </div>
                </div>
            )}

            {/* Deal Stages + Lead Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AgentDealsChart deals={myDeals} agencySettings={agencySettings} />
                <AgentLeadsChart leads={myLeads} />
            </div>
        </div>
    );
}
