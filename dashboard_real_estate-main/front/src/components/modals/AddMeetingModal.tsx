import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createEvent } from '../../services/calendarService';
import { X, Calendar, MapPin, AlignLeft, Loader2, Link as LinkIcon } from 'lucide-react';
import toast from 'react-hot-toast';

interface AddMeetingModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: {
        summary?: string;
        description?: string;
        location?: string;
        relatedEntityType?: 'lead' | 'property';
        relatedEntityId?: string;
        relatedEntityName?: string;
    };
}

export const AddMeetingModal = ({ isOpen, onClose, initialData }: AddMeetingModalProps) => {
    const { userData } = useAuth();
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('');
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSummary(initialData?.summary || '');
            setDescription(initialData?.description || '');
            setLocation(initialData?.location || '');
            
            // Default to today + 1 hour
            const now = new Date();
            const start = new Date(now.getTime() + 60 * 60 * 1000);
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            
            setStartDate(start.toISOString().split('T')[0]);
            setStartTime(start.toTimeString().slice(0, 5));
            setEndDate(end.toISOString().split('T')[0]);
            setEndTime(end.toTimeString().slice(0, 5));
            
            setError('');
        }
    }, [isOpen, initialData]);

    if (!isOpen || !userData) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary.trim()) {
            setError('יש להזין כותרת לפגישה');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const startDateTime = new Date(`${startDate}T${startTime}`).toISOString();
            const endDateTime = new Date(`${endDate}T${endTime}`).toISOString();
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            await createEvent({
                summary: summary.trim(),
                description: description.trim(),
                location: location.trim(),
                start: { dateTime: startDateTime, timeZone },
                end: { dateTime: endDateTime, timeZone },
            });

            toast.success('הפגישה נוצרה בהצלחה ביומן גוגל');
            onClose();
        } catch (err: any) {
            console.error('Error creating meeting:', err);
            setError(err.message || 'אירעה שגיאה ביצירת הפגישה. וודא שחיברת את יומן גוגל בהגדרות.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" dir="rtl">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
                <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">פגישה חדשה ביומן גוגל</h3>
                            {initialData?.relatedEntityName && (
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <LinkIcon size={12} />
                                    מקושר ל: {initialData.relatedEntityName}
                                </p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                            <span>{error}</span>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-2 mr-1 uppercase tracking-wider">נושא הפגישה</label>
                        <div className="relative">
                            <input
                                autoFocus
                                type="text"
                                value={summary}
                                onChange={e => setSummary(e.target.value)}
                                className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                                placeholder="למשל: פגישת היכרות עם לקוח"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-2 mr-1 uppercase tracking-wider text-right">תאריך התחלה</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-2 mr-1 uppercase tracking-wider text-right">שעה</label>
                            <input
                                type="time"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-2 mr-1 uppercase tracking-wider text-right">תאריך סיום</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 mb-2 mr-1 uppercase tracking-wider text-right">שעה</label>
                            <input
                                type="time"
                                value={endTime}
                                onChange={e => setEndTime(e.target.value)}
                                className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-2 mr-1 uppercase tracking-wider">מיקום</label>
                        <div className="relative">
                            <MapPin size={16} className="absolute left-4 top-3.5 text-slate-400" />
                            <input
                                type="text"
                                value={location}
                                onChange={e => setLocation(e.target.value)}
                                className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
                                placeholder="כתובת הנכס או משרד"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-2 mr-1 uppercase tracking-wider">תיאור ותוכן</label>
                        <div className="relative">
                            <AlignLeft size={16} className="absolute left-4 top-3.5 text-slate-400" />
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                                className="w-full bg-slate-50 border-none rounded-2xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
                                placeholder="פרטים נוספים למניעת שכחה..."
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Calendar size={18} />
                            )}
                            צור פגישה ביומן גוגל
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
