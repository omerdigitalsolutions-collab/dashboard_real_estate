import { Sparkles, TrendingDown, Target, BarChart2, ChevronLeft, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const insights = [
    {
        id: 1,
        icon: TrendingDown,
        iconBg: 'bg-red-50',
        iconColor: 'text-red-500',
        badge: 'מחיר',
        badgeColor: 'bg-red-50 text-red-600',
        title: 'הנכס ברוטשילד עומד 45 יום ללא הצעות',
        text: 'לאור מגמות השוק הנוכחיות, המערכת ממליצה על הפחתת מחיר של 3% כדי לעורר עניין מחדש.',
        action: 'שלח הודעה לסוכן',
    },
    {
        id: 2,
        icon: Target,
        iconBg: 'bg-violet-50',
        iconColor: 'text-violet-500',
        badge: 'יעד',
        badgeColor: 'bg-violet-50 text-violet-600',
        title: 'נועה קרובה ל-8% מיעד הרבעון',
        text: 'יש לה 3 עסקאות בשלב המו״מ הסופי. מומלץ להציע תמיכה בסגירה כדי לחצות את היעד השבוע.',
        action: 'שלח למנהל',
    },
    {
        id: 3,
        icon: BarChart2,
        iconBg: 'bg-orange-50',
        iconColor: 'text-orange-500',
        badge: 'קמפיין',
        badgeColor: 'bg-orange-50 text-orange-600',
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
        <div className="relative rounded-2xl overflow-hidden p-px ai-gradient-border">
            <div className={`bg-white rounded-[15px] transition-all duration-300 ${isExpanded ? 'p-4 lg:px-6 lg:py-5' : 'p-3 lg:px-5 lg:py-3'}`}>
                {/* Header */}
                <div
                    className={`flex items-center justify-between cursor-pointer ${isExpanded ? 'mb-4 border-b border-slate-100 pb-4' : ''}`}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                            <Sparkles size={16} className="text-white" />
                        </div>
                        <h2 className="text-sm font-bold text-slate-800">AI Co-Pilot — תובנות חכמות מבוססות נתונים</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                            3 תובנות חדשות
                        </span>
                        <div className="flex items-center justify-center p-1 font-bold text-xs text-slate-400 gap-1 hover:text-indigo-600">
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
                                    className={`rounded-xl border p-4 flex flex-col gap-3 transition-all duration-300 ${isApplied ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-100 bg-slate-50/60 hover:border-indigo-100 hover:bg-indigo-50/30'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${insight.iconBg} flex items-center justify-center flex-shrink-0`}>
                                            <Icon size={16} className={insight.iconColor} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${insight.badgeColor}`}>
                                                {insight.badge}
                                            </span>
                                            <p className="text-sm font-bold text-slate-900 mt-1.5 leading-snug">{insight.title}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">{insight.text}</p>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleApply(insight.id); }}
                                        disabled={isApplied}
                                        className={`mt-auto flex items-center justify-between w-full text-xs font-semibold px-3 py-2 rounded-lg transition-all ${isApplied ? 'text-emerald-600 bg-emerald-100 cursor-default' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                                    >
                                        <span>{isApplied ? 'בוצע ✓' : 'יישם המלצה'}</span>
                                        {isApplied ? <CheckCircle size={14} className="text-emerald-500" /> : <ChevronLeft size={14} />}
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
