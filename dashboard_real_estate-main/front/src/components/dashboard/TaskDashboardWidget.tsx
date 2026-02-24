import { useState, useMemo } from 'react';
import { AppTask } from '../../types';
import { toggleTaskCompletion } from '../../services/taskService';
import {
    CheckCircle2,
    Circle,
    CheckCircle,
    Clock,
    AlertCircle,
    CalendarClock,
    User,
    Home,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { format, isBefore, startOfToday, isToday, isTomorrow } from 'date-fns';
import { he } from 'date-fns/locale';
import { Link } from 'react-router-dom';

interface TaskDashboardWidgetProps {
    tasks: AppTask[];
    onAddClick: () => void;
}

const PRIORITIES = {
    High: { dot: 'bg-red-500', label: 'גבוה' },
    Medium: { dot: 'bg-amber-500', label: 'בינוני' },
    Low: { dot: 'bg-emerald-500', label: 'נמוך' }
};

export default function TaskDashboardWidget({ tasks, onAddClick }: TaskDashboardWidgetProps) {
    const [toggling, setToggling] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    // Filter: Show all tasks
    // Sort: High -> Medium -> Low -> Date for open; Completed tasks at the end
    const displayData = useMemo(() => {
        const filtered = tasks;

        // Priority weighting
        const weight = { High: 3, Medium: 2, Low: 1 };

        const sorted = filtered.sort((a, b) => {
            if (a.isCompleted && !b.isCompleted) return 1;
            if (!a.isCompleted && b.isCompleted) return -1;

            if (!a.isCompleted && !b.isCompleted) {
                const wDiff = weight[b.priority] - weight[a.priority];
                if (wDiff !== 0) return wDiff;
                const dA = (a.dueDate as any)?.toDate ? (a.dueDate as any).toDate() : new Date(a.dueDate as any);
                const dB = (b.dueDate as any)?.toDate ? (b.dueDate as any).toDate() : new Date(b.dueDate as any);
                return dA.getTime() - dB.getTime();
            } else {
                // Both completed: newest completed first
                const cA = (a.completedAt as any)?.toMillis ? (a.completedAt as any).toMillis() : 0;
                const cB = (b.completedAt as any)?.toMillis ? (b.completedAt as any).toMillis() : 0;
                return cB - cA; // descending
            }
        });

        return {
            visible: isExpanded ? sorted.slice(0, 10) : sorted.slice(0, 5),
            total: sorted.length,
            openCount: sorted.filter(t => !t.isCompleted).length
        };
    }, [tasks, isExpanded]);

    const handleToggle = async (task: AppTask) => {
        if (toggling) return;
        setToggling(task.id);
        try {
            await toggleTaskCompletion(task.id, !task.isCompleted);
        } catch (err) {
            console.error('Error toggling task', err);
        } finally {
            setToggling(null);
        }
    };

    const getDueLabel = (dateRaw: any) => {
        const date = dateRaw?.toDate ? dateRaw.toDate() : new Date(dateRaw);
        if (isBefore(date, startOfToday())) return { text: 'באיחור', color: 'text-red-600 font-bold', icon: AlertCircle };
        if (isToday(date)) return { text: 'היום', color: 'text-amber-600', icon: Clock };
        if (isTomorrow(date)) return { text: 'מחר', color: 'text-blue-600', icon: CalendarClock };
        return { text: format(date, 'd MMM', { locale: he }), color: 'text-slate-500', icon: CalendarClock };
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        המשימות שלי
                        {displayData.openCount > 0 && (
                            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                                {displayData.openCount}
                            </span>
                        )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">משימות פתוחות ותיעוד משימות שבוצעו</p>
                </div>
            </div>

            <div className="p-2 flex-grow overflow-y-auto">
                {displayData.total === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-10 text-slate-400">
                        <CheckCircle2 size={40} strokeWidth={1.5} className="mb-3 text-slate-300" />
                        <p className="text-sm">אין משימות פתוחות</p>
                        <p className="text-xs">הכל מטופל, מצוין!</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {displayData.visible.map(task => {
                            const due = getDueLabel(task.dueDate);
                            const DueIcon = due.icon;

                            return (
                                <div
                                    key={task.id}
                                    className={`flex items-start gap-3 p-3 rounded-xl transition-all border border-transparent group ${task.isCompleted ? 'bg-slate-50 opacity-75' : 'hover:bg-slate-50 hover:border-slate-100'
                                        } ${toggling === task.id ? 'opacity-50' : ''}`}
                                >
                                    <button
                                        onClick={() => handleToggle(task)}
                                        disabled={toggling === task.id}
                                        className={`mt-0.5 flex-shrink-0 transition-colors ${task.isCompleted ? 'text-emerald-500' : 'text-slate-300 hover:text-blue-500'
                                            }`}
                                    >
                                        {task.isCompleted ? <CheckCircle size={20} /> : <Circle size={20} />}
                                    </button>

                                    <div className="flex-grow min-w-0 pr-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className={`text-sm font-semibold line-clamp-1 ${task.isCompleted ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                                {task.title}
                                            </p>
                                            {!task.isCompleted && (
                                                <div
                                                    className={`w-2.5 h-2.5 rounded-full ${PRIORITIES[task.priority].dot} shadow-sm shrink-0 mt-1`}
                                                    title={`עדיפות: ${PRIORITIES[task.priority].label}`}
                                                />
                                            )}
                                        </div>

                                        {task.description && (
                                            <p className={`text-xs mt-1 line-clamp-1 ${task.isCompleted ? 'text-slate-400' : 'text-slate-500'}`}>{task.description}</p>
                                        )}

                                        <div className="flex items-center gap-3 mt-2 text-xs">
                                            {task.isCompleted ? (
                                                <span className="text-slate-400 text-[11px]">בוצע ב-{format(task.completedAt?.toDate() || new Date(), 'd MMM', { locale: he })}</span>
                                            ) : (
                                                <span className={`flex items-center gap-1 ${due.color}`}>
                                                    <DueIcon size={12} />
                                                    {due.text === 'היום' || due.text === 'מחר' || due.text === 'באיחור' ? due.text : `תאריך יעד: ${due.text}`}
                                                </span>
                                            )}

                                            {task.relatedTo && (
                                                <Link
                                                    to={task.relatedTo.type === 'lead' ? '/leads' : '/properties'}
                                                    state={{ openId: task.relatedTo.id }}
                                                    className={`flex items-center gap-1 border-r pr-2 hover:underline hover:text-blue-600 transition-colors ${task.isCompleted ? 'text-slate-300 border-slate-200' : 'text-slate-500 border-slate-200'}`}
                                                >
                                                    {task.relatedTo.type === 'lead' ? <User size={12} /> : <Home size={12} />}
                                                    {task.relatedTo.type === 'lead' ? 'ליד - ' : 'נכס - '}
                                                    {task.relatedTo.name || 'מחובר'}
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {displayData.total > 5 && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex text-xs items-center justify-center gap-1 py-2 text-slate-500 hover:bg-slate-50 border-t border-slate-100 transition-colors shrink-0"
                >
                    {isExpanded ? (
                        <>הצג פחות <ChevronUp size={14} /></>
                    ) : (
                        <>הצג הכל ({displayData.total}) <ChevronDown size={14} /></>
                    )}
                </button>
            )}

            <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                <button
                    onClick={onAddClick}
                    className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                    + משימה חדשה
                </button>
            </div>
        </div>
    );
}
