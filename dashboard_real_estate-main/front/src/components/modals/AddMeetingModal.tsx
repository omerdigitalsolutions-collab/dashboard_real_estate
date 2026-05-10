import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createEvent } from '../../services/calendarService';
import { getAgencyTeam } from '../../services/teamService';
import { getLiveLeads } from '../../services/leadService';
import { getLiveProperties } from '../../services/propertyService';
import { AppUser, Lead, Property } from '../../types';
import { X, Calendar, MapPin, AlignLeft, Loader2, Link as LinkIcon, Phone, CheckCircle2, MessageCircle, Building2, User, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

interface AddMeetingModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: {
        summary?: string;
        description?: string;
        location?: string;
        startDate?: string;
        startTime?: string;
        endDate?: string;
        endTime?: string;
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
    const [selectedBuyerId, setSelectedBuyerId] = useState<string>('none');
    const [selectedSellerId, setSelectedSellerId] = useState<string>('none');
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>('none');

    const [clientPhone, setClientPhone] = useState('');

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

            // Reset selections first, then apply any pre-selections from initialData
            setSelectedAgentId('none');
            setSelectedBuyerId('none');
            setSelectedSellerId('none');
            setSelectedPropertyId('none');
            setIsSuccess(false);
            setMeetingLink('');
            setError('');

            if (initialData?.relatedEntityType === 'lead' && initialData.relatedEntityId) {
                setSelectedBuyerId(initialData.relatedEntityId);
            } else if (initialData?.relatedEntityType === 'property' && initialData.relatedEntityId) {
                setSelectedPropertyId(initialData.relatedEntityId);
            }

            // Use passed date/time values when available, otherwise default to now + 1 hour
            if (initialData?.startDate) {
                setStartDate(initialData.startDate);
                setStartTime(initialData.startTime || '09:00');
                setEndDate(initialData.endDate || initialData.startDate);
                setEndTime(initialData.endTime || '10:00');
            } else {
                const now = new Date();
                const start = new Date(now.getTime() + 60 * 60 * 1000);
                const end = new Date(start.getTime() + 60 * 60 * 1000);
                setStartDate(start.toISOString().split('T')[0]);
                setStartTime(start.toTimeString().slice(0, 5));
                setEndDate(end.toISOString().split('T')[0]);
                setEndTime(end.toTimeString().slice(0, 5));
            }
        }
    }, [isOpen, initialData]);

    if (!isOpen || !userData) return null;

    const handleBuyerChange = (id: string) => {
        setSelectedBuyerId(id);
        if (id !== 'none') {
            const lead = leads.find(l => l.id === id);
            if (lead) {
                setClientPhone(lead.phone || '');
                if (!summary) setSummary(`פגישה עם ${lead.name}`);
            }
        }
    };

    const handleSellerChange = (id: string) => {
        setSelectedSellerId(id);
        if (id !== 'none') {
            const lead = leads.find(l => l.id === id);
            if (lead) {
                if (!clientPhone) setClientPhone(lead.phone || '');
                // Auto-fill location from seller's linked property
                const sellerProperty = properties.find(p => p.leadId === id);
                if (sellerProperty?.address?.fullAddress) {
                    setLocation(sellerProperty.address.fullAddress);
                    setSelectedPropertyId(sellerProperty.id);
                }
            }
        }
    };

    const handlePropertyChange = (id: string) => {
        setSelectedPropertyId(id);
        if (id !== 'none') {
            const prop = properties.find(p => p.id === id);
            if (prop) {
                setLocation(`${prop.address?.fullAddress}${prop.address?.city ? `, ${prop.address.city}` : ''}`);
                if (!summary) {
                    const buyer = leads.find(l => l.id === selectedBuyerId);
                    setSummary(`פגישה בנכס: ${prop.address?.fullAddress}${buyer ? ` (עם ${buyer.name})` : ''}`);
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

            const finalBuyerId = selectedBuyerId !== 'none' ? selectedBuyerId : null;
            const finalSellerId = selectedSellerId !== 'none' ? selectedSellerId : null;
            const finalPropertyId = selectedPropertyId !== 'none' ? selectedPropertyId : null;

            const attendees = [];
            const agent = teamMembers.find(m => m.id === selectedAgentId);
            if (agent && agent.email) {
                attendees.push({ email: agent.email, displayName: agent.name });
            }

            // Primary CRM link: seller > buyer > property
            let relatedTo: any = undefined;
            if (finalSellerId) {
                const seller = leads.find(l => l.id === finalSellerId);
                relatedTo = { type: 'lead', id: finalSellerId, name: seller?.name || '' };
            } else if (finalBuyerId) {
                const buyer = leads.find(l => l.id === finalBuyerId);
                relatedTo = { type: 'lead', id: finalBuyerId, name: buyer?.name || '' };
            } else if (finalPropertyId) {
                relatedTo = { type: 'property', id: finalPropertyId, name: location };
            }

            const res = await createEvent({
                summary: summary.trim(),
                description: description.trim(),
                location: location.trim(),
                start: { dateTime: startDateTime.toISOString(), timeZone },
                end: { dateTime: endDateTime.toISOString(), timeZone },
                attendees: attendees.length > 0 ? attendees : undefined,
                assignedToAgentId: selectedAgentId !== 'none' ? selectedAgentId : userData.uid,
                relatedTo,
                ...(finalBuyerId && { buyerId: finalBuyerId }),
                ...(finalSellerId && { sellerId: finalSellerId }),
                ...(finalPropertyId && { propertyId: finalPropertyId }),
            });

            if (res?.htmlLink) {
                setMeetingLink(res.htmlLink);
            }

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

                            {/* Buyer & Seller */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">קונה</label>
                                    <div className="relative">
                                        <User size={16} className="absolute right-3 top-3 text-slate-400" />
                                        <select
                                            value={selectedBuyerId}
                                            onChange={(e) => handleBuyerChange(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                        >
                                            <option value="none">-- בחר קונה --</option>
                                            {leads.map(lead => (
                                                <option key={lead.id} value={lead.id}>
                                                    {lead.name}{lead.phone ? ` (${lead.phone})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">מוכר</label>
                                    <div className="relative">
                                        <User size={16} className="absolute right-3 top-3 text-slate-400" />
                                        <select
                                            value={selectedSellerId}
                                            onChange={(e) => handleSellerChange(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                        >
                                            <option value="none">-- בחר מוכר --</option>
                                            {leads.map(lead => (
                                                <option key={lead.id} value={lead.id}>
                                                    {lead.name}{lead.phone ? ` (${lead.phone})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Property */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">נכס רלוונטי (אופציונלי)</label>
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
                                                {p.address?.fullAddress}{p.address?.city ? `, ${p.address.city}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Date/Time */}
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

                            {/* Agent & Phone */}
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
                                            className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20"
                                            placeholder="05X-XXXXXXX"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Location */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">מיקום</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute right-3 top-3 text-slate-400" />
                                    <input
                                        type="text"
                                        value={location}
                                        onChange={e => setLocation(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20"
                                        placeholder="כתובת..."
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">תיאור</label>
                                <div className="relative">
                                    <AlignLeft size={16} className="absolute right-3 top-3 text-slate-400" />
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        rows={2}
                                        className="w-full bg-slate-50 border border-slate-200/60 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20"
                                        placeholder="פרטים נוספים..."
                                    />
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
