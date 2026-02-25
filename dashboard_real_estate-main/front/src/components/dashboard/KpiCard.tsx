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
    blue: { icon: 'bg-blue-500/20 text-blue-400', bar: 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]', badge: 'bg-blue-500/20 text-blue-400' },
    emerald: { icon: 'bg-emerald-500/20 text-emerald-400', bar: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]', badge: 'bg-emerald-500/20 text-emerald-400' },
    amber: { icon: 'bg-orange-500/20 text-orange-400', bar: 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]', badge: 'bg-orange-500/20 text-orange-400' },
    violet: { icon: 'bg-violet-500/20 text-violet-400', bar: 'bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.8)]', badge: 'bg-violet-500/20 text-violet-400' },
};

export default function KpiCard({ title, value, rawValue, target, change, positive, subtitle, icon, color }: KpiCardProps) {
    const Icon = iconMap[icon] ?? DollarSign;
    const colors = colorMap[color] ?? colorMap.blue;
    const pct = Math.min(100, Math.round((rawValue / target) * 100));
    const onTrack = pct >= 70;

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-5 flex flex-col gap-4 hover:border-slate-700 transition-colors duration-200">
            <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.icon}`}>
                    <Icon size={20} />
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${positive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {change}
                </span>
            </div>

            <div>
                <p className="text-2xl font-black text-white tracking-tight">{value}</p>
                <p className="text-sm font-medium text-slate-300 mt-0.5">{title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>

            {/* Progress bar */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-400 font-medium">{pct}% מהיעד</span>
                    <span className={`text-xs font-bold ${onTrack ? 'text-emerald-400' : 'text-red-400'}`}>
                        {onTrack ? '✓ במסלול' : '⚠ מאחור'}
                    </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-700 ${onTrack ? colors.bar : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
