import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { listCalendarEvents } from '../services/calendarService';
import { AddMeetingModal } from '../components/modals/AddMeetingModal';
import { 
    Calendar as CalendarIcon, 
    Plus, 
    Loader2, 
    Clock, 
    MapPin, 
    ExternalLink,
    AlertCircle,
    CalendarDays
} from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

const Calendar = () => {
    const { userData } = useAuth();
    const [events, setEvents] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const isConnected = !!userData?.googleCalendar?.enabled;

    useEffect(() => {
        if (isConnected) {
            fetchEvents();
        } else {
            setIsLoading(false);
        }
    }, [isConnected]);

    const fetchEvents = async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await listCalendarEvents();
            setEvents(data);
        } catch (err: any) {
            console.error('Failed to fetch events:', err);
            setError('לא הצלחנו לטעון את הפגישות מיומן גוגל. וודא שהחיבור תקין.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center" dir="rtl">
                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 mb-6 drop-shadow-sm">
                    <CalendarDays size={40} />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-3">יומן גוגל (Google Calendar)</h1>
                <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
                    חבר את יומן הגוגל שלך כדי לסנכרן פגישות, משימות וסיורי נכסים ישירות מהמערכת.
                </p>
                <a 
                    href="/settings?tab=integrations" 
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-10 rounded-2xl transition-all shadow-lg shadow-blue-500/20"
                >
                    עבור להגדרות לחיבור היומן
                </a>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto" dir="rtl">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">היומן שלי</h1>
                    <p className="text-slate-500 mt-1 font-medium italic">הפגישות הקרובות שלך מסונכרנות מגוגל</p>
                </div>
                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-lg shadow-blue-500/25 active:scale-95"
                >
                    <Plus size={18} />
                    <span>פגישה חדשה</span>
                </button>
            </header>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="text-blue-600 animate-spin" />
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-100 rounded-3xl p-8 flex flex-col items-center text-center">
                    <AlertCircle size={40} className="text-red-500 mb-4" />
                    <p className="text-red-800 font-bold mb-2">{error}</p>
                    <button onClick={fetchEvents} className="text-blue-600 font-bold hover:underline">נסה שוב</button>
                </div>
            ) : events.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-16 flex flex-col items-center text-center">
                    <CalendarIcon size={48} className="text-slate-300 mb-6" />
                    <p className="text-slate-500 font-bold text-lg mb-2">אין פגישות קרובות ביומן</p>
                    <p className="text-slate-400 text-sm mb-8">כל פגישה שתקבע ביומן גוגל או במערכת תופיע כאן</p>
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="text-blue-600 font-bold flex items-center gap-2 hover:gap-3 transition-all"
                    >
                        קבע פגישה ראשונה
                        <Plus size={18} />
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {events.map((event) => {
                        const startDate = event.start?.dateTime ? new Date(event.start.dateTime) : null;
                        const endDate = event.end?.dateTime ? new Date(event.end.dateTime) : null;
                        
                        return (
                            <div 
                                key={event.id}
                                className="group bg-white rounded-3xl border border-slate-100 p-1 hover:border-blue-100 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300"
                            >
                                <div className="flex flex-col sm:flex-row items-stretch gap-1">
                                    {/* Date/Time Block */}
                                    <div className="bg-slate-50 rounded-[1.25rem] px-6 py-4 flex flex-col items-center justify-center min-w-[120px] group-hover:bg-blue-50 transition-colors">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 group-hover:text-blue-400">
                                            {startDate ? format(startDate, 'EEEE', { locale: he }) : ''}
                                        </span>
                                        <span className="text-2xl font-black text-slate-700 group-hover:text-blue-900">
                                            {startDate ? format(startDate, 'dd.MM') : ''}
                                        </span>
                                        <div className="flex items-center gap-1 mt-2 text-[11px] font-bold text-slate-500 group-hover:text-blue-600 bg-white/50 px-2 py-0.5 rounded-full">
                                            <Clock size={10} />
                                            {startDate ? format(startDate, 'HH:mm') : ''}
                                        </div>
                                    </div>

                                    {/* Content Block */}
                                    <div className="flex-1 p-5 pr-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-900 transition-colors">
                                                    {event.summary}
                                                </h3>
                                                {event.description && (
                                                    <p className="text-sm text-slate-500 mt-1 line-clamp-1">{event.description}</p>
                                                )}
                                                
                                                <div className="flex flex-wrap gap-4 mt-4">
                                                    {event.location && (
                                                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                                            <MapPin size={14} className="text-slate-300" />
                                                            <span>{event.location}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                                        <Clock size={14} className="text-slate-300" />
                                                        <span>{startDate && endDate ? `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}` : 'כל היום'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {event.htmlLink && (
                                                <a 
                                                    href={event.htmlLink} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
                                                    title="צפה ביומן גוגל"
                                                >
                                                    <ExternalLink size={18} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <AddMeetingModal 
                isOpen={isAddModalOpen} 
                onClose={() => {
                    setIsAddModalOpen(false);
                    fetchEvents(); // Refresh after adding
                }} 
            />
        </div>
    );
};

export default Calendar;
