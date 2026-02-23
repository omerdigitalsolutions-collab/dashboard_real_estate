import { TrendingUp, TrendingDown, DollarSign, Users, Handshake, BarChart3 } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  positive: boolean;
  subtitle: string;
  index: number;
}

const icons = [DollarSign, Users, Handshake, BarChart3];
const iconColors = [
  'bg-blue-50 text-blue-600',
  'bg-emerald-50 text-emerald-600',
  'bg-amber-50 text-amber-600',
  'bg-sky-50 text-sky-600',
];

export default function StatCard({ title, value, change, positive, subtitle, index }: StatCardProps) {
  const Icon = icons[index % icons.length];
  const iconStyle = iconColors[index % iconColors.length];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconStyle}`}>
          <Icon size={20} />
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full
            ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}
        >
          {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {change}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
      <p className="text-sm font-medium text-slate-700 mt-0.5">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}
