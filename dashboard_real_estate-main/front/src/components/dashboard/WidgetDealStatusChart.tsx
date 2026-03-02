import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useMemo } from 'react';
import { Deal, Agency } from '../../types';
import { aggregateDealStages } from '../../utils/analytics';

const DEFAULT_COLORS = ['#F97316', '#3B82F6', '#8B5CF6', '#10B981', '#06B6D4', '#EC4899'];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-3 shadow-2xl border border-slate-700 text-right" dir="rtl">
                <p className="text-sm font-bold text-white mb-1">{label}</p>
                <p className="text-xs text-slate-300">{payload[0].value} עסקאות</p>
            </div>
        );
    }
    return null;
};

interface WidgetDealStatusChartProps {
    deals: Deal[];
    agencySettings?: Agency['settings'] | null;
}

export default function WidgetDealStatusChart({ deals, agencySettings }: WidgetDealStatusChartProps) {
    const stageData = useMemo(() => {
        const customStages = agencySettings?.customDealStages || [];
        return aggregateDealStages(deals, customStages);
    }, [deals, agencySettings]);

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-4 lg:p-5 h-full flex flex-col">
            <div className="mb-4">
                <h2 className="text-base font-bold text-white">עסקאות לפי שלב</h2>
            </div>

            <div className="flex-1 min-h-0">
                {stageData.length > 0 ? (
                    <div className="h-full flex flex-col gap-2">
                        <div className="flex-1 min-h-[160px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stageData} margin={{ top: 10, right: 30, left: -20, bottom: 45 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} strokeOpacity={0.3} />
                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} dy={8} angle={-35} textAnchor="end" />
                                    <YAxis orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{ fill: '#1e293b', opacity: 0.4 }} content={<CustomTooltip />} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={24}>
                                        {stageData.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Legend with Percentages */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center px-1 pb-1">
                            {stageData.map((item, index) => {
                                const total = stageData.reduce((acc, curr) => acc + curr.value, 0);
                                const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                                return (
                                    <div key={item.name} className="flex items-center gap-1.5 bg-slate-900/50 border border-slate-800/50 px-2 py-1 rounded-lg">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DEFAULT_COLORS[index % DEFAULT_COLORS.length] }} />
                                        <span className="text-[10px] text-slate-400 font-bold">{percentage}%</span>
                                        <span className="text-[9px] text-slate-500 font-medium max-w-[50px] truncate">{item.name}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-500 font-medium text-xs">
                        אין נתונים להצגה
                    </div>
                )}
            </div>
        </div>
    );
}
