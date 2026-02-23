import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useLeads } from '../../hooks/useFirestoreData';
import { useMemo } from 'react';

const SOURCE_COLORS: Record<string, string> = {
  'Facebook': '#1877F2',
  'Instagram': '#E4405F',
  'Google': '#4285F4',
  'Yad2': '#ff6b00',
  'Madlan': '#00d084',
  'Referral': '#8b5cf6',
  'Walk-in': '#64748b',
  'Other': '#94a3b8'
};

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl px-3 py-2 shadow-xl border border-slate-100">
        <p className="text-xs font-bold text-slate-800">{payload[0].name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{payload[0].value}% מהלידים</p>
      </div>
    );
  }
  return null;
};

export default function LeadSourcesChart() {
  const { data: leads, loading } = useLeads();

  const sourceData = useMemo(() => {
    if (!leads.length) return [];

    const counts: Record<string, number> = {};
    leads.forEach(lead => {
      counts[lead.source] = (counts[lead.source] || 0) + 1;
    });

    const total = leads.length;
    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        value: Math.round((count / total) * 100),
        color: SOURCE_COLORS[name] || SOURCE_COLORS['Other']
      }))
      .sort((a, b) => b.value - a.value); // Sort highest first
  }, [leads]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 h-full min-h-[300px] flex items-center justify-center">
        <div className="animate-pulse flex gap-2"><div className="w-2 h-2 bg-slate-200 rounded-full"></div></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-900">מקורות לידים</h2>
        <p className="text-sm text-slate-400 mt-0.5">התפלגות לפי ערוץ (מבוסס אמת)</p>
      </div>

      <div className="flex flex-col items-center flex-1">
        {sourceData.length > 0 ? (
          <>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="white"
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

            {/* Legend */}
            <div className="w-full mt-2 space-y-2 overflow-y-auto max-h-[120px] custom-scrollbar pr-1">
              {sourceData.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-slate-600 font-medium">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
                    </div>
                    <span className="text-sm font-bold text-slate-700 w-8 text-left">{item.value}%</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-slate-400 font-medium text-sm">
            אין לידים להצגה
          </div>
        )}
      </div>
    </div>
  );
}
