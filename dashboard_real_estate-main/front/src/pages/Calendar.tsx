import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { listCalendarEvents } from '../services/calendarService';
import { AddMeetingModal } from '../components/modals/AddMeetingModal';
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Loader2,
    AlertCircle,
    CalendarDays,
    Clock,
    MapPin,
    X,
} from 'lucide-react';
import {
    format,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    eachDayOfInterval,
    eachWeekOfInterval,
    isSameDay,
    isSameMonth,
    addDays,
    addWeeks,
    addMonths,
    addYears,
    subDays,
    subWeeks,
    subMonths,
    subYears,
    isToday,
    parseISO,
    getHours,
    getMinutes,
    differenceInMinutes,
    setHours,
    setMinutes,
    startOfDay,
    isSameWeek,
} from 'date-fns';
import { he } from 'date-fns/locale';

type ViewMode = 'day' | 'week' | 'month' | 'year';

interface CalEvent {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    htmlLink?: string;
    colorId?: string;
}

const EVENT_COLORS = [
    '#4285F4', // Google blue
    '#F4511E', // Tomato
    '#33B679', // Sage
    '#8E24AA', // Grape
    '#E67C73', // Flamingo
    '#F6BF26', // Banana
    '#0B8043', // Basil
    '#039BE5', // Peacock
];

function getEventColor(event: CalEvent, idx: number): string {
    if (event.colorId) {
        const colorMap: Record<string, string> = {
            '1': '#AC725E', '2': '#D06C64', '3': '#F83A22', '4': '#FA573C',
            '5': '#FF7537', '6': '#FFAD46', '7': '#42D692', '8': '#16A765',
            '9': '#7BD148', '10': '#B3DC6C', '11': '#FBE983', '12': '#FAD165',
        };
        return colorMap[event.colorId] || EVENT_COLORS[idx % EVENT_COLORS.length];
    }
    return EVENT_COLORS[idx % EVENT_COLORS.length];
}

