import { Sparkles, TrendingDown, Target, BarChart2, ChevronLeft, CheckCircle, ChevronDown, ChevronUp, Loader2, RefreshCcw, Handshake, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

interface SmartInsight {
    badge: string;
    category: 'price' | 'goal' | 'campaign' | 'lead' | 'deal';
    title: string;
    text: string;
}

const categoryConfig = {
    price: { icon: TrendingDown, bg: 'bg-red-500/20', color: 'text-red-400', border: 'border-red-500/30' },
    goal: { icon: Target, bg: 'bg-violet-500/20', color: 'text-violet-400', border: 'border-violet-500/30' },
    campaign: { icon: BarChart2, bg: 'bg-orange-500/20', color: 'text-orange-400', border: 'border-orange-500/30' },
    lead: { icon: Users, bg: 'bg-blue-500/20', color: 'text-blue-400', border: 'border-blue-500/30' },
    deal: { icon: Handshake, bg: 'bg-emerald-500/20', color: 'text-emerald-400', border: 'border-emerald-500/30' }
};

export default function AIInsights() {
    const [insights, setInsights] = useState<SmartInsight[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [applied, setApplied] = useState<number[]>([]);
    const [isExpanded, setIsExpanded] = useState(true); // Load expanded by default if they are useful

    // Auto-fetch on mount
    useEffect(() => {
        fetchInsights();
    }, []);

    const fetchInsights = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const getSmartInsights = httpsCallable<void, { insights: SmartInsight[] }>(functions, 'ai-getSmartInsights');
            const result = await getSmartInsights();
            setInsights(result.data.insights || []);
            setApplied([]);
        } catch (err: any) {
            console.error('[AIInsights] Failed to fetch:', err);
            setError('לא הצלחנו לייצר תובנות כרגע. נסה שוב מאוחר יותר.');
            setInsights([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApply = (idx: number) => {
        setApplied((prev) => [...prev, idx]);
    };

    return (
        <div className="relative rounded-2xl overflow-hidden p-px ai-gradient-border shadow-xl mb-6 mt-2">
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
                        {!isLoading && !error && insights.length > 0 && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/30 shadow-[0_0_8px_rgba(99,102,241,0.2)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_5px_currentColor]" />
                                {insights.length} תובנות חדשות
                            </span>
                        )}
                        <div className="flex items-center justify-center p-1 font-bold text-xs text-slate-500 gap-1 hover:text-indigo-400">
                            {isExpanded ? 'סגור' : 'הרחב'}
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </div>
                </div>

                {/* Loading State */}
                {isExpanded && isLoading && (
                    <div className="flex flex-col items-center justify-center py-8 gap-3 animate-in fade-in duration-300">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        <p className="text-sm text-slate-400">ה-AI מנתח את נתוני הסוכנות (לידים, נכסים, עסקאות)...</p>
                    </div>
                )}

                {/* Error State */}
                {isExpanded && !isLoading && error && (
                    <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                        <p className="text-sm text-red-400/80">{error}</p>
                        <button
                            onClick={(e) => { e.stopPropagation(); fetchInsights(); }}
                            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <RefreshCcw size={14} />
                            נסה שוב
                        </button>
                    </div>
                )}

                {/* Empty State */}
                {isExpanded && !isLoading && !error && insights.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                        <p className="text-sm text-slate-400">אין תובנות חדשות כרגע. הכל נראה מעולה! 🎉</p>
                        <button
                            onClick={(e) => { e.stopPropagation(); fetchInsights(); }}
                            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <RefreshCcw size={14} />
                            רענן נתונים
                        </button>
                    </div>
                )}

                {/* Insights Grid */}
                {isExpanded && !isLoading && !error && insights.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {insights.map((insight, idx) => {
                            const conf = categoryConfig[insight.category] || categoryConfig.campaign;
                            const Icon = conf.icon;
                            const isApplied = applied.includes(idx);

                            return (
                                <div
                                    key={idx}
                                    className={`rounded-xl border p-4 flex flex-col gap-3 transition-all duration-300 ${isApplied ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:shadow-[0_0_15px_rgba(99,102,241,0.15)]'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${conf.bg} flex items-center justify-center flex-shrink-0`}>
                                            <Icon size={16} className={conf.color} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${conf.bg} ${conf.color} border ${conf.border}`}>
                                                {insight.badge}
                                            </span>
                                            <p className="text-sm font-bold text-white mt-1.5 leading-snug">{insight.title}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed custom-scrollbar max-h-[60px] overflow-y-auto">{insight.text}</p>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleApply(idx); }}
                                        disabled={isApplied}
                                        className={`mt-auto flex items-center justify-between w-full text-xs font-semibold px-3 py-2 rounded-lg transition-all ${isApplied ? 'text-emerald-400 bg-emerald-500/20 cursor-default shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20'}`}
                                    >
                                        <span>{isApplied ? 'בוצע ✓' : 'סימון כטופל'}</span>
                                        {isApplied ? <CheckCircle size={14} className="text-emerald-400" /> : <ChevronLeft size={14} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Refresh Button - visible when loaded and expanded to manually trigger new analysis */}
                {isExpanded && !isLoading && insights.length > 0 && (
                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={(e) => { e.stopPropagation(); fetchInsights(); }}
                            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-white transition-colors group"
                        >
                            <RefreshCcw size={12} className="group-hover:rotate-180 transition-transform duration-500" />
                            בקש חשיבה מחדש מה-AI
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
