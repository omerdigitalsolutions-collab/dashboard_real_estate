import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Building2 } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';

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

export default function InventorySnapshot() {
    const { properties } = useLiveDashboardData();

    const forSale = properties.filter(p => p.type === 'sale').length;
    const forRent = properties.filter(p => p.type === 'rent').length;

    const pieData = [
        { name: 'למכירה', value: forSale, color: '#06b6d4' },
        { name: 'להשכרה', value: forRent, color: '#10b981' },
    ];

    return (
        <>
            <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-white">מלאי נכסים</h2>
                        <p className="text-sm text-slate-400 mt-0.5">סקירת מצב עדכנית</p>
                    </div>
                </div>

                {/* Total counter */}
                <div className="flex items-center gap-3 bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
                        <Building2 size={20} />
                    </div>
                    <div>
                        <p className="text-2xl font-black text-white">{properties.length}</p>
                        <p className="text-xs text-slate-500">סה"כ נכסים בניהול</p>
                    </div>
                </div>

                {/* Pie chart + legend */}
                <div className="flex items-center gap-4">
                    <div style={{ width: 100, height: 100 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={28}
                                    outerRadius={46}
                                    paddingAngle={3}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                        {pieData.map(item => (
                            <div key={item.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: item.color, color: item.color }} />
                                    <span className="text-xs text-slate-300 font-medium">{item.name}</span>
                                </div>
                                <span className="text-xs font-bold text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </>
    );
}
