import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Timestamp } from 'firebase/firestore';
import { createEvent } from '../../services/calendarService';
import { getAgencyTeam } from '../../services/teamService';
import { getLiveLeads, addLead } from '../../services/leadService';
import { getLiveProperties } from '../../services/propertyService';
import { addTask } from '../../services/taskService';
import { AppUser, Lead, Property } from '../../types';
import { X, Calendar, MapPin, AlignLeft, Loader2, Link as LinkIcon, UserPlus, Phone, CheckCircle2, MessageCircle, Building2, User } from 'lucide-react';
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
    
    // Team & List selection
    const [teamMembers, setTeamMembers] = useState<AppUser[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    
    const [selectedAgentId, setSelectedAgentId] = useState<string>('none');
    const [selectedLeadId, setSelectedLeadId] = useState<string>('none');
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>('none');
    
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [isQuickLead, setIsQuickLead] = useState(false);
    const [isExistingLeadMode, setIsExistingLeadMode] = useState(true);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    
    // Success View state
    const [isSuccess, setIsSuccess] = useState(false);
    const [meetingLink, setMeetingLink] = useState('');

    useEffect(() => {
        if (isOpen && userData?.agencyId) {
            const unsubTeam = getAgencyTeam(userData.agencyId, setTeamMembers);
            const unsubLeads = getLiveLeads(userData.agencyId, (data) => {
                setLeads(data.filter(l => l.name));
            });
            const unsubProps = getLiveProperties(userData.agencyId, setProperties);

            return () => {
                unsubTeam();
                unsubLeads();
                unsubProps();
            };
        }
    }, [isOpen, userData?.agencyId]);

    useEffect(() => {
        if (isOpen) {
            setSummary(initialData?.summary || '');
            setDescription(initialData?.description || '');
            setLocation(initialData?.location || '');
            setClientPhone(initialData?.clientPhone || '');
            setClientName(initialData?.relatedEntityName || '');
            
            if (initialData?.relatedEntityType === 'lead' && initialData.relatedEntityId) {
                setSelectedLeadId(initialData.relatedEntityId);
                setIsExistingLeadMode(true);
            } else if (initialData?.relatedEntityType === 'property' && initialData.relatedEntityId) {
                setSelectedPropertyId(initialData.relatedEntityId);
            }

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
            setIsQuickLead(false);
        }
    }, [isOpen, initialData]);

    if (!isOpen || !userData) return null;

    const handleLeadChange = (id: string) => {
        setSelectedLeadId(id);
        if (id !== 'none') {
            const lead = leads.find(l => l.id === id);
            if (lead) {
                setClientPhone(lead.phone || '');
                setClientName(lead.name);
                if (!summary || summary === 'פגישה חדשה') {
                    setSummary(`פגישה עם ${lead.name}`);
                }
            }
        }
    };

    const handlePropertyChange = (id: string) => {
        setSelectedPropertyId(id);
        if (id !== 'none') {
            const prop = properties.find(p => p.id === id);
            if (prop) {
                setLocation(`${prop.address}${prop.city ? `, ${prop.city}` : ''}`);
                if (!summary || summary.includes('פגישה')) {
                    const lead = leads.find(l => l.id === selectedLeadId);
                    setSummary(`פגישה בנכס: ${prop.address} ${lead ? `(עם ${lead.name})` : ''}`);
                }
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!summary.trim()) {
            setError('יש להזין כותרת לפגישה');
            return;
        }

        const startDateTime = new Date(`${startDate}T${startTime}`);
        const endDateTime = new Date(`${endDate}T${endTime}`);

        if (endDateTime <= startDateTime) {
            setError('זמן הסיום חייב להיות אחרי זמן ההתחלה');
            toast.error('זמן הסיום חייב להיות אחרי זמן ההתחלה');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            let finalLeadId = selectedLeadId === 'none' ? null : selectedLeadId;
            let finalClientName = clientName;

            // Handle Quick Lead Creation
            if (!isExistingLeadMode && isQuickLead && clientPhone) {
                try {
                    const newLeadId = await addLead(userData.agencyId, {
                        name: clientName || 'לקוח מפגישה',
                        phone: clientPhone,
                        status: 'new',
                        source: 'calendar',
                    }) as string;
                    finalLeadId = newLeadId;
                    finalClientName = clientName || 'לקוח מפגישה';
                    toast.success('ליד חדש נוצר במערכת');
                } catch (leadErr) {
                    console.error('Error creating quick lead:', leadErr);
                    toast.error('שגיאה ביצירת ליד חדש, ממשיך בקביעת הפגישה...');
                }
            }

            const attendees = [];
            const agent = teamMembers.find(m => m.id === selectedAgentId);
            if (agent && agent.email) {
                attendees.push({ email: agent.email, displayName: agent.name });
            }

            // Google Calendar Event
            const res = await createEvent({
                summary: summary.trim(),
                description: description.trim(),
                location: location.trim(),
                start: { dateTime: startDateTime.toISOString(), timeZone },
                end: { dateTime: endDateTime.toISOString(), timeZone },
                attendees: attendees.length > 0 ? attendees : undefined
            });

            if (res?.htmlLink) {
                setMeetingLink(res.htmlLink);
            }

            // Record in CRM (Tasks)
            const taskData: any = {
                title: `פגישה: ${summary.trim()}`,
                description: `${description.trim()}\n\nקישור ליומן: ${res?.htmlLink || 'לא זמין'}`,
                status: 'pending',
                priority: 'Medium',
                dueDate: Timestamp.fromDate(startDateTime),
                updatedAt: Timestamp.now(),
                category: 'meeting',
                createdBy: userData.uid,
                assignedTo: selectedAgentId !== 'none' ? selectedAgentId : userData.uid,
                isCompleted: false
            };

            if (selectedPropertyId !== 'none') {
                taskData.relatedTo = {
                    type: 'property',
                    id: selectedPropertyId,
                    name: location
                };
            } else if (finalLeadId) {
                taskData.relatedTo = {
                    type: 'lead',
                    id: finalLeadId,
                    name: finalClientName
                };
            }

            await addTask(userData.agencyId, taskData);
            
            toast.success('הפגישה נוצרה וסונכרנה למערכת');
            setIsSuccess(true);
        } catch (err: any) {
            console.error('Error in meeting workflow:', err);
            setError(err.message || 'אירעה שגיאה. וודא שחיברת את יומן גוגל בהגדרות.');
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
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" dir="rtl">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50 shrink-0">
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

                {/* Content */}
                {isSuccess ? (
                    <div className="p-6 space-y-6 overflow-y-auto">
                        <div className="text-center py-4">
                            <h4 className="text-xl font-bold text-slate-800 mb-2">{summary}</h4>
                            <p className="text-slate-500 text-sm">
                                {startDate} בשעה {startTime}
                            </p>
                        </div>
                        
                        <div className="space-y-4">
                            {selectedAgentId !== 'none' && (
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <p className="text-sm font-bold text-slate-700 mb-1">עדכון הסוכן</p>
                                    <p className="text-xs text-slate-500 mb-3">
                                        זימון רשמי יישלח למייל של הסוכן אוטומטית. ניתן גם לעדכן בוואטסאפ:
                                    </p>
                                    <button 
                                        onClick={handleSendAgentWhatsApp}
                                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-2.5 rounded-xl transition-all shadow-md text-sm"
                                    >
                                        <MessageCircle size={16} />
                                        שליחת הודעה לסוכן
                                    </button>
                                </div>
                            )}

                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-sm font-bold text-slate-700 mb-3">שליחת תזכורת ללקוח</p>
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Phone size={16} className="absolute right-3 top-2.5 text-slate-400" />
                                        <input
                                            type="tel"
                                            value={clientPhone}
                                            onChange={(e) => setClientPhone(e.target.value)}
                                            placeholder="טלפון הלקוח..."
                                            className="w-full bg-white border border-slate-200 rounded-xl pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    </div>
                                    <button 
                                        onClick={handleSendClientWhatsApp}
                                        className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-2.5 rounded-xl transition-all shadow-md text-sm"
                                    >
                                        <MessageCircle size={16} />
                                        שליחת תזכורת ללקוח ב-WhatsApp
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3 sticky bottom-0 bg-white">
                            <button onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl transition-all">
                                סגור חלון
                            </button>
                            {meetingLink && (
                                <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold py-3 rounded-2xl transition-all border border-blue-100">
                                    פתח ביומן
                                </a>
                            )}
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-4">
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">שיוך לליד</label>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setIsExistingLeadMode(!isExistingLeadMode);
                                                setSelectedLeadId('none');
                                            }}
                                            className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold hover:bg-blue-100 transition-colors"
                                        >
                                            {isExistingLeadMode ? 'ליד חדש?' : 'בחר מהרשימה'}
                                        </button>
                                    </div>
                                    
                                    {isExistingLeadMode ? (
                                        <div className="relative">
                                            <User size={16} className="absolute right-3 top-3 text-slate-400" />
                                            <select
                                                value={selectedLeadId}
                                                onChange={(e) => handleLeadChange(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                            >
                                                <option value="none">-- בחר ליד מהרשימה --</option>
                                                {leads.map(lead => (
                                                    <option key={lead.id} value={lead.id}>
                                                        {lead.name} {lead.phone ? `(${lead.phone})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <User size={16} className="absolute right-3 top-3 text-slate-400" />
                                                <input
                                                    type="text"
                                                    value={clientName}
                                                    onChange={e => setClientName(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm"
                                                    placeholder="שם הלקוח..."
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 px-1">
                                                <input 
                                                    type="checkbox" 
                                                    id="quickLead" 
                                                    checked={isQuickLead}
                                                    onChange={e => setIsQuickLead(e.target.checked)}
                                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                                                />
                                                <label htmlFor="quickLead" className="text-xs text-slate-500 font-medium cursor-pointer">
                                                    הוסף אוטומטית כליד חדש במערכת
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">נכס רלוונטי (אופציונלי)</label>
                                    <div className="relative">
                                        <Building2 size={16} className="absolute right-3 top-3 text-slate-400" />
                                        <select
                                            value={selectedPropertyId}
                                            onChange={(e) => handlePropertyChange(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                        >
                                            <option value="none">-- בחר נכס (אופציונלי) --</option>
                                            {properties.map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.address} {p.city ? `, ${p.city}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-slate-500 tracking-wider">התחלה</label>
                                    <div className="flex gap-2">
                                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200/60 rounded-xl px-2 py-2 text-sm" />
                                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-20 bg-slate-50 border border-slate-200/60 rounded-xl px-2 py-2 text-sm" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-slate-500 tracking-wider">סיום</label>
                                    <div className="flex gap-2">
                                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200/60 rounded-xl px-2 py-2 text-sm" />
                                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-20 bg-slate-50 border border-slate-200/60 rounded-xl px-2 py-2 text-sm" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">שיוך לסוכן</label>
                                    <div className="relative">
                                        <UserPlus size={16} className="absolute right-3 top-3 text-slate-400" />
                                        <select
                                            value={selectedAgentId}
                                            onChange={(e) => setSelectedAgentId(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                        >
                                            <option value="none">-- ללא סוכן --</option>
                                            {teamMembers.map(member => (
                                                <option key={member.id} value={member.id}>{member.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">טלפון לקוח</label>
                                    <div className="relative">
                                        <Phone size={16} className="absolute right-3 top-3 text-slate-400" />
                                        <input
                                            type="tel"
                                            value={clientPhone}
                                            onChange={e => setClientPhone(e.target.value)}
                                            disabled={isExistingLeadMode && selectedLeadId !== 'none'}
                                            className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                                            placeholder="05X-XXXXXXX"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">מיקום</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute right-3 top-3 text-slate-400" />
                                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20" placeholder="כתובת..." />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">תיאור</label>
                                <div className="relative">
                                    <AlignLeft size={16} className="absolute right-3 top-3 text-slate-400" />
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20" placeholder="פרטים נוספים..." />
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 sticky bottom-0 bg-white pb-2 flex gap-3">
                             <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Calendar size={18} />}
                                קבע פגישה וסנכרן
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
