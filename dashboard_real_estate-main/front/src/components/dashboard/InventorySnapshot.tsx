import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Building2 } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { periodStartDate } from './PeriodPicker';
import { TimeRange } from '../../types';

interface InventorySnapshotProps {
    timeRange: TimeRange;
    onClick?: () => void;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-2xl border border-slate-700">
                <p className="text-xs font-bold text-white">{payload[0].name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{payload[0].value} נכסים</p>
            </div>
        );
    }
    return null;
};

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.01) return null;
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
            className="text-[9px] font-bold pointer-events-none"
        >
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export default function InventorySnapshot({ timeRange, onClick }: InventorySnapshotProps) {
    const { properties } = useLiveDashboardData();
    const period = timeRange === '1y' ? '12m' : timeRange;

    const startDate = periodStartDate(period);

    // Only exclusive properties in the selected period
    const newInPeriod = properties.filter(p => {
        const rawDate = (p as any).createdAt;
        if (!rawDate) return false;
        const d = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
        const inPeriod = d >= startDate;
        const isExclusive = (p as any).listingType === 'exclusive' || (p as any).isExclusive === true;
        return inPeriod && isExclusive;
    });

    // For sale / rent distribution among the recruited properties
    const forSale = newInPeriod.filter(p => p.type === 'sale').length;
    const forRent = newInPeriod.filter(p => p.type === 'rent').length;

    const pieData = [
        { name: 'למכירה', value: forSale, color: '#10b981' },
        { name: 'להשכרה', value: forRent, color: '#f43f5e' },
    ];

    const now = new Date();
    const monthName = HEBREW_MONTHS[now.getMonth()];
    const subtitleByPeriod: Record<string, string> = {
        '1m': `גיוס בלעדיות בחודש ${monthName}`,
        '3m': 'גיוס בלעדיות ב-3 חודשים',
        '6m': 'גיוס בלעדיות ב-6 חודשים',
        '12m': 'גיוס בלעדיות ב-12 חודשים',
    };

    const Component = onClick ? 'button' : 'div';
    const clickClass = onClick
        ? 'cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:bg-slate-800/90 hover:shadow-lg hover:shadow-primary/20 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-right w-full'
        : '';

    return (
        <Component onClick={onClick} className={`bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col gap-4 h-full ${clickClass}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h2 className="text-base font-bold text-white">מלאי נכסים</h2>
                    <p className="text-sm text-slate-400 mt-0.5">{subtitleByPeriod[period] || `גיוס בלעדיות לתקופה: ${timeRange}`}</p>
                </div>
            </div>

            {/* Total counter */}
            <div className="flex items-center gap-3 bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
                    <Building2 size={20} />
                </div>
                <div>
                    <p className="text-2xl font-black text-white">{newInPeriod.length}</p>
                    <p className="text-xs text-slate-500">נכסים בלעדיים שגויסו בתקופה</p>
                </div>
            </div>

            {/* Pie chart + legend */}
            <div className="flex flex-col gap-3">
                <div className="w-full h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={75}
                                paddingAngle={3}
                                dataKey="value"
                                stroke="#0f172a"
                                strokeWidth={2}
                                labelLine={false}
                                label={renderCustomizedLabel}
                            >
                                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                    {pieData.map(item => {
                        const total = newInPeriod.length;
                        const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                        return (
                            <div key={item.name} className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-sm shadow-[0_0_8px_currentColor]" style={{ backgroundColor: item.color, color: item.color }} />
                                        <span className="text-xs text-slate-300 font-medium">{item.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white">{item.value}</span>
                                        <span className="text-[10px] font-medium text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded-md border border-slate-700/50">
                                            {percentage}%
                                        </span>
                                    </div>
                                </div>
                                <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000"
                                        style={{ width: `${percentage}%`, backgroundColor: item.color }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Component>
    );
}
