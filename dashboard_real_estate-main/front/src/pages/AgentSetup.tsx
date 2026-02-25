import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { User, CheckCircle2 } from 'lucide-react';
import { isValidPhone } from '../utils/validation';

/**
 * /agent-setup?token=<stubId>
 *
 * Shown to an invited agent right after their first Google sign-in.
 * They can optionally update their name and must provide a phone number.
 * Calls the `users-completeAgentSetup` Cloud Function on submit.
 */
export default function AgentSetup() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { userData, refreshUserData } = useAuth();
    const token = params.get('token') ?? '';

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');

    // Pre-fill name from stub data if available
    useEffect(() => {
        if (userData?.name) setName(userData.name);
        if (userData?.phone) setPhone(userData.phone);
    }, [userData]);

    // If no token, redirect away
    useEffect(() => {
        if (!token) navigate('/');
    }, [token, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isValidPhone(phone)) {
            setError('מספר הטלפון אינו תקין');
            return;
        }

        try {
            setLoading(true);
            const completeSetup = httpsCallable<
                { token: string; name: string; phone: string },
                { success: boolean }
            >(functions, 'users-completeAgentSetup');

            await completeSetup({ token, name: name.trim(), phone: phone.trim() });

            if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
            }

            await refreshUserData();
            setDone(true);
            setTimeout(() => navigate('/'), 2000);
        } catch (err: any) {
            setError(err.message ?? 'אירעה שגיאה, נסה שנית');
        } finally {
            setLoading(false);
        }
    };

    const inputCls = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
    const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6" dir="rtl">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-10 py-10 text-center">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <User size={30} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">השלמת פרופיל</h1>
                    <p className="text-blue-100 text-sm mt-2">רגע אחד לפני שתיכנס ל-Dashboard</p>
                </div>

                <div className="px-10 py-8">
                    {done ? (
                        <div className="text-center py-4 space-y-3">
                            <CheckCircle2 size={48} className="text-emerald-500 mx-auto" />
                            <p className="text-lg font-bold text-slate-900">הפרופיל עודכן בהצלחה!</p>
                            <p className="text-sm text-slate-400">מעביר אותך ל-Dashboard...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className={labelCls}>שם מלא</label>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="ישראל ישראלי"
                                    className={inputCls}
                                />
                            </div>

                            <div>
                                <label className={labelCls}>
                                    טלפון <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    required
                                    placeholder="050-1234567"
                                    className={inputCls}
                                    dir="ltr"
                                />
                            </div>

                            {error && (
                                <p className="text-xs text-red-500 bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl">
                                    {error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !phone}
                                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                {loading ? 'שומר...' : 'כניסה ל-Dashboard →'}
                            </button>

                            <p className="text-xs text-center text-slate-400">
                                ניתן לעדכן את הפרטים בכל עת מדף ההגדרות
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
