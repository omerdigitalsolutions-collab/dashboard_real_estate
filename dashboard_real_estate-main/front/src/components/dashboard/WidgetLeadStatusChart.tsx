import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { useMemo } from 'react';
import { Lead } from '../../types';
import { aggregateLeadStatuses } from '../../utils/analytics';

const STATUS_COLORS: Record<string, string> = {
    'חדש': '#3B82F6', // Blue
    'נוצר קשר': '#FB923C', // Orange
    'נקבעה פגישה': '#10B981', // Emerald
    'לא רלוונטי': '#94A3B8', // Slate (neutralized)
    'נסגר בהצלחה': '#8B5CF6' // Violet
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-3 shadow-2xl border border-slate-700 text-right" dir="rtl">
                <p className="text-sm font-bold text-white mb-1">{label}</p>
                <p className="text-xs text-slate-300">{payload[0].value} לידים</p>
            </div>
        );
    }
    return null;
};

interface WidgetLeadStatusChartProps {
    leads: Lead[];
}

export default function WidgetLeadStatusChart({ leads }: WidgetLeadStatusChartProps) {
    const statusData = useMemo(() => {
        return aggregateLeadStatuses(leads);
    }, [leads]);

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-4 lg:p-5 h-full flex flex-col">
            <div className="mb-4">
                <h2 className="text-base font-bold text-white">סטטוס לידים</h2>
            </div>

            <div className="flex-1 min-h-0">
                {statusData.length > 0 ? (
                    <div className="h-full flex flex-col gap-4">
                        <div className="flex-1 min-h-[140px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={statusData} margin={{ top: 5, right: 30, left: -25, bottom: 0 }} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} strokeOpacity={0.3} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        tick={{ fontSize: 11, fill: '#cbd5e1' }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={80}
                                        orientation="right"
                                    />
                                    <Tooltip cursor={{ fill: '#1e293b', opacity: 0.4 }} content={<CustomTooltip />} />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                                        {statusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#64748b'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Custom Legend with Percentages */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
                            {statusData.map((item) => {
                                const total = statusData.reduce((acc, curr) => acc + curr.value, 0);
                                const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                                return (
                                    <div key={item.name} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.name] || '#64748b' }} />
                                            <span className="text-[10px] text-slate-400 font-medium truncate max-w-[60px]">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-bold text-white">{item.value}</span>
                                            <span className="text-[9px] font-medium text-slate-500 bg-slate-900 border border-slate-800 px-1 rounded">
                                                {percentage}%
                                            </span>
                                        </div>
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
