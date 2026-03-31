import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getCalendarAuthUrl } from '../../services/calendarService';
import { 
    CalendarDays, 
    CheckCircle, 
    Loader2, 
    Unlink, 
    AlertCircle,
    ArrowRightLeft
} from 'lucide-react';

export const GoogleCalendarSettings = () => {
    const { userData } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const isConnected = !!userData?.googleCalendar?.enabled;

    const handleConnect = async () => {
        setIsLoading(true);
        setError('');
        try {
            const url = await getCalendarAuthUrl();
            if (url) {
                // Store current location to return back if needed (the backend usually handles the redirect)
                window.location.href = url;
            } else {
                setError('לא התקבל קישור התחברות מהשרת.');
            }
        } catch (err: any) {
            console.error('Failed to get auth URL:', err);
            setError(err.message || 'אירעה שגיאה בחיבור ליומן גוגל.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('האם אתה בטוח שברצונך לנתק את החיבור ליומן גוגל?')) return;
        setIsLoading(true);
        try {
            // Logic for disconnection would go here (calling a service)
            // For now, we'll just show a message or wait for implementation
            alert('אפשרות הניתוק תופעל בקרוב. כרגע ניתן לנתק דרך הגדרות האבטחה של גוגל.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" dir="rtl">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 bg-blue-100 rounded-2xl flex items-center justify-center">
                    <CalendarDays size={22} className="text-blue-600" />
                </div>
                <div>
                    <h2 className="text-base font-bold text-slate-900">יומן גוגל (Google Calendar)</h2>
                    <p className="text-sm text-slate-500">סנכרן את המשימות והפגישות שלך עם היומן האישי</p>
                </div>
            </div>

            {error && (
                <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                    <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                    <span>{error}</span>
                </div>
            )}

            {isConnected ? (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-start gap-4">
                    <CheckCircle size={26} className="text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                        <p className="font-bold text-blue-800 text-base">היומן מחובר ✓</p>
                        <p className="text-sm text-blue-700 mt-1">
                            משימות חדשות שתסמן ליומן יופיעו אוטומטית ביומן הגוגל שלך.
                        </p>
                        <button
                            onClick={handleDisconnect}
                            disabled={isLoading}
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
                            נתק חיבור
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-start gap-3 bg-slate-50 rounded-xl px-4 py-3">
                            <ArrowRightLeft size={18} className="text-blue-600 shrink-0 mt-0.5" />
                            <p className="text-sm text-slate-700 leading-snug">סנכרון דו-כיווני של משימות ופגישות</p>
                        </div>
                        <div className="flex items-start gap-3 bg-slate-50 rounded-xl px-4 py-3">
                            <CalendarDays size={18} className="text-blue-600 shrink-0 mt-0.5" />
                            <p className="text-sm text-slate-700 leading-snug">ניהול לו"ז חכם ישירות מהמערכת</p>
                        </div>
                    </div>

                    <button
                        onClick={handleConnect}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm shadow-sm shadow-blue-600/20 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png" alt="" className="w-5 h-5" />
                        )}
                        חבר את יומן גוגל
                    </button>
                    
                    <p className="text-[11px] text-slate-400 text-center">
                        בלחיצה על "חבר" תועבר לאישור הגישה בחשבון הגוגל שלך.
                    </p>
                </div>
            )}
        </div>
    );
};
