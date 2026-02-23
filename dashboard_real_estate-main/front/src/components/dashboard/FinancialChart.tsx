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
            <div className="bg-white rounded-xl px-4 py-3 shadow-xl border border-slate-100 text-right" dir="rtl">
                <p className="text-sm font-bold text-slate-800 mb-1">{label}</p>
                <div className="space-y-1">
                    <p className="text-xs text-blue-600 font-medium">
                        הכנסות: <span className="font-bold">₪{payload[0].value.toLocaleString()}</span>
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 lg:p-6 h-full flex flex-col justify-center items-center">
                <div className="animate-pulse flex gap-2"><div className="w-2 h-2 bg-slate-200 rounded-full"></div></div>
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
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 lg:p-6 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">מגמות פיננסיות</h2>
                    <p className="text-sm text-slate-500 mt-0.5">עמלות והכנסות צפויות (בזמן אמת)</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                    {[
                        { k: '3M', l: '3 חודשים' },
                        { k: '6M', l: '6 חודשים' },
                        { k: '1Y', l: 'שנה' }
                    ].map((opt) => (
                        <button
                            key={opt.k}
                            onClick={() => setTimeRange(opt.k as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeRange === opt.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
                        <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
                        <Area type="monotone" dataKey="revenue" name="הכנסות" stroke="#10b981" strokeWidth={2.5} fill="url(#colorRevenue)" dot={false} activeDot={{ r: 5, fill: '#10b981', stroke: 'white', strokeWidth: 2 }} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
