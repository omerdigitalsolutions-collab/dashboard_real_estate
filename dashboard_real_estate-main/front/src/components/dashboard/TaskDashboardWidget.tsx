import { useState, useMemo } from 'react';
import { AppTask, AppUser } from '../../types';
import { toggleTaskCompletion, addTaskNote } from '../../services/taskService';
import { useAuth } from '../../context/AuthContext';
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
    ChevronUp,
    MessageSquare,
    Send,
    Loader2
} from 'lucide-react';
import { format, isBefore, startOfToday, isToday, isTomorrow } from 'date-fns';
import { he } from 'date-fns/locale';
import { Link } from 'react-router-dom';

interface TaskDashboardWidgetProps {
    tasks: AppTask[];
    onAddClick: () => void;
    agentsById?: Record<string, AppUser>;
}

const PRIORITIES = {
    High: { dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]', label: 'גבוה' },
    Medium: { dot: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]', label: 'בינוני' },
    Low: { dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]', label: 'נמוך' }
};

export default function TaskDashboardWidget({ tasks, onAddClick, agentsById }: TaskDashboardWidgetProps) {
    const { userData } = useAuth();
    const [toggling, setToggling] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedNote, setExpandedNote] = useState<string | null>(null);
    const [noteText, setNoteText] = useState<Record<string, string>>({});
    const [savingNote, setSavingNote] = useState<string | null>(null);

    // Filter: Show all tasks
    // Sort: High -> Medium -> Low -> Date for open; Completed tasks at the end
    const displayData = useMemo(() => {
        const filtered = tasks ?? [];

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

    const handleSaveNote = async (task: AppTask) => {
        const text = noteText[task.id]?.trim();
        if (!text || !userData?.id) return;

        setSavingNote(task.id);
        try {
            await addTaskNote(task.id, text, userData.id);
            setNoteText(prev => ({ ...prev, [task.id]: '' }));
            setExpandedNote(null);
        } catch (err) {
            console.error('Error saving note:', err);
        } finally {
            setSavingNote(null);
        }
    };

    const getDueLabel = (dateRaw: any) => {
        const date = dateRaw?.toDate ? dateRaw.toDate() : new Date(dateRaw);
        if (isBefore(date, startOfToday())) return { text: 'באיחור', color: 'text-red-400 font-bold', icon: AlertCircle };
        if (isToday(date)) return { text: 'היום', color: 'text-orange-400', icon: Clock };
        if (isTomorrow(date)) return { text: 'מחר', color: 'text-cyan-400', icon: CalendarClock };
        return { text: format(date, 'd MMM', { locale: he }), color: 'text-slate-400', icon: CalendarClock };
    };

    const formatNoteDate = (dateRaw: any) => {
        const date = dateRaw?.toDate ? dateRaw.toDate() : new Date(dateRaw);
        return format(date, 'dd.MM HH:mm', { locale: he });
    };

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl shadow-xl border border-slate-800 overflow-hidden flex flex-col h-full">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-white flex items-center gap-2">
                        המשימות שלי
                        {displayData.openCount > 0 && (
                            <span className="bg-cyan-500/20 text-cyan-400 text-xs px-2 py-0.5 rounded-full">
                                {displayData.openCount}
                            </span>
                        )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">משימות פתוחות ותיעוד משימות שבוצעו</p>
                </div>
            </div>

            <div className="p-2 flex-grow overflow-y-auto custom-scrollbar">
                {displayData.total === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-10 text-slate-500">
                        <CheckCircle2 size={40} strokeWidth={1.5} className="mb-3 text-slate-600" />
                        <p className="text-sm">אין משימות פתוחות</p>
                        <p className="text-xs">הכל מטופל, מצוין!</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {displayData.visible.map(task => {
                            const due = getDueLabel(task.dueDate);
                            const DueIcon = due.icon;
                            const isNoteExpanded = expandedNote === task.id;

                            return (
                                <div
                                    key={task.id}
                                    className={`flex flex-col p-3 rounded-xl transition-all border border-transparent group ${task.isCompleted ? 'bg-slate-800/50 opacity-75' : 'hover:bg-slate-800/50 hover:border-slate-700'
                                        } ${toggling === task.id ? 'opacity-50' : ''}`}
                                >
                                    {/* Task Header */}
                                    <div className="flex items-start gap-3">
                                        <button
                                            onClick={() => handleToggle(task)}
                                            disabled={toggling === task.id}
                                            className={`mt-0.5 flex-shrink-0 transition-colors ${task.isCompleted ? 'text-emerald-400' : 'text-slate-600 hover:text-cyan-400'
                                                }`}
                                        >
                                            {task.isCompleted ? <CheckCircle size={20} /> : <Circle size={20} />}
                                        </button>

                                        <div className="flex-grow min-w-0 pr-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm font-semibold line-clamp-1 ${task.isCompleted ? 'text-slate-500 line-through' : 'text-white'}`}>
                                                    {task.title}
                                                </p>
                                                {!task.isCompleted && (
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <div
                                                            className={`w-2 h-2 rounded-full ${PRIORITIES[task.priority].dot} mt-1.5`}
                                                            title={`עדיפות: ${PRIORITIES[task.priority].label}`}
                                                        />
                                                        <button
                                                            onClick={() => setExpandedNote(isNoteExpanded ? null : task.id)}
                                                            className={`p-1 rounded transition-colors ${isNoteExpanded
                                                                ? 'text-cyan-400 bg-cyan-400/10'
                                                                : 'text-slate-500 hover:text-cyan-400 hover:bg-slate-700/50'
                                                                }`}
                                                            title="הוסף הערה"
                                                        >
                                                            <MessageSquare size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {task.description && (
                                                <p className={`text-xs mt-1 line-clamp-1 ${task.isCompleted ? 'text-slate-600' : 'text-slate-400'}`}>{task.description}</p>
                                            )}

                                            {/* Notes Display */}
                                            {task.notes && task.notes.length > 0 && !isNoteExpanded && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {task.notes.slice(-3).map((note, idx) => {
                                                        const author = agentsById?.[note.createdBy];
                                                        const isManager = author?.role === 'admin';
                                                        return (
                                                            <span
                                                                key={idx}
                                                                className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full max-w-[200px] truncate ${isManager ? 'bg-cyan-500/15 text-cyan-300' : 'bg-slate-700/50 text-slate-300'}`}
                                                                title={`${author?.name || 'משתמש'} (${isManager ? 'מנהל' : 'סוכן'}): ${note.text}`}
                                                            >
                                                                <MessageSquare size={10} />
                                                                {note.text.substring(0, 20)}...
                                                            </span>
                                                        );
                                                    })}
                                                    {task.notes.length > 3 && (
                                                        <span className="text-[10px] text-slate-400 px-2 py-1">
                                                            +{task.notes.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-center gap-3 mt-2 text-xs">
                                                {task.isCompleted ? (
                                                    <span className="text-slate-500 text-[11px]">בוצע ב-{format(task.completedAt?.toDate ? task.completedAt.toDate() : (task.completedAt instanceof Date ? task.completedAt : new Date((task.completedAt as any)?.seconds * 1000 || Date.now())), 'd MMM', { locale: he })}</span>
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
                                                        className={`flex items-center gap-1 border-r pr-2 hover:underline hover:text-cyan-400 transition-colors ${task.isCompleted ? 'text-slate-600 border-slate-700' : 'text-slate-400 border-slate-700'}`}
                                                    >
                                                        {task.relatedTo.type === 'lead' ? <User size={12} /> : <Home size={12} />}
                                                        {task.relatedTo.type === 'lead' ? 'ליד - ' : 'נכס - '}
                                                        {task.relatedTo.name || 'מחובר'}
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Note Editor */}
                                    {isNoteExpanded && (
                                        <div className="mt-3 ml-8 flex flex-col gap-2">
                                            {/* Existing Notes */}
                                            {task.notes && task.notes.length > 0 && (
                                                <div className="space-y-1.5 pb-2 max-h-32 overflow-y-auto">
                                                    {task.notes.map((note, idx) => {
                                                        const author = agentsById?.[note.createdBy];
                                                        const authorName = author?.name || 'משתמש';
                                                        const isManager = author?.role === 'admin';
                                                        return (
                                                            <div key={idx} className="bg-slate-800/50 rounded-lg p-2 text-xs">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-slate-300 font-semibold text-[11px]">{authorName}</span>
                                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isManager ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-700 text-slate-300'}`}>
                                                                        {isManager ? 'מנהל' : 'סוכן'}
                                                                    </span>
                                                                    <span className="text-slate-500 text-[10px] mr-auto">
                                                                        {formatNoteDate(note.createdAt)}
                                                                    </span>
                                                                </div>
                                                                <p className="text-slate-200 break-words">{note.text}</p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* New Note Input */}
                                            <div className="flex gap-2 items-end">
                                                <textarea
                                                    value={noteText[task.id] || ''}
                                                    onChange={(e) => setNoteText(prev => ({ ...prev, [task.id]: e.target.value }))}
                                                    placeholder="הוסף הערה..."
                                                    rows={2}
                                                    className="flex-grow bg-slate-800/50 border border-slate-700 text-slate-100 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 focus:border-cyan-400/50 resize-none"
                                                    dir="auto"
                                                />
                                                <button
                                                    onClick={() => handleSaveNote(task)}
                                                    disabled={!noteText[task.id]?.trim() || savingNote === task.id}
                                                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                                                        savingNote === task.id
                                                            ? 'text-slate-400 bg-slate-800/50'
                                                            : noteText[task.id]?.trim()
                                                            ? 'text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20'
                                                            : 'text-slate-600 bg-slate-800/30 cursor-not-allowed'
                                                    }`}
                                                >
                                                    {savingNote === task.id ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : (
                                                        <Send size={14} />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {displayData.total > 5 && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex text-xs items-center justify-center gap-1 py-2 text-slate-400 hover:bg-slate-800/50 border-t border-slate-800 transition-colors shrink-0"
                >
                    {isExpanded ? (
                        <>הצג פחות <ChevronUp size={14} /></>
                    ) : (
                        <>הצג הכל ({displayData.total}) <ChevronDown size={14} /></>
                    )}
                </button>
            )}

            <div className="p-3 border-t border-slate-800 bg-slate-900/50">
                <button
                    onClick={onAddClick}
                    className="w-full py-2 text-sm font-bold text-slate-900 bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                >
                    משימה חדשה
                </button>
            </div>
        </div>
    );
}
