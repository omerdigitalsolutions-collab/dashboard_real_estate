import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Loader2, Mail, Lock, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { signInWithGooglePopup, signInWithGoogle, getGoogleRedirectResult } from '../services/authService';

type View = 'login' | 'forgot_password';

const FIREBASE_ERROR_MAP: Record<string, string> = {
    'auth/user-not-found': 'משתמש לא קיים',
    'auth/wrong-password': 'סיסמה שגויה',
    'auth/invalid-credential': 'אימייל או סיסמה שגויים',
    'auth/invalid-email': 'כתובת אימייל לא תקינה',
    'auth/user-disabled': 'המשתמש חסום. פנה לתמיכה.',
    'auth/too-many-requests': 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
    'auth/network-request-failed': 'שגיאת רשת. בדוק את חיבור האינטרנט.',
};

function getFirebaseErrorMessage(code: string, fallback: string): string {
    return FIREBASE_ERROR_MAP[code] || fallback;
}

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(true);
    const [view, setView] = useState<View>('login');
    const [resetSent, setResetSent] = useState(false);

    const { currentUser, userData, requireOnboarding, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    // ─── State-driven navigation after auth ───────────────────────────────────
    useEffect(() => {
        if (authLoading) return;
        if (currentUser) {
            if (userData) {
                navigate('/dashboard', { replace: true });
            } else if (requireOnboarding) {
                navigate('/onboarding', { replace: true });
            }
        }
    }, [currentUser, userData, requireOnboarding, authLoading, navigate]);

    // ─── Handle Google redirect result on page load ───────────────────────────
    useEffect(() => {
        const handleRedirectResult = async () => {
            try {
                await getGoogleRedirectResult();
            } catch (err: any) {
                setError('שגיאה בהתחברות עם חשבון גוגל');
            } finally {
                setIsGoogleLoading(false);
            }
        };
        handleRedirectResult();
    }, []);

    // ─── Login ────────────────────────────────────────────────────────────────
    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
            // Navigation handled by useEffect above
        } catch (err: any) {
            setError(getFirebaseErrorMessage(err.code, 'שגיאה בהתחברות. נסה שוב.'));
            setIsLoading(false);
        }
    };

    // ─── Forgot Password ──────────────────────────────────────────────────────
    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            setError('אנא הזן כתובת אימייל');
            return;
        }
        setError(null);
        setIsLoading(true);
        try {
            await sendPasswordResetEmail(auth, email.trim());
            setResetSent(true);
        } catch (err: any) {
            setError(getFirebaseErrorMessage(err.code, 'שגיאה בשליחת קישור האיפוס. נסה שוב.'));
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Google Login ─────────────────────────────────────────────────────────
    const handleGoogleLogin = async () => {
        setError(null);
        setIsGoogleLoading(true);
        try {
            await signInWithGooglePopup();
            // Navigation handled by useEffect
        } catch (err: any) {
            if (err.code === 'auth/popup-blocked') {
                try {
                    await signInWithGoogle();
                } catch {
                    setError('החלון הקופץ נחסם. נסה שוב.');
                }
            } else {
                setError('שגיאה בהתחברות עם גוגל');
            }
        } finally {
            setIsGoogleLoading(false);
        }
    };

    const switchToForgot = () => { setView('forgot_password'); setError(null); setResetSent(false); };
    const switchToLogin = () => { setView('login'); setError(null); setResetSent(false); };

    // ─── Shared input class ───────────────────────────────────────────────────
    const inputClass =
        'w-full bg-slate-900/50 border border-slate-700/80 text-white rounded-xl py-3.5 pr-12 pl-4 ' +
        'focus:outline-none focus:ring-2 focus:ring-[#00e5ff]/50 focus:border-[#00e5ff] transition-all ' +
        'placeholder-slate-500 text-base';

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#020b18] px-4 relative overflow-hidden" dir="rtl">
            {/* Background glow orbs */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00e5ff]/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-700/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <div className="w-full max-w-md relative z-10">
                {/* Logo */}
                <div className="text-center mb-8">
                    <img src="/homer-logo.png" alt="hOMER CRM" className="h-16 mx-auto mb-5 drop-shadow-lg" />
                </div>

                {/* Card */}
                <div className="w-full bg-[#0a192f]/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl p-8">

                    {/* ── FORGOT PASSWORD VIEW ─────────────────────────────── */}
                    {view === 'forgot_password' ? (
                        resetSent ? (
                            // Success state
                            <div className="flex flex-col items-center text-center space-y-5 py-4">
                                <div className="w-20 h-20 bg-emerald-500/15 rounded-full flex items-center justify-center border-2 border-emerald-500/40">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-white mb-2">קישור נשלח בהצלחה!</h2>
                                    <p className="text-slate-400 leading-relaxed">
                                        שלחנו קישור לאיפוס הסיסמה אל <span className="text-white font-bold">{email}</span>.
                                        <br />בדוק גם את תיקיית הספאם אם לא רואה את המייל.
                                    </p>
                                </div>
                                <button
                                    onClick={switchToLogin}
                                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-3.5 rounded-xl transition-all"
                                >
                                    <ArrowRight className="w-4 h-4" />
                                    חזור להתחברות
                                </button>
                            </div>
                        ) : (
                            // Email input form
                            <form onSubmit={handlePasswordReset} className="space-y-6" noValidate>
                                <div className="text-center">
                                    <h2 className="text-2xl font-black text-white mb-1">איפוס סיסמה</h2>
                                    <p className="text-slate-400 text-sm">הזינו את כתובת האימייל שלכם ונשלח לכם קישור לאיפוס.</p>
                                </div>

                                {error && (
                                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-center gap-3">
                                        <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                                        <p className="text-rose-400 text-sm font-medium">{error}</p>
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="reset-email" className="block text-slate-300 font-medium mb-2 text-sm">אימייל</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-slate-500" />
                                        </div>
                                        <input
                                            id="reset-email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className={inputClass}
                                            placeholder="name@agency.co.il"
                                            dir="ltr"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-[#00e5ff] hover:bg-[#00cce6] text-[#020b18] font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.35)] hover:shadow-[0_0_30px_rgba(0,229,255,0.55)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שלח קישור לאיפוס'}
                                </button>

                                <button
                                    type="button"
                                    onClick={switchToLogin}
                                    className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors py-1"
                                >
                                    <ArrowRight className="w-4 h-4" />
                                    חזור להתחברות
                                </button>
                            </form>
                        )
                    ) : (
                        /* ── LOGIN VIEW ───────────────────────────────────── */
                        <form onSubmit={handleEmailLogin} className="space-y-5" noValidate autoComplete="on">
                            <div className="text-center mb-2">
                                <h2 className="text-2xl font-black text-white mb-1">ברוכים הבאים</h2>
                                <p className="text-slate-400 text-sm">התחברו למערכת הניהול שלכם</p>
                            </div>

                            {error && (
                                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-center gap-3">
                                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                                    <p className="text-rose-400 text-sm font-medium">{error}</p>
                                </div>
                            )}

                            {/* Email */}
                            <div>
                                <label htmlFor="email" className="block text-slate-300 font-medium mb-2 text-sm">אימייל</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className={inputClass}
                                        placeholder="name@agency.co.il"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label htmlFor="password" className="block text-slate-300 font-medium text-sm">סיסמה</label>
                                    <button
                                        type="button"
                                        onClick={switchToForgot}
                                        className="text-[#00e5ff] text-sm font-medium hover:brightness-125 transition-all"
                                    >
                                        שכחת סיסמה?
                                    </button>
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={inputClass}
                                        placeholder="••••••••"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={isLoading || isGoogleLoading}
                                className="w-full bg-[#00e5ff] hover:bg-[#00cce6] text-[#020b18] font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.35)] hover:shadow-[0_0_30px_rgba(0,229,255,0.55)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base mt-2"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'התחבר'}
                            </button>

                            {/* Divider */}
                            <div className="relative flex items-center gap-3 py-1">
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-slate-500 text-xs font-medium">או</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>

                            {/* Google Login */}
                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                disabled={isLoading || isGoogleLoading}
                                className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isGoogleLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                                ) : (
                                    <>
                                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                                            <path d="M22.56 12.25C22.56 11.47 22.49 10.72 22.36 10H12V14.26H17.92C17.66 15.63 16.88 16.79 15.72 17.57V20.34H19.29C21.37 18.42 22.56 15.6 22.56 12.25Z" fill="#4285F4" />
                                            <path d="M12 23C14.97 23 17.46 22.02 19.29 20.34L15.72 17.57C14.73 18.23 13.48 18.63 12 18.63C9.13 18.63 6.69 16.69 5.81 14.1H2.12V16.96C3.94 20.57 7.67 23 12 23Z" fill="#34A853" />
                                            <path d="M5.81 14.1C5.58 13.41 5.45 12.69 5.45 11.95C5.45 11.21 5.58 10.49 5.81 9.80001V6.94001H2.12C1.37 8.44001 0.95 10.15 0.95 11.95C0.95 13.75 1.37 15.46 2.12 16.96L5.81 14.1Z" fill="#FBBC05" />
                                            <path d="M12 5.28C13.62 5.28 15.07 5.84 16.21 6.93L19.38 3.76C17.45 1.96 14.97 0.9 12 0.9C7.67 0.9 3.94 3.33 2.12 6.94L5.81 9.8C6.69 7.2 9.13 5.28 12 5.28Z" fill="#EA4335" />
                                        </svg>
                                        <span>התחבר עם גוגל</span>
                                    </>
                                )}
                            </button>

                            {/* Register link */}
                            <p className="text-center text-slate-500 text-sm pt-1">
                                עדיין אין לך חשבון?{' '}
                                <Link to="/register" className="text-[#00e5ff] font-bold hover:brightness-125 transition-all">
                                    הירשם עכשיו
                                </Link>
                            </p>

                            <p className="text-center text-slate-500 text-xs mt-2 border-t border-white/5 pt-4">
                                קיבלת קוד ממנהל משרד?{' '}
                                <Link to="/join-agency" className="text-slate-300 font-bold hover:text-white transition-all underline underline-offset-4">
                                    הצטרף לסוכנות כאן
                                </Link>
                            </p>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-slate-600 text-xs mt-6">
                    © 2026 hOMER · מבית עומר פתרונות דיגיטלים
                </p>
            </div>
        </div>
    );
}
