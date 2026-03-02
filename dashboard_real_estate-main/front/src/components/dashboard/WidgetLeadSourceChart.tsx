import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useMemo } from 'react';
import { Lead } from '../../types';
import { aggregateLeadSources } from '../../utils/analytics';

const SOURCE_COLORS: Record<string, string> = {
    'Facebook': '#1877F2', // Facebook Blue
    'Instagram': '#E4405F', // Instagram Pink
    'Google': '#4285F4', // Google Blue
    'Yad2': '#FF8C00', // Deep Orange
    'Madlan': '#00C49F', // Bright Teal
    'Referral': '#A855F7', // Strong Purple
    'Walk-in': '#F59E0B', // Amber
    'Other': '#64748B'  // Slate
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

interface WidgetLeadSourceChartProps {
    leads: Lead[];
}

export default function WidgetLeadSourceChart({ leads }: WidgetLeadSourceChartProps) {
    const sourceData = useMemo(() => {
        const aggregated = aggregateLeadSources(leads);
        return aggregated.map(item => ({
            ...item,
            color: SOURCE_COLORS[item.name] || SOURCE_COLORS['Other']
        }));
    }, [leads]);

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-4 lg:p-5 h-full flex flex-col">
            <div className="mb-4">
                <h2 className="text-base font-bold text-white">מקורות לידים</h2>
            </div>

            <div className="flex flex-col items-center flex-1 min-h-0">
                {sourceData.length > 0 ? (
                    <>
                        <div className="w-full flex-1 min-h-[140px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={sourceData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={75}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="#0f172a"
                                        strokeWidth={2}
                                    >
                                        {sourceData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="w-full mt-2 space-y-1.5 overflow-y-auto min-h-[50px] custom-scrollbar pr-1">
                            {sourceData.map(item => (
                                <div key={item.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                                        <span className="text-xs text-slate-300 font-medium">{item.name}</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-200">{item.value}</span>
                                </div>
                            ))}
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
