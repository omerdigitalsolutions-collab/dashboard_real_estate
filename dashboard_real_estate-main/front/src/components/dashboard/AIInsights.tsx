import { Sparkles, TrendingDown, Target, BarChart2, ChevronLeft, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const insights = [
    {
        id: 1,
        icon: TrendingDown,
        iconBg: 'bg-red-500/20',
        iconColor: 'text-red-400',
        badge: 'מחיר',
        badgeColor: 'bg-red-500/20 text-red-400 border border-red-500/30',
        title: 'הנכס ברוטשילד עומד 45 יום ללא הצעות',
        text: 'לאור מגמות השוק הנוכחיות, המערכת ממליצה על הפחתת מחיר של 3% כדי לעורר עניין מחדש.',
        action: 'שלח הודעה לסוכן',
    },
    {
        id: 2,
        icon: Target,
        iconBg: 'bg-violet-500/20',
        iconColor: 'text-violet-400',
        badge: 'יעד',
        badgeColor: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
        title: 'נועה קרובה ל-8% מיעד הרבעון',
        text: 'יש לה 3 עסקאות בשלב המו״מ הסופי. מומלץ להציע תמיכה בסגירה כדי לחצות את היעד השבוע.',
        action: 'שלח למנהל',
    },
    {
        id: 3,
        icon: BarChart2,
        iconBg: 'bg-orange-500/20',
        iconColor: 'text-orange-400',
        badge: 'קמפיין',
        badgeColor: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
        title: 'זינוק של 20% בלידים מפייסבוק',
        text: 'אחוז ההמרה לסיורים נותר נמוך (6%). כדאי לבדוק את איכות הלידים בקמפיין הנוכחי ולמקד מחדש.',
        action: 'פתח קמפיין',
    },
];

export default function AIInsights() {
    const [applied, setApplied] = useState<number[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);

    const handleApply = (id: number) => {
        setApplied((prev) => [...prev, id]);
    };

    return (
        <div className="relative rounded-2xl overflow-hidden p-px ai-gradient-border shadow-xl">
            <div className={`bg-[#0f172a]/90 backdrop-blur-md rounded-[15px] transition-all duration-300 ${isExpanded ? 'p-4 lg:px-6 lg:py-5' : 'p-3 lg:px-5 lg:py-3'}`}>
                {/* Header */}
                <div
                    className={`flex items-center justify-between cursor-pointer ${isExpanded ? 'mb-4 border-b border-slate-800 pb-4' : ''}`}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                            <Sparkles size={16} className="text-white" />
                        </div>
                        <h2 className="text-sm font-bold text-white">AI Co-Pilot — תובנות חכמות מבוססות נתונים</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/30 shadow-[0_0_8px_rgba(99,102,241,0.2)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_5px_currentColor]" />
                            3 תובנות חדשות
                        </span>
                        <div className="flex items-center justify-center p-1 font-bold text-xs text-slate-500 gap-1 hover:text-indigo-400">
                            {isExpanded ? 'סגור' : 'הרחב'}
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </div>
                </div>

                {/* Insights Grid */}
                {isExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {insights.map((insight) => {
                            const Icon = insight.icon;
                            const isApplied = applied.includes(insight.id);
                            return (
                                <div
                                    key={insight.id}
                                    className={`rounded-xl border p-4 flex flex-col gap-3 transition-all duration-300 ${isApplied ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:shadow-[0_0_15px_rgba(99,102,241,0.15)]'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${insight.iconBg} flex items-center justify-center flex-shrink-0`}>
                                            <Icon size={16} className={insight.iconColor} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${insight.badgeColor}`}>
                                                {insight.badge}
                                            </span>
                                            <p className="text-sm font-bold text-white mt-1.5 leading-snug">{insight.title}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">{insight.text}</p>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleApply(insight.id); }}
                                        disabled={isApplied}
                                        className={`mt-auto flex items-center justify-between w-full text-xs font-semibold px-3 py-2 rounded-lg transition-all ${isApplied ? 'text-emerald-400 bg-emerald-500/20 cursor-default shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20'}`}
                                    >
                                        <span>{isApplied ? 'בוצע ✓' : 'יישם המלצה'}</span>
                                        {isApplied ? <CheckCircle size={14} className="text-emerald-400" /> : <ChevronLeft size={14} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
