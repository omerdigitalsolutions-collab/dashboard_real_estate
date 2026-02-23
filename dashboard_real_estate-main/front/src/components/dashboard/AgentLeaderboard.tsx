import { useState, useEffect } from 'react';
import { Calendar, Target } from 'lucide-react';
import { useAgentPerformance } from '../../hooks/useFirestoreData';
import { useAuth } from '../../context/AuthContext';
import { getAgencyData } from '../../services/agencyService';
import { AppUser } from '../../types';

const formatSales = (v: number) => {
    if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
    return `₪${(v / 1_000).toFixed(0)}K`;
};

const medalColors = ['text-yellow-500', 'text-slate-400', 'text-amber-600'];

export default function AgentLeaderboard() {
    const { currentUser } = useAuth();
    const { data: agentsData, loading: agentsLoading } = useAgentPerformance();
    const [agencyGoal, setAgencyGoal] = useState<number>(0);
    const [agencyLoading, setAgencyLoading] = useState(true);

    useEffect(() => {
        const user = currentUser as AppUser | null;
        if (!user?.agencyId) {
            setAgencyLoading(false);
            return;
        }

        const unsubscribe = getAgencyData(user.agencyId, (agency) => {
            setAgencyGoal(agency.monthlyGoals?.commissions || 0);
            setAgencyLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const isLoading = agentsLoading || agencyLoading;

    if (isLoading) {
        return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-full flex flex-col justify-center items-center">
                <div className="animate-pulse flex gap-2"><div className="w-2 h-2 bg-slate-200 rounded-full"></div></div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">לוח מובילים</h2>
                    <p className="text-sm text-slate-500 mt-0.5">ביצועי סוכנים החודש (בזמן אמת)</p>
                </div>
                <button className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">הצג הכל</button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                {agentsData.length > 0 ? (
                    agentsData.map((agent, index) => {
                        // Divide agency goal evenly among active users (for visual progress comparison)
                        const target = agencyGoal > 0 ? Math.round(agencyGoal / agentsData.length) : 0;
                        const achieved = agent.monthlyAchieved || 0;
                        const percent = target > 0 ? Math.min((achieved / target) * 100, 100) : 100;

                        return (
                            <div key={agent.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                                {/* Rank */}
                                <span className={`text-sm font-bold w-6 text-center flex-shrink-0 ${medalColors[index] ?? 'text-slate-400'}`}>
                                    {index + 1}
                                </span>

                                {/* Avatar */}
                                <div className={`w-10 h-10 rounded-full ${agent.avatarColor} flex items-center justify-center font-bold flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
                                    {agent.avatar}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="text-sm font-bold text-slate-900 truncate">{agent.name}</p>
                                        <div className="flex items-center gap-1 text-xs text-slate-500">
                                            <span className="font-semibold">{formatSales(achieved)}</span>
                                            <span className="text-slate-300">/</span>
                                            <span>{formatSales(target)}</span>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${agent.avatarColor.split(' ')[0]}`}
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>

                                    <div className="flex items-center gap-3 mt-1.5">
                                        <div className="flex items-center gap-1" title="אחוז סגירות עסקאות">
                                            <Target size={12} className="text-emerald-500" />
                                            <span className="text-xs font-medium text-slate-600">{agent.winRate}% הצלחה</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-slate-400">
                                            <Calendar size={12} />
                                            <span>{agent.deals} עסקאות לחודש</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-slate-400 font-medium text-sm pt-8">
                        אין סוכנים להציג
                    </div>
                )}
            </div>
        </div>
    );
}
