import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useMemo, useState, memo } from 'react';
import { LayoutGrid, PieChart as PieIcon } from 'lucide-react';
import { Lead } from '../../types';
import { aggregateLeadStatuses } from '../../utils/analytics';
import PeriodPicker, { usePeriod, periodStartDate, periodLabel } from './PeriodPicker';

const STATUS_COLORS: Record<string, string> = {
    'חדש': '#3B82F6', // Blue
    'נוצר קשר': '#FB923C', // Orange
    'נקבעה פגישה': '#10B981', // Emerald
    'לא רלוונטי': '#94A3B8', // Slate (neutralized)
    'נסגר בהצלחה': '#8B5CF6' // Violet
};

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
        <text
            x={x}
            y={y}
            fill="white"
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[10px] font-bold pointer-events-none"
        >
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-3 shadow-2xl border border-slate-700 text-right" dir="rtl">
                <p className="text-sm font-bold text-white mb-1">{payload[0].name}</p>
                <p className="text-xs text-slate-300">{payload[0].value} לידים</p>
            </div>
        );
    }
    return null;
};

interface WidgetLeadStatusChartProps {
    leads: Lead[];
}

function WidgetLeadStatusChartComponent({ leads }: WidgetLeadStatusChartProps) {
    const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
    const { period, setPeriod } = usePeriod('1m');
    const startDate = periodStartDate(period);

    const filteredLeads = useMemo(() => leads.filter(l => {
        const raw = (l as any).createdAt;
        if (!raw) return false;
        const d = raw.toDate ? raw.toDate() : new Date(raw);
        return d >= startDate;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [leads, period]);

    const statusData = useMemo(() => {
        const aggregated = aggregateLeadStatuses(filteredLeads);
        return aggregated.map(item => ({
            ...item,
            color: STATUS_COLORS[item.name] || '#64748b'
        }));
    }, [filteredLeads]);

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-4 lg:p-5 h-full flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                    <h2 className="text-base font-bold text-white">סטטוס לידים</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{periodLabel(period)}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                            onClick={() => setChartType('pie')}
                            className={`p-1.5 rounded-lg transition-all ${chartType === 'pie' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                            title="תרשים עוגה"
                        >
                            <PieIcon size={14} />
                        </button>
                        <button
                            onClick={() => setChartType('bar')}
                            className={`p-1.5 rounded-lg transition-all ${chartType === 'bar' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                            title="תרשים עמודות"
                        >
                            <LayoutGrid size={14} />
                        </button>
                    </div>
                    <PeriodPicker value={period} onChange={setPeriod} />
                </div>
            </div>

            <div className="flex flex-col items-center flex-1 min-h-0">
                {statusData.length > 0 ? (
                    <>
                        <div className="w-full flex-1 min-h-[140px]">
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === 'pie' ? (
                                    <PieChart>
                                        <Pie
                                            data={statusData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={85}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="#0f172a"
                                            strokeWidth={2}
                                            labelLine={false}
                                            label={renderCustomizedLabel}
                                        >
                                            {statusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                ) : (
                                    <BarChart data={statusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} strokeOpacity={0.5} />
                                        <XAxis 
                                            dataKey="name" 
                                            tick={{ fontSize: 9, fill: '#94a3b8' }} 
                                            axisLine={false} 
                                            tickLine={false}
                                        />
                                        <YAxis 
                                            tick={{ fontSize: 9, fill: '#64748b' }} 
                                            axisLine={false} 
                                            tickLine={false}
                                        />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                            {statusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        </div>

                        <div className="w-full mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto min-h-[50px] custom-scrollbar pr-1">
                            {statusData.map(item => {
                                const total = statusData.reduce((acc, curr) => acc + curr.value, 0);
                                const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                                return (
                                    <div key={item.name} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
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
                    </>
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-500 font-medium text-xs">
                        אין נתונים להצגה
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(WidgetLeadStatusChartComponent);
