import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { addTask } from '../../services/taskService';
import { addAlert } from '../../services/alertService';
import { X, Calendar, Flag, AlignLeft, CheckSquare, Loader2, Target, CalendarDays, UserCheck, Users, UserX } from 'lucide-react';
import { createCalendarEvent } from '../../services/calendarService';
import { AppUser } from '../../types';

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    leads?: { id: string, name: string }[];
    properties?: { id: string, address: string | { fullAddress?: string; city?: string } }[];
    agents?: AppUser[];
}

export default function AddTaskModal({ isOpen, onClose, leads = [], properties = [], agents = [] }: AddTaskModalProps) {
    const { userData } = useAuth();
    const isAdmin = userData?.role === 'admin';

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
    const [dueDate, setDueDate] = useState('');
    const [relatedEntityType, setRelatedEntityType] = useState<'none' | 'lead' | 'property'>('none');
    const [relatedEntityId, setRelatedEntityId] = useState('');
    const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
    const [syncToGoogle, setSyncToGoogle] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTitle('');
            setDescription('');
            setPriority('Medium');
            setDueDate(new Date().toISOString().split('T')[0]);
            setRelatedEntityType('none');
            setRelatedEntityId('');
            setSelectedAgentIds([]);
            setSyncToGoogle(userData?.googleCalendar?.enabled || false);
            setError('');
        }
    }, [isOpen, userData]);

    if (!isOpen || !userData) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!title.trim()) return setError('נא להזין כותרת למשימה');
        if (!dueDate) return setError('נא לבחור תאריך יעד');
        if (relatedEntityType !== 'none' && !relatedEntityId) {
            return setError('נא לבחור שיוך ספציפי או לשנות את סוג השיוך ל-"ללא חוצץ"');
        }

        setIsSubmitting(true);
        try {
            const taskData: any = {
                title: title.trim(),
                createdBy: userData.uid,
                priority,
                isCompleted: false,
                dueDate: new Date(dueDate),
            };

            taskData.assignedToAgentIds = selectedAgentIds;

            if (description.trim()) {
                taskData.description = description.trim();
            }

            if (relatedEntityType !== 'none' && relatedEntityId) {
                let entityName = '';
                if (relatedEntityType === 'lead') {
                    entityName = leads.find(l => l.id === relatedEntityId)?.name || '';
                } else if (relatedEntityType === 'property') {
                    const addr = properties.find(p => p.id === relatedEntityId)?.address;
                    entityName = typeof addr === 'string' ? addr : (addr?.fullAddress || addr?.city || '');
                }

                taskData.relatedTo = {
                    type: relatedEntityType,
                    id: relatedEntityId,
                    name: entityName
                };
            }

            const taskId = await addTask(userData.agencyId, taskData);

            // Send notification alert to each assigned agent (excluding the creator).
            const recipients = selectedAgentIds.filter(id => id !== userData.uid);
            if (recipients.length > 0) {
                const senderName = userData.name || 'המנהל';
                await Promise.all(recipients.map(agentId => addAlert(userData.agencyId, {
                    agencyId: userData.agencyId,
                    targetAgentId: agentId,
                    title: 'משימה חדשה הוקצתה אליך',
                    message: `${senderName} הקצה לך את המשימה: "${title.trim()}"`,
                    type: 'info',
                    isRead: false,
                    relatedTo: { id: taskId, type: 'task' },
                })));
            }

            if (syncToGoogle) {
                try {
                    await createCalendarEvent(taskId);
                } catch (calErr) {
                    console.error('Failed to sync to Google Calendar:', calErr);
                }
            }

            onClose();
        } catch (err: any) {
            console.error('Error adding task:', err);
            setError(err.message || 'אירעה שגיאה בשמירת המשימה');
        } finally {
            setIsSubmitting(false);
        }
    };

    const inputClasses = "w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none bg-slate-50 focus:bg-white text-slate-700";
    const labelClasses = "block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5";

    // Filter agents list — show all team members in the agency (admins + agents)
    const assignableAgents = agents.filter(a => a.uid != null);

    const toggleAgent = (uid: string) => {
        setSelectedAgentIds(prev =>
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
    };
    const selectAllAgents = () => {
        setSelectedAgentIds(assignableAgents.map(a => a.uid!));
    };
    const clearAgents = () => {
        setSelectedAgentIds([]);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 text-blue-600">
                            <CheckSquare size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">משימה חדשה</h2>
                            <p className="text-xs text-slate-500">הוסף משימה ויעד לביצוע</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                            {error}
                        </div>
                    )}

                    <form id="add-task-form" onSubmit={handleSubmit} className="space-y-5">
                        {/* Title */}
                        <div>
                            <label className={labelClasses}>כותרת שורת פקודה</label>
                            <input
                                autoFocus
                                required
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="למשל: לדבר עם הלקוח על הבית ברחוב תבור"
                                className={inputClasses}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Priority */}
                            <div>
                                <label className={labelClasses}><Flag size={14} /> עדיפות</label>
                                <select
                                    value={priority}
                                    onChange={e => setPriority(e.target.value as any)}
                                    className={`${inputClasses} appearance-none`}
                                >
                                    <option value="High">גבוהה (דחוף)</option>
                                    <option value="Medium">בינונית (רגיל)</option>
                                    <option value="Low">נמוכה</option>
                                </select>
                            </div>

                            {/* Due Date */}
                            <div>
                                <label className={labelClasses}><Calendar size={14} /> תאריך יעד</label>
                                <input
                                    type="date"
                                    required
                                    value={dueDate}
                                    onChange={e => setDueDate(e.target.value)}
                                    className={inputClasses}
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className={labelClasses}><AlignLeft size={14} /> פירוט המשימה (אופציונלי)</label>
                            <textarea
                                rows={3}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="כל פרט חשוב נוסף הקשור לפעולה..."
                                className={`${inputClasses} resize-none`}
                            />
                        </div>

                        {/* Agent Assignment — Admin only */}
                        {isAdmin && assignableAgents.length > 0 && (
                            <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/50">
                                <label className="block text-xs font-semibold text-emerald-700 mb-1.5 flex items-center gap-1.5">
                                    <UserCheck size={14} /> שיוך משימה לסוכנים
                                </label>
                                <p className="text-xs text-emerald-600/80 mb-3">
                                    בחר סוכן אחד או יותר. כל מי שנבחר יקבל התראה ויוכל לראות ולעדכן את המשימה.
                                </p>

                                <div className="flex items-center gap-2 mb-3">
                                    <button
                                        type="button"
                                        onClick={selectAllAgents}
                                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                                    >
                                        <Users size={12} /> כולם
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearAgents}
                                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        <UserX size={12} /> ללא (אישית)
                                    </button>
                                    <span className="ml-auto text-xs text-emerald-700 font-semibold">
                                        נבחרו {selectedAgentIds.length} מתוך {assignableAgents.length}
                                    </span>
                                </div>

                                <div className="bg-white border border-emerald-100 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                                    {assignableAgents.map(agent => {
                                        const uid = agent.uid!;
                                        const checked = selectedAgentIds.includes(uid);
                                        return (
                                            <label
                                                key={uid}
                                                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleAgent(uid)}
                                                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <span className="text-sm text-slate-700 flex-1">
                                                    {agent.name}
                                                </span>
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${agent.role === 'admin' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {agent.role === 'admin' ? 'מנהל' : 'סוכן'}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Entity Selector */}
                        <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50">
                            <label className={`${labelClasses} text-blue-800`}><Target size={14} /> קישור לנכס או ליד</label>
                            <p className="text-xs text-blue-600/80 mb-3 block">אם משימה זו שייכת לגורם קיים במערכת ציין זאת כאן, היא תימחק בעת מחיקת הגורם.</p>

                            <div className="flex flex-col gap-3">
                                <div className="flex bg-white rounded-lg border border-blue-200 p-1 overflow-hidden">
                                    {['none', 'lead', 'property'].map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => { setRelatedEntityType(t as any); setRelatedEntityId(''); }}
                                            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${relatedEntityType === t ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
                                                }`}
                                        >
                                            {t === 'none' ? 'ללא קישור' : t === 'lead' ? 'ליד' : 'נכס'}
                                        </button>
                                    ))}
                                </div>

                                {relatedEntityType === 'lead' && (
                                    <select
                                        value={relatedEntityId}
                                        onChange={e => setRelatedEntityId(e.target.value)}
                                        className={inputClasses}
                                    >
                                        <option value="">בחירת ליד מרשימה...</option>
                                        {leads.map(l => (
                                            <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                    </select>
                                )}

                                {relatedEntityType === 'property' && (
                                    <select
                                        value={relatedEntityId}
                                        onChange={e => setRelatedEntityId(e.target.value)}
                                        className={inputClasses}
                                    >
                                        <option value="">בחירת נכס מרשימה...</option>
                                        {properties.map(p => (
                                            <option key={p.id} value={p.id}>{typeof p.address === 'string' ? p.address : (p.address?.fullAddress || p.address?.city || p.id)}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Google Calendar Sync Toggle */}
                        {userData?.googleCalendar?.enabled && (
                            <div className="flex items-center justify-between p-4 rounded-xl border border-blue-100 bg-blue-50/50">
                                <div className="flex items-center gap-2">
                                    <CalendarDays size={18} className="text-blue-600" />
                                    <div>
                                        <p className="text-sm font-bold text-blue-900">סנכרן ליומן גוגל</p>
                                        <p className="text-[10px] text-blue-600">המשימה תופיע ביומן האישי שלך</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={syncToGoogle}
                                        onChange={e => setSyncToGoogle(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                        )}

                    </form>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                    <button
                        type="submit"
                        form="add-task-form"
                        disabled={isSubmitting}
                        className="w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <><Loader2 size={18} className="animate-spin" /> שומר ביצוע...</>
                        ) : (
                            'צור משימה'
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full mt-2 py-2 text-sm text-slate-500 hover:text-slate-700"
                    >
                        ביטול
                    </button>
                </div>
            </div>
        </div>
    );
}
