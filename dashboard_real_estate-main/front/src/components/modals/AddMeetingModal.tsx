import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createEvent } from '../../services/calendarService';
import { getAgencyTeam } from '../../services/teamService';
import { AppUser } from '../../types';
import { X, Calendar, MapPin, AlignLeft, Loader2, Link as LinkIcon, UserPlus, Phone, CheckCircle2, MessageCircle } from 'lucide-react';
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
        clientPhone?: string;
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
    
    // Team & Agent selection
    const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);
    const [selectedAgentId, setSelectedAgentId] = useState<string>('none');
    const [clientPhone, setClientPhone] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    
    // Success View state
    const [isSuccess, setIsSuccess] = useState(false);
    const [meetingLink, setMeetingLink] = useState('');

    useEffect(() => {
        if (isOpen && userData?.agencyId) {
            const unsub = getAgencyTeam(userData.agencyId, setTeamMembers);
            return () => unsub();
        }
    }, [isOpen, userData?.agencyId]);

    useEffect(() => {
        if (isOpen) {
            setSummary(initialData?.summary || '');
            setDescription(initialData?.description || '');
            setLocation(initialData?.location || '');
            setClientPhone(initialData?.clientPhone || '');
            
            // Default to today + 1 hour
            const now = new Date();
            const start = new Date(now.getTime() + 60 * 60 * 1000);
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            
            setStartDate(start.toISOString().split('T')[0]);
            setStartTime(start.toTimeString().slice(0, 5));
            setEndDate(end.toISOString().split('T')[0]);
            setEndTime(end.toTimeString().slice(0, 5));
            
            setSelectedAgentId('none');
            setIsSuccess(false);
            setMeetingLink('');
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
            
            const attendees = [];
            const agent = teamMembers.find(m => m.id === selectedAgentId);
            if (agent && agent.email) {
                attendees.push({ email: agent.email, displayName: agent.name });
            }

            const res = await createEvent({
                summary: summary.trim(),
                description: description.trim(),
                location: location.trim(),
                start: { dateTime: startDateTime, timeZone },
                end: { dateTime: endDateTime, timeZone },
                attendees: attendees.length > 0 ? attendees : undefined
            });

            if (res?.htmlLink) {
                setMeetingLink(res.htmlLink);
            }
            
            toast.success('הפגישה נוצרה בהצלחה ביומן גוגל');
            setIsSuccess(true);
        } catch (err: any) {
            console.error('Error creating meeting:', err);
            setError(err.message || 'אירעה שגיאה ביצירת הפגישה. וודא שחיברת את יומן גוגל בהגדרות.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSendAgentWhatsApp = () => {
        const agent = teamMembers.find(m => m.id === selectedAgentId);
        if (!agent || !agent.phone) {
            toast.error('לא הוגדר מספר טלפון לסוכן זה');
            return;
        }
        const text = `היי ${agent.name},\nשובצת לפגישה חדשה: *${summary}*\nבתאריך: ${startDate} שעה: ${startTime}.\nבקרוב תקבל/י גם זימון למייל.`;
        const phoneClean = agent.phone.replace(/\D/g, '');
        window.open(`https://wa.me/${phoneClean}?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleSendClientWhatsApp = () => {
        if (!clientPhone) {
            toast.error('יש להזין מספר טלפון של הלקוח');
            return;
        }
        const text = `היי! תזכורת לפגישתנו בנושא: *${summary}*\nבתאריך: ${startDate} בשעה: ${startTime}.\nנשמח לראותך!`;
        const phoneClean = clientPhone.replace(/\D/g, '');
        window.open(`https://wa.me/${phoneClean}?text=${encodeURIComponent(text)}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" dir="rtl">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isSuccess ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                            {isSuccess ? <CheckCircle2 size={20} /> : <Calendar size={20} />}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">
                                {isSuccess ? 'הפגישה נקבעה בהצלחה!' : 'פגישה חדשה ביומן'}
                            </h3>
                            {initialData?.relatedEntityName && !isSuccess && (
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <LinkIcon size={12} /> מקושר ל: {initialData.relatedEntityName}
                                </p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                {/* Success State */}
                {isSuccess ? (
                    <div className="p-6 space-y-6">
                        <div className="text-center py-4">
                            <h4 className="text-xl font-bold text-slate-800 mb-2">{summary}</h4>
                            <p className="text-slate-500 text-sm">
                                {startDate} בשעה {startTime}
                            </p>
                        </div>
                        
                        <div className="space-y-4">
                            {/* Agent Actions */}
                            {selectedAgentId !== 'none' && (
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <p className="text-sm font-bold text-slate-700 mb-1">עדכון הסוכן</p>
                                    <p className="text-xs text-slate-500 mb-3">
                                        זימון רשמי יישלח למייל של הסוכן אוטומטית מ-Google. ניתן גם לעדכן בוואטסאפ:
                                    </p>
                                    <button 
                                        onClick={handleSendAgentWhatsApp}
                                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-2.5 rounded-xl transition-all shadow-md active:scale-95 text-sm"
                                    >
                                        <MessageCircle size={16} />
                                        שליחת הודעה לסוכן
                                    </button>
                                </div>
                            )}

                            {/* Client Actions */}
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-sm font-bold text-slate-700 mb-3">שליחת תזכורת ללקוח</p>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Phone size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                        <input
                                            type="tel"
                                            value={clientPhone}
                                            onChange={(e) => setClientPhone(e.target.value)}
                                            placeholder="טלפון הלקוח..."
                                            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    </div>
                                    <button 
                                        onClick={handleSendClientWhatsApp}
                                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-2.5 rounded-xl transition-all shadow-md active:scale-95 text-sm"
                                    >
                                        <MessageCircle size={16} />
                                        שליחת תזכורת ללקוח ב-WhatsApp
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl transition-all"
                            >
                                סגור חלון
                            </button>
                            {meetingLink && (
                                <a
                                    href={meetingLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 text-center bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold py-3 rounded-2xl transition-all border border-blue-100"
                                >
                                    פתח ביומן
                                </a>
                            )}
                        </div>
                    </div>
                ) : (
                    /* Form State */
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">נושא הפגישה</label>
                            <input
                                autoFocus
                                type="text"
                                value={summary}
                                onChange={e => setSummary(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                placeholder="למשל: פגישת היכרות עם לקוח"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">תאריך התחלה</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">שעה</label>
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={e => setStartTime(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">תאריך סיום</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">שעה</label>
                                <input
                                    type="time"
                                    value={endTime}
                                    onChange={e => setEndTime(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">שיוך לסוכן (אופציונלי)</label>
                                <div className="relative">
                                    <UserPlus size={16} className="absolute right-3 top-3 text-slate-400" />
                                    <select
                                        value={selectedAgentId}
                                        onChange={(e) => setSelectedAgentId(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                                    >
                                        <option value="none">-- ללא סוכן --</option>
                                        {teamMembers.map(member => (
                                            <option key={member.id} value={member.id}>
                                                {member.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">טלפון לקוח לזימון</label>
                                <div className="relative">
                                    <Phone size={16} className="absolute right-3 top-3 text-slate-400" />
                                    <input
                                        type="tel"
                                        value={clientPhone}
                                        onChange={e => setClientPhone(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        placeholder="05X-XXXXXXX"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">מיקום / כתובת</label>
                            <div className="relative">
                                <MapPin size={16} className="absolute right-3 top-3 text-slate-400" />
                                <input
                                    type="text"
                                    value={location}
                                    onChange={e => setLocation(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    placeholder="כתובת הנכס או משרד"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">תיאור הפגישה</label>
                            <div className="relative">
                                <AlignLeft size={16} className="absolute right-3 top-3 text-slate-400" />
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={2}
                                    className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    placeholder="פרטים נוספים..."
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
                                קבע פגישה
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

