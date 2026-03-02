import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useMemo } from 'react';
import { Deal, Agency } from '../../types';
import { aggregateDealStages } from '../../utils/analytics';
import PeriodPicker, { usePeriod, periodStartDate, periodLabel } from './PeriodPicker';

const DEFAULT_COLORS = ['#F97316', '#3B82F6', '#8B5CF6', '#10B981', '#06B6D4', '#EC4899'];

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
    const { period, setPeriod } = usePeriod('1m');
    const startDate = periodStartDate(period);

    const filteredDeals = useMemo(() => deals.filter(d => {
        const raw = (d as any).createdAt;
        if (!raw) return false;
        const dt = raw.toDate ? raw.toDate() : new Date(raw);
        return dt >= startDate;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [deals, period]);

    const stageData = useMemo(() => {
        const customStages = agencySettings?.customDealStages || [];
        return aggregateDealStages(filteredDeals, customStages);
    }, [filteredDeals, agencySettings]);

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-4 lg:p-5 h-full flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                    <h2 className="text-base font-bold text-white">עסקאות לפי שלב</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{periodLabel(period)}</p>
                </div>
                <PeriodPicker value={period} onChange={setPeriod} />
            </div>

            <div className="flex flex-col items-center flex-1 min-h-0">
                {stageData.length > 0 ? (
                    <>
                        <div className="w-full flex-1 min-h-[140px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stageData}
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
                                        {stageData.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="w-full mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto min-h-[50px] custom-scrollbar pr-1">
                            {stageData.map((item, index) => {
                                const total = stageData.reduce((acc, curr) => acc + curr.value, 0);
                                const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                                return (
                                    <div key={item.name} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DEFAULT_COLORS[index % DEFAULT_COLORS.length] }} />
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
