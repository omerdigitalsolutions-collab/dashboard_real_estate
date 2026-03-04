import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Loader2, Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { signInWithGoogle, signInWithGooglePopup, getGoogleRedirectResult } from '../services/authService';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(true); // Start true for redirect check
    const [isResetMode, setIsResetMode] = useState(false);
    const { currentUser, userData, requireOnboarding, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    // ─── STATE-DRIVEN NAVIGATION ───
    // This effect ensures we only navigate once AuthContext has finished its work
    // (including potential self-healing or stub linking).
    useEffect(() => {
        console.log('[Login] Navigation check:', { currentUser: !!currentUser, userData: !!userData, requireOnboarding, authLoading });

        if (authLoading) return;

        if (currentUser) {
            if (userData) {
                console.log('[Login] User data found, navigating to dashboard');
                navigate('/dashboard', { replace: true });
            } else if (requireOnboarding) {
                console.log('[Login] No user data, require onboarding');
                navigate('/onboarding', { replace: true });
            } else {
                console.log('[Login] currentUser exists but userData/requireOnboarding not set yet.');
            }
        }
    }, [currentUser, userData, requireOnboarding, authLoading, navigate]);

    // Handle Google redirect result when this page loads after redirect
    useEffect(() => {
        const handleRedirectResult = async () => {
            console.log('[Login] Checking for redirect result...');
            try {
                const user = await getGoogleRedirectResult();
                if (user) {
                    console.log('[Login] Redirect user found in effect:', user.email);
                } else {
                    console.log('[Login] No redirect user found in effect.');
                }
            } catch (err: any) {
                console.error('Google redirect result error:', err);
                setError('שגיאה בהתחברות עם חשבון גוגל');
            } finally {
                setIsGoogleLoading(false);
            }
        };
        handleRedirectResult();
    }, []);

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // navigate('/dashboard'); // Removed manual navigation
        } catch (err: any) {
            console.error('Login error:', err);
            setError('אימייל או סיסמה שגויים');
            setIsLoading(false); // Only stop loading on error, otherwise let state-driven nav take over
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setError('אנא הזן כתובת אימייל');
            return;
        }
        setError('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            await sendPasswordResetEmail(auth, email);
            setSuccessMsg('נשלח אליך למייל קישור לאיפוס סיסמה. (בדוק גם בתיקיית הספאם)');
        } catch (err: any) {
            console.error('Password reset error:', err);
            if (err.code === 'auth/user-not-found') {
                setError('לא נמצא משתמש עם אימייל זה');
            } else if (err.code === 'auth/valid-email') {
                setError('כתובת אימייל לא חוקית');
            } else {
                setError('שגיאה בשליחת מייל איפוס סיסמה');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setIsGoogleLoading(true);
        try {
            console.log('[Login] Starting Google Popup login...');
            const user = await signInWithGooglePopup();
            if (user) {
                console.log('[Login] Google Popup success:', user.email);
                // AuthContext will handle navigation via useEffect
            }
        } catch (err: any) {
            console.error('Google login error:', err);
            // Fallback to redirect if popup is blocked or fails
            if (err.code === 'auth/popup-blocked') {
                console.log('[Login] Popup blocked, falling back to redirect...');
                try {
                    await signInWithGoogle();
                } catch (redirectErr) {
                    setError('החלון הקופץ נחסם והתחברות חלופית נכשלה');
                }
            } else {
                setError('שגיאה בהתחברות עם חשבון גוגל');
            }
        } finally {
            setIsGoogleLoading(false);
        }
    };


    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8" dir="rtl">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    Omer Digital Solutions
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    {isResetMode ? 'שחזור סיסמה' : 'התחבר למערכת'}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
                    {isResetMode ? (
                        <form className="space-y-6" onSubmit={handlePasswordReset}>
                            <div>
                                <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700">
                                    הזן את האימייל שלך לקבלת קישור לאיפוס סיסמה
                                </label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="reset-email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="appearance-none block w-full px-3 py-2 pr-10 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder="name@example.com"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="text-red-600 text-sm font-medium text-center bg-red-50 p-3 rounded-md border border-red-100">
                                    {error}
                                </div>
                            )}

                            {successMsg ? (
                                <div className="text-emerald-700 text-sm font-medium border border-emerald-200 bg-emerald-50 p-4 rounded-md flex flex-col items-center gap-3 text-center">
                                    <CheckCircle2 size={32} className="text-emerald-500" />
                                    {successMsg}
                                </div>
                            ) : (
                                <div>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שלח קישור לחידוש סיסמה'}
                                    </button>
                                </div>
                            )}

                            <div className="mt-6 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => { setIsResetMode(false); setError(''); setSuccessMsg(''); }}
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
                                >
                                    <ArrowRight size={16} />
                                    <span>חזור להתחברות</span>
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form className="space-y-6" onSubmit={handleEmailLogin}>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                                    אימייל
                                </label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="appearance-none block w-full px-3 py-2 pr-10 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder="name@example.com"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                                    סיסמה
                                </label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="appearance-none block w-full px-3 py-2 pr-10 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                        placeholder="••••••••"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-start">
                                <button
                                    type="button"
                                    onClick={() => { setIsResetMode(true); setError(''); setSuccessMsg(''); }}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                                >
                                    שכחת סיסמה?
                                </button>
                            </div>

                            {error && (
                                <div className="text-red-600 text-sm font-medium text-center bg-red-50 p-2 rounded-md">
                                    {error}
                                </div>
                            )}

                            <div>
                                <button
                                    type="submit"
                                    disabled={isLoading || isGoogleLoading}
                                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'התחבר עם אימייל'}
                                </button>
                            </div>
                        </form>
                    )}

                    {!isResetMode && (
                        <div className="mt-6">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-300" />
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-2 bg-white text-slate-500">
                                        או
                                    </span>
                                </div>
                            </div>

                            <div className="mt-6">
                                <button
                                    onClick={handleGoogleLogin}
                                    disabled={isLoading || isGoogleLoading}
                                    type="button"
                                    className="w-full inline-flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isGoogleLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5 ml-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M22.56 12.25C22.56 11.47 22.49 10.72 22.36 10H12V14.26H17.92C17.66 15.63 16.88 16.79 15.72 17.57V20.34H19.29C21.37 18.42 22.56 15.6 22.56 12.25Z" fill="#4285F4" />
                                                <path d="M12 23C14.97 23 17.46 22.02 19.29 20.34L15.72 17.57C14.73 18.23 13.48 18.63 12 18.63C9.13 18.63 6.69 16.69 5.81 14.1H2.12V16.96C3.94 20.57 7.67 23 12 23Z" fill="#34A853" />
                                                <path d="M5.81 14.1C5.58 13.41 5.45 12.69 5.45 11.95C5.45 11.21 5.58 10.49 5.81 9.80001V6.94001H2.12C1.37 8.44001 0.95 10.15 0.95 11.95C0.95 13.75 1.37 15.46 2.12 16.96L5.81 14.1Z" fill="#FBBC05" />
                                                <path d="M12 5.27999C13.62 5.27999 15.07 5.83999 16.21 6.92999L19.38 3.75999C17.45 1.95999 14.97 0.899994 12 0.899994C7.67 0.899994 3.94 3.32999 2.12 6.94001L5.81 9.80001C6.69 7.20001 9.13 5.27999 12 5.27999Z" fill="#EA4335" />
                                            </svg>
                                            <span>התחבר עם גוגל</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {!isResetMode && (
                    <div className="mt-6 text-center">
                        <p className="text-sm text-slate-600">
                            עדיין אין לך חשבון?{' '}
                            <a href="/register" className="font-medium text-blue-600 hover:text-blue-500">
                                הירשם עכשיו
                            </a>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