function getEventStart(event: CalEvent): Date | null {
    if (event.start?.dateTime) return parseISO(event.start.dateTime);
    if (event.start?.date) return parseISO(event.start.date);
    return null;
}
function getEventEnd(event: CalEvent): Date | null {
    if (event.end?.dateTime) return parseISO(event.end.dateTime);
    if (event.end?.date) return parseISO(event.end.date);
    return null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEK_DAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/* ─── Event Pill ─────────────────────────────────────────────────── */
function EventPill({ event, color, onClick, compact = false }: {
    event: CalEvent; color: string; onClick: () => void; compact?: boolean;
}) {
    const start = getEventStart(event);
    const end = getEventEnd(event);
    return (
        <button
            onClick={onClick}
            className="w-full text-right rounded-md px-1.5 py-0.5 text-white truncate text-[11px] font-medium leading-tight hover:brightness-110 transition-all"
            style={{ backgroundColor: color }}
        >
            {!compact && start && (
                <span className="opacity-80 ml-1">{format(start, 'HH:mm')}</span>
            )}
            {event.summary || '(ללא כותרת)'}
        </button>
    );
}

/* ─── Day View ───────────────────────────────────────────────────── */
function DayView({ date, events, onAddAt, onEventClick, getColor }: {
    date: Date;
    events: CalEvent[];
    onAddAt: (d: Date) => void;
    onEventClick: (e: CalEvent) => void;
    getColor: (e: CalEvent) => string;
}) {
    const dayEvents = events.filter(e => {
        const s = getEventStart(e);
        return s && isSameDay(s, date);
    });

    return (
        <div className="flex flex-col flex-1 overflow-auto">
            {/* Day header */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white sticky top-0 z-10">
                <div className={`w-12 h-12 rounded-full flex flex-col items-center justify-center font-bold text-lg ${isToday(date) ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>
                    <span className="text-xs leading-none">{format(date, 'EEE', { locale: he })}</span>
                    <span className="text-xl leading-none">{format(date, 'd')}</span>
                </div>
            </div>
            <div className="flex flex-1 overflow-y-auto">
                {/* Time gutter */}
                <div className="w-16 flex-shrink-0">
                    {HOURS.map(h => (
                        <div key={h} className="h-14 flex items-start justify-end pr-2 pt-1">
                            <span className="text-[11px] text-slate-400">{h.toString().padStart(2, '0')}:00</span>
                        </div>
                    ))}
                </div>
                {/* Day column */}
                <div className="flex-1 relative border-r border-slate-100" style={{ minHeight: `${24 * 56}px` }}>
                    {HOURS.map(h => (
                        <div
                            key={h}
                            className="h-14 border-t border-slate-100 cursor-pointer hover:bg-blue-50/30 transition-colors"
                            onClick={() => {
                                const d = setMinutes(setHours(date, h), 0);
                                onAddAt(d);
                            }}
                        />
                    ))}
                    {dayEvents.map(event => {
                        const start = getEventStart(event);
                        const end = getEventEnd(event);
                        if (!start || !end) return null;
                        const startMin = getHours(start) * 60 + getMinutes(start);
                        const dur = Math.max(differenceInMinutes(end, start), 30);
                        const top = (startMin / 60) * 56;
                        const height = (dur / 60) * 56;
                        return (
                            <div
                                key={event.id}
                                className="absolute left-1 right-1 rounded-md px-2 py-1 cursor-pointer hover:brightness-110 transition-all overflow-hidden"
                                style={{ top, height, backgroundColor: getColor(event) }}
                                onClick={() => onEventClick(event)}
                            >
                                <p className="text-white text-xs font-bold truncate">{event.summary || '(ללא כותרת)'}</p>
                                <p className="text-white/80 text-[10px]">{format(start, 'HH:mm')} – {format(end, 'HH:mm')}</p>
                            </div>
                        );
                    })}
                    {/* Current time indicator */}
                    {isToday(date) && <CurrentTimeLine />}
                </div>
            </div>
        </div>
    );
}

/* ─── Week View ──────────────────────────────────────────────────── */
function WeekView({ date, events, onAddAt, onEventClick, getColor }: {
    date: Date;
    events: CalEvent[];
    onAddAt: (d: Date) => void;
    onEventClick: (e: CalEvent) => void;
    getColor: (e: CalEvent) => string;
}) {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header row */}
            <div className="flex border-b border-slate-100 bg-white sticky top-0 z-10">
                <div className="w-16 flex-shrink-0" />
                {days.map(day => (
                    <div key={day.toISOString()} className="flex-1 text-center py-2 border-r border-slate-100 last:border-r-0">
                        <span className="block text-xs text-slate-400">{format(day, 'EEE', { locale: he })}</span>
                        <span className={`inline-flex w-8 h-8 items-center justify-center rounded-full text-sm font-bold mt-0.5 ${isToday(day) ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>
                            {format(day, 'd')}
                        </span>
                    </div>
                ))}
            </div>
            {/* Body */}
            <div className="flex flex-1 overflow-y-auto">
                {/* Time gutter */}
                <div className="w-16 flex-shrink-0">
                    {HOURS.map(h => (
                        <div key={h} className="h-14 flex items-start justify-end pr-2 pt-1">
                            <span className="text-[11px] text-slate-400">{h.toString().padStart(2, '0')}:00</span>
                        </div>
                    ))}
                </div>
                {/* Day columns */}
                {days.map(day => {
                    const dayEvs = events.filter(e => {
                        const s = getEventStart(e);
                        return s && isSameDay(s, day);
                    });
                    return (
                        <div key={day.toISOString()} className="flex-1 relative border-r border-slate-100 last:border-r-0" style={{ minHeight: `${24 * 56}px` }}>
                            {HOURS.map(h => (
                                <div
                                    key={h}
                                    className="h-14 border-t border-slate-100 cursor-pointer hover:bg-blue-50/30 transition-colors"
                                    onClick={() => onAddAt(setMinutes(setHours(day, h), 0))}
                                />
                            ))}
                            {dayEvs.map(event => {
                                const s = getEventStart(event);
                                const e = getEventEnd(event);
                                if (!s || !e) return null;
                                const startMin = getHours(s) * 60 + getMinutes(s);
                                const dur = Math.max(differenceInMinutes(e, s), 30);
                                const top = (startMin / 60) * 56;
                                const height = (dur / 60) * 56;
                                return (
                                    <div
                                        key={event.id}
                                        className="absolute left-0.5 right-0.5 rounded px-1 py-0.5 cursor-pointer hover:brightness-110 overflow-hidden"
                                        style={{ top, height, backgroundColor: getColor(event) }}
                                        onClick={() => onEventClick(event)}
                                    >
                                        <p className="text-white text-[10px] font-bold truncate">{event.summary || '(ללא כותרת)'}</p>
                                        <p className="text-white/70 text-[9px]">{format(s, 'HH:mm')}</p>
                                    </div>
                                );
                            })}
                            {isToday(day) && <CurrentTimeLine />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Month View ─────────────────────────────────────────────────── */
function MonthView({ date, events, onDayClick, onEventClick, getColor }: {
    date: Date;
    events: CalEvent[];
    onDayClick: (d: Date) => void;
    onEventClick: (e: CalEvent) => void;
    getColor: (e: CalEvent) => string;
}) {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const start = startOfWeek(monthStart, { weekStartsOn: 0 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });

    return (
        <div className="flex flex-col flex-1 overflow-hidden p-4">
            {/* Week day headers */}
            <div className="grid grid-cols-7 mb-1">
                {WEEK_DAYS_HE.map(d => (
                    <div key={d} className="text-center text-xs font-bold text-slate-400 py-2">{d}</div>
                ))}
            </div>
            {/* Day grid */}
            <div className="grid grid-cols-7 flex-1 gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200">
                {days.map(day => {
                    const dayEvs = events.filter(e => {
                        const s = getEventStart(e);
                        return s && isSameDay(s, day);
                    });
                    const inMonth = isSameMonth(day, date);
                    return (
                        <div
                            key={day.toISOString()}
                            className={`bg-white min-h-[100px] p-1.5 cursor-pointer hover:bg-blue-50/40 transition-colors ${!inMonth ? 'opacity-40' : ''}`}
                            onClick={() => onDayClick(day)}
                        >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mb-1 ${isToday(day) ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>
                                {format(day, 'd')}
                            </div>
                            <div className="space-y-0.5">
                                {dayEvs.slice(0, 3).map(ev => (
                                    <EventPill key={ev.id} event={ev} color={getColor(ev)} onClick={() => onEventClick(ev)} compact />
                                ))}
                                {dayEvs.length > 3 && (
                                    <span className="text-[10px] text-slate-400 pr-1">+{dayEvs.length - 3} עוד</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Year View ──────────────────────────────────────────────────── */
function YearView({ date, events, onMonthClick }: {
    date: Date;
    events: CalEvent[];
    onMonthClick: (m: Date) => void;
}) {
    const year = date.getFullYear();
    return (
        <div className="grid grid-cols-3 gap-5 p-5 overflow-y-auto flex-1">
            {Array.from({ length: 12 }, (_, mi) => {
                const monthDate = new Date(year, mi, 1);
                const monthStart = startOfMonth(monthDate);
                const monthEnd = endOfMonth(monthDate);
                const start = startOfWeek(monthStart, { weekStartsOn: 0 });
                const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
                const days = eachDayOfInterval({ start, end });
                return (
                    <div
                        key={mi}
                        className="bg-white rounded-2xl border border-slate-100 p-3 cursor-pointer hover:shadow-md transition-all hover:border-blue-200"
                        onClick={() => onMonthClick(monthDate)}
                    >
                        <p className="text-sm font-bold text-slate-700 mb-2 text-center">{MONTHS_HE[mi]}</p>
                        <div className="grid grid-cols-7 gap-px">
                            {WEEK_DAYS_HE.map(d => (
                                <div key={d} className="text-center text-[9px] text-slate-300 font-bold">{d}</div>
                            ))}
                            {days.map(day => {
                                const hasEvent = events.some(e => {
                                    const s = getEventStart(e);
                                    return s && isSameDay(s, day);
                                });
                                const inMonth = isSameMonth(day, monthDate);
                                return (
                                    <div
                                        key={day.toISOString()}
                                        className={`text-center text-[10px] rounded-full w-4 h-4 flex items-center justify-center mx-auto
                                            ${!inMonth ? 'opacity-0 pointer-events-none' : ''}
                                            ${isToday(day) ? 'bg-blue-600 text-white font-bold' : hasEvent ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-600'}
                                        `}
                                    >
                                        {inMonth ? format(day, 'd') : ''}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ─── Current Time Line ──────────────────────────────────────────── */
function CurrentTimeLine() {
    const now = new Date();
    const top = ((getHours(now) * 60 + getMinutes(now)) / 60) * 56;
    return (
        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
            <div className="flex items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-600 -mr-1 flex-shrink-0" />
                <div className="flex-1 border-t-2 border-blue-600" />
            </div>
        </div>
    );
}

/* ─── Event Detail Popup ─────────────────────────────────────────── */
function EventDetail({ event, color, onClose }: { event: CalEvent; color: string; onClose: () => void }) {
    const start = getEventStart(event);
    const end = getEventEnd(event);
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="h-2" style={{ backgroundColor: color }} />
                <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                        <h3 className="text-lg font-bold text-slate-900">{event.summary || '(ללא כותרת)'}</h3>
                        <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                            <X size={16} className="text-slate-400" />
                        </button>
                    </div>
                    {start && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                            <Clock size={15} className="text-slate-400 flex-shrink-0" />
                            <span>
                                {format(start, 'EEEE, d MMMM yyyy', { locale: he })}
                                {end && `, ${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`}
                            </span>
                        </div>
                    )}
                    {event.location && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                            <MapPin size={15} className="text-slate-400 flex-shrink-0" />
                            <span>{event.location}</span>
                        </div>
                    )}
                    {event.description && (
                        <p className="text-sm text-slate-500 mt-3 leading-relaxed border-t border-slate-100 pt-3">{event.description}</p>
                    )}
                    {event.htmlLink && (
                        <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 block text-center text-sm font-semibold text-blue-600 hover:underline"
                        >
                            פתח ביומן גוגל ↗
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Main Calendar Page ─────────────────────────────────────────── */
const Calendar = () => {
    const { userData } = useAuth();
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [view, setView] = useState<ViewMode>('month');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
    const [isAddModal, setIsAddModal] = useState(false);
    const [addModalDefaults, setAddModalDefaults] = useState<any>({});

    const isConnected = !!userData?.googleCalendar?.enabled;

    useEffect(() => {
        if (isConnected) fetchEvents();
        else setIsLoading(false);
    }, [isConnected]);

    const fetchEvents = async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await listCalendarEvents();
            setEvents(data || []);
        } catch {
            setError('לא הצלחנו לטעון את האירועים מיומן גוגל.');
        } finally {
            setIsLoading(false);
        }
    };

    // Stable color per event index
    const colorMap = useMemo(() => {
        const m: Record<string, string> = {};
        events.forEach((ev, i) => { m[ev.id] = getEventColor(ev, i); });
        return m;
    }, [events]);

    const getColor = (ev: CalEvent) => colorMap[ev.id] || '#4285F4';

    // Navigation
    const navigate = (dir: 1 | -1) => {
        if (view === 'day') setCurrentDate(d => dir === 1 ? addDays(d, 1) : subDays(d, 1));
        else if (view === 'week') setCurrentDate(d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1));
        else if (view === 'month') setCurrentDate(d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1));
        else setCurrentDate(d => dir === 1 ? addYears(d, 1) : subYears(d, 1));
    };

    // Header label
    const headerLabel = useMemo(() => {
        if (view === 'day') return format(currentDate, 'EEEE, d MMMM yyyy', { locale: he });
        if (view === 'week') {
            const s = startOfWeek(currentDate, { weekStartsOn: 0 });
            const e = endOfWeek(currentDate, { weekStartsOn: 0 });
            return `${format(s, 'd MMM', { locale: he })} – ${format(e, 'd MMM yyyy', { locale: he })}`;
        }
        if (view === 'month') return format(currentDate, 'MMMM yyyy', { locale: he });
        return currentDate.getFullYear().toString();
    }, [view, currentDate]);

    const openAdd = (d: Date) => {
        const ends = new Date(d.getTime() + 60 * 60 * 1000);
        setAddModalDefaults({
            startDate: format(d, 'yyyy-MM-dd'),
            startTime: format(d, 'HH:mm'),
            endDate: format(ends, 'yyyy-MM-dd'),
            endTime: format(ends, 'HH:mm'),
        });
        setIsAddModal(true);
    };

    /* ── Not connected ── */
    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center" dir="rtl">
                <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-600 mb-6">
                    <CalendarDays size={40} />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-3">יומן Google Calendar</h1>
                <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
                    חבר את יומן הגוגל שלך כדי לסנכרן פגישות, משימות וסיורי נכסים ישירות מהמערכת.
                </p>
                <a
                    href="/dashboard/settings?tab=integrations"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-10 rounded-2xl transition-all shadow-lg shadow-blue-500/20"
                >
                    עבור להגדרות לחיבור היומן
                </a>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white" dir="rtl" style={{ minHeight: 'calc(100vh - 64px)' }}>
            {/* ── Toolbar ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0 flex-wrap gap-y-2">
                {/* Today button */}
                <button
                    onClick={() => setCurrentDate(new Date())}
                    className="text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl px-4 py-1.5 hover:bg-slate-50 transition-colors"
                >
                    היום
                </button>

                {/* Prev / Next */}
                <div className="flex items-center gap-1">
                    <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                        <ChevronRight size={18} className="text-slate-600" />
                    </button>
                    <button onClick={() => navigate(1)} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                        <ChevronLeft size={18} className="text-slate-600" />
                    </button>
                </div>

                {/* Period label */}
                <h2 className="text-base font-bold text-slate-900 flex-1 min-w-0 truncate">{headerLabel}</h2>

                {/* View selector */}
                <div className="flex items-center bg-slate-100 rounded-xl p-0.5 text-xs font-semibold">
                    {(['day', 'week', 'month', 'year'] as ViewMode[]).map(v => (
                        <button
                            key={v}
                            onClick={() => setView(v)}
                            className={`px-3 py-1.5 rounded-[10px] transition-all ${view === v ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {v === 'day' ? 'יום' : v === 'week' ? 'שבוע' : v === 'month' ? 'חודש' : 'שנה'}
                        </button>
                    ))}
                </div>

                {/* New event */}
                <button
                    onClick={() => openAdd(new Date())}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl text-sm transition-all shadow shadow-blue-500/20 active:scale-95"
                >
                    <Plus size={16} />
                    אירוע חדש
                </button>
            </div>

            {/* ── Body ── */}
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={32} className="text-blue-600 animate-spin" />
                </div>
            ) : error ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <AlertCircle size={36} className="text-red-400 mb-3" />
                    <p className="text-slate-700 font-semibold mb-3">{error}</p>
                    <button onClick={fetchEvents} className="text-blue-600 font-bold hover:underline text-sm">
                        נסה שוב
                    </button>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {view === 'day' && (
                        <DayView
                            date={currentDate}
                            events={events}
                            onAddAt={openAdd}
                            onEventClick={setSelectedEvent}
                            getColor={getColor}
                        />
                    )}
                    {view === 'week' && (
                        <WeekView
                            date={currentDate}
                            events={events}
                            onAddAt={openAdd}
                            onEventClick={setSelectedEvent}
                            getColor={getColor}
                        />
                    )}
                    {view === 'month' && (
                        <MonthView
                            date={currentDate}
                            events={events}
                            onDayClick={d => { setCurrentDate(d); setView('day'); }}
                            onEventClick={setSelectedEvent}
                            getColor={getColor}
                        />
                    )}
                    {view === 'year' && (
                        <YearView
                            date={currentDate}
                            events={events}
                            onMonthClick={m => { setCurrentDate(m); setView('month'); }}
                        />
                    )}
                </div>
            )}

            {/* ── Modals ── */}
            {selectedEvent && (
                <EventDetail
                    event={selectedEvent}
                    color={getColor(selectedEvent)}
                    onClose={() => setSelectedEvent(null)}
                />
            )}
            <AddMeetingModal
                isOpen={isAddModal}
                onClose={() => { setIsAddModal(false); fetchEvents(); }}
                initialData={addModalDefaults}
            />
        </div>
    );
};

export default Calendar;
