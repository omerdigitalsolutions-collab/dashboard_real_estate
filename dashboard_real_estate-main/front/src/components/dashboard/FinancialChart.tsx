import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useRevenueData } from '../../hooks/useFirestoreData';
import { useState } from 'react';

const formatCurrency = (v: number) => {
    if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `₪${(v / 1_000).toFixed(0)}K`;
    return `₪${v}`;
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-3 shadow-2xl border border-slate-700 text-right" dir="rtl">
                <p className="text-sm font-bold text-white mb-1">{label}</p>
                <div className="space-y-1">
                    <p className="text-xs text-cyan-400 font-medium">
                        הכנסות בפועל: <span className="font-bold text-white">₪{payload[0].value.toLocaleString()}</span>
                    </p>
                </div>
            </div>
        );
    }
    return null;
};

export default function FinancialChart() {
    const [timeRange, setTimeRange] = useState<'3M' | '6M' | '1Y'>('6M');
    const { data: revenueData, loading } = useRevenueData();

    if (loading) {
        return (
            <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 lg:p-6 h-full flex flex-col justify-center items-center">
                <div className="animate-pulse flex gap-2"><div className="w-2 h-2 bg-slate-700 rounded-full"></div></div>
            </div>
        );
    }

    // Filter logic: Hook returns 12 months max. Slice based on timeRange.
    const chartData = timeRange === '3M'
        ? revenueData.slice(-3)
        : timeRange === '6M'
            ? revenueData.slice(-6)
            : revenueData;

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 lg:p-6 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-white">הכנסות ריאליות</h2>
                    <p className="text-sm text-slate-400 mt-0.5">עמלות שנגבו בפועל (בזמן אמת)</p>
                </div>
                <div className="flex bg-slate-900 p-1 rounded-xl self-start sm:self-auto border border-slate-800">
                    {[
                        { k: '3M', l: '3 חודשים' },
                        { k: '6M', l: '6 חודשים' },
                        { k: '1Y', l: 'שנה' }
                    ].map((opt) => (
                        <button
                            key={opt.k}
                            onClick={() => setTimeRange(opt.k as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeRange === opt.k ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {opt.l}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                                <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} strokeOpacity={0.5} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} dy={10} />
                        <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeWidth: 1.5 }} />
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            name="הכנסות בפועל"
                            stroke="url(#colorRevenueStroke)"
                            strokeWidth={4}
                            fill="url(#colorRevenue)"
                            dot={false}
                            activeDot={{ r: 7, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
                            style={{ filter: `drop-shadow(0px 0px 12px rgba(6,182,212,0.6))` }}
                        />
                        <defs>
                            <linearGradient id="colorRevenueStroke" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#06b6d4" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
