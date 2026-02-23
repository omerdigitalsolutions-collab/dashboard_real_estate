import { TrendingUp, TrendingDown, DollarSign, Users, Handshake, BarChart3 } from 'lucide-react';

interface KpiCardProps {
    title: string;
    value: string;
    rawValue: number;
    target: number;
    change: string;
    positive: boolean;
    subtitle: string;
    icon: string;
    color: string;
}

const iconMap: Record<string, React.ElementType> = {
    DollarSign, Users, Handshake, TrendingUp, BarChart3,
};

const colorMap: Record<string, { icon: string; bar: string; badge: string }> = {
    blue: { icon: 'bg-blue-50 text-blue-600', bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700' },
    emerald: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
    amber: { icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700' },
    violet: { icon: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700' },
};

export default function KpiCard({ title, value, rawValue, target, change, positive, subtitle, icon, color }: KpiCardProps) {
    const Icon = iconMap[icon] ?? DollarSign;
    const colors = colorMap[color] ?? colorMap.blue;
    const pct = Math.min(100, Math.round((rawValue / target) * 100));
    const onTrack = pct >= 70;

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.icon}`}>
                    <Icon size={20} />
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {change}
                </span>
            </div>

            <div>
                <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
                <p className="text-sm font-medium text-slate-700 mt-0.5">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
            </div>

            {/* Progress bar */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-400 font-medium">{pct}% מהיעד</span>
                    <span className={`text-xs font-bold ${onTrack ? 'text-emerald-600' : 'text-red-500'}`}>
                        {onTrack ? '✓ במסלול' : '⚠ מאחור'}
                    </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-700 ${onTrack ? colors.bar : 'bg-red-400'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
