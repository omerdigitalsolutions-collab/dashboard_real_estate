import { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { toggleTaskCompletion } from '../../services/taskService';

const severityConfig = {
    high: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.8)]' },
    medium: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', dot: 'bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.8)]' },
    low: { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]' },
};

export default function OperationsCenter() {
    const { tasks, alerts } = useLiveDashboardData();
    const [activeTab, setActiveTab] = useState<'tasks' | 'alerts'>('tasks');

    const handleToggleTask = async (id: string, currentStatus: boolean) => {
        try {
            await toggleTaskCompletion(id, !currentStatus);
        } catch (error) {
            console.error('Failed to toggle task:', error);
        }
    };

    const donePct = tasks.length > 0
        ? Math.round((tasks.filter(t => t.isCompleted).length / tasks.length) * 100)
        : 0;

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl flex flex-col overflow-hidden h-full min-h-[400px]">
            {/* Header */}
            <div className="p-5 pb-0">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-white">מרכז פעולות</h2>
                    {activeTab === 'alerts' && alerts.length > 0 && (
                        <span className="text-xs font-bold bg-red-500 text-white rounded-full px-2 py-0.5">
                            {alerts.length}
                        </span>
                    )}
                </div>
                {/* Tabs */}
                <div className="flex gap-1 bg-slate-900/50 border border-slate-800 rounded-xl p-1 mb-4">
                    {(['tasks', 'alerts'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${activeTab === tab ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {tab === 'tasks' ? `משימות (${tasks.filter(t => !t.isCompleted).length})` : `התראות (${alerts.length})`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 pt-0 space-y-2 scrollbar-hide max-h-[320px]">
                {activeTab === 'tasks' && (
                    <>
                        {/* Progress */}
                        <div className="mb-3">
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>התקדמות יומית</span>
                                <span className="font-bold text-emerald-400">{donePct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] rounded-full transition-all duration-500" style={{ width: `${donePct}%` }} />
                            </div>
                        </div>
                        {tasks
                            .filter(t => !t.isCompleted)
                            .sort((a, b) => (a.dueDate?.toMillis() || 0) - (b.dueDate?.toMillis() || 0))
                            .map(task => {
                                return (
                                    <div
                                        key={task.id}
                                        onClick={() => handleToggleTask(task.id, task.isCompleted)}
                                        className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all hover:bg-slate-800/50 ${task.isCompleted ? 'opacity-50' : ''}`}
                                    >
                                        {task.isCompleted
                                            ? <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                                            : <Circle size={18} className="text-slate-600 flex-shrink-0 mt-0.5" />
                                        }
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium leading-snug ${task.isCompleted ? 'line-through text-slate-500' : 'text-white'}`}>{task.title}</p>
                                        </div>
                                        {/* <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${priorityColor}`}>רגיל</span> */}
                                    </div>
                                );
                            })}
                        {tasks.length === 0 && (
                            <p className="text-sm text-slate-500 text-center py-4">אין משימות להיום.</p>
                        )}
                    </>
                )}

                {activeTab === 'alerts' && (
                    <>
                        {alerts.map(alert => {
                            // Map 'warning' -> high, 'info' -> low
                            const severity = alert.type === 'warning' ? 'high' : 'low';
                            const s = severityConfig[severity];
                            const dateStr = alert.createdAt?.toDate().toLocaleDateString('he-IL', {
                                hour: '2-digit', minute: '2-digit'
                            }) || '';

                            return (
                                <div key={alert.id} className={`flex gap-3 p-3 rounded-xl border ${s.bg} ${s.border}`}>
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${s.dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-bold ${s.color}`}>{alert.type === 'warning' ? 'התראה' : 'עדכון'}</p>
                                        <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{alert.message}</p>
                                        <p className="text-xs text-slate-500 mt-1">{dateStr}</p>
                                    </div>
                                </div>
                            );
                        })}
                        {alerts.length === 0 && (
                            <p className="text-sm text-slate-500 text-center py-4">אין התראות חדשות.</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
