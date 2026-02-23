import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useAgentPerformance } from '../../hooks/useFirestoreData';

const formatSales = (value: number) => `₪${(value / 1000000).toFixed(1)}M`;

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 rounded-xl px-4 py-3 shadow-2xl border border-slate-700">
        <p className="text-slate-400 text-xs mb-1 font-medium">{label}</p>
        <p className="text-blue-400 text-sm font-bold">{formatSales(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export default function TopAgentsChart() {
  const { data: agentsData, loading } = useAgentPerformance();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 lg:p-6 h-full flex flex-col justify-center items-center">
        <div className="animate-pulse flex gap-2"><div className="w-2 h-2 bg-slate-200 rounded-full"></div></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 lg:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">סוכנים מובילים</h2>
        <p className="text-sm text-slate-400 mt-0.5">היקף מכירות (מתחילת השנה נתונים אמיתיים)</p>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={agentsData}
          margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
          barSize={28}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={true} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatSales}
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Bar dataKey="sales" radius={[6, 6, 0, 0]}>
            {agentsData.map((_: unknown, index: number) => (
              <Cell
                key={`cell-${index}`}
                fill={index === 0 ? '#3b82f6' : index === 1 ? '#60a5fa' : '#bfdbfe'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
