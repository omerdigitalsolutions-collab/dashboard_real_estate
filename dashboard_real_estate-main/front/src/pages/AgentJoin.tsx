import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { Building2, Mail, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface InviteInfo {
    agencyName: string;
    agentName: string;
    logoUrl?: string;
}

type AuthMode = 'choose' | 'email' | 'loading';

/**
 * /join?token=<token>&email=<optional_email>
 *
 * Public page shown to an invited agent. Supports:
 * 1. Google sign-in (OAuth)
 * 2. Email/password (create or sign in)
 *
 * After successful auth, claims the invite token and redirects to /agent-setup.
 */
export default function AgentJoin() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get('token') ?? '';
    const urlEmail = params.get('email') ?? '';

    const [info, setInfo] = useState<InviteInfo | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [authMode, setAuthMode] = useState<AuthMode>('choose');
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

    // Email/password form fields
    const [emailInput, setEmailInput] = useState(urlEmail);
    const [passwordInput, setPasswordInput] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMsg('קישור ההזמנה לא תקין.');
            return;
        }

        // Check if user is already logged in
        if (auth.currentUser) {
            setCurrentUserEmail(auth.currentUser.email);
        }

        const getInviteInfo = httpsCallable<{ token: string }, { agencyName: string; agentName: string }>(
            functions, 'getInviteInfo'
        );

        getInviteInfo({ token })
            .then(res => {
                setInfo(res.data);
                setStatus('ready');
            })
            .catch(err => {
                setStatus('error');
                if (err.code === 'functions/already-exists') {
                    setErrorMsg('ההזמנה כבר מומשה. התחבר דרך דף ההתחברות.');
                } else {
                    setErrorMsg('קישור ההזמנה לא נמצא או פג תוקפו.');
                }
            });
    }, [token]);

    const claimTokenAndRedirect = async () => {
        try {
            const { claimInviteTokenService } = await import('../services/authService');
            await claimInviteTokenService(token);
            navigate(`/agent-setup?token=${token}`);
        } catch (err: any) {
            setErrorMsg(err?.message || 'שגיאה בתהליך ההצטרפות');
            setAuthMode('choose');
        }
    };

    const handleGoogleSignIn = async () => {
        try {
            setAuthMode('loading');
            if (!auth.currentUser) {
                await signInWithPopup(auth, new GoogleAuthProvider());
            }
            await claimTokenAndRedirect();
        } catch (err: any) {
            setAuthMode('choose');
            if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
                setErrorMsg('שגיאה במהלך ההתחברות. נסה שוב.');
            }
        }
    };

    const handleContinueAsCurrentUser = async () => {
        try {
            setAuthMode('loading');
            await claimTokenAndRedirect();
        } catch (err: any) {
            setAuthMode('choose');
            setErrorMsg(err?.message || 'שגיאה בתהליך ההצטרפות');
        }
    };

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!emailInput.trim() || !passwordInput.trim()) {
            setErrorMsg('אנא מלא את כל השדות');
            return;
        }

        // Basic password strength validation
        if (passwordInput.trim().length < 6) {
            setErrorMsg('הסיסמה חייבת להכיל לפחות 6 תווים');
            return;
        }

        try {
            setAuthMode('loading');
            const trimmedEmail = emailInput.trim().toLowerCase();
            const trimmedPassword = passwordInput.trim();

            // Basic email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(trimmedEmail)) {
                setErrorMsg('כתובת המייל אינה תקינה');
                setAuthMode('email');
                return;
            }

            // Try to sign in; if user doesn't exist, create new account
            try {
                await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
            } catch (signInErr: any) {
                if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
                    // Create new account (auth/user-not-found deprecated in newer Firebase SDK)
                    await createUserWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
                } else if (signInErr.code === 'auth/wrong-password') {
                    setErrorMsg('הסיסמה אינה נכונה');
                    setAuthMode('email');
                    return;
                } else if (signInErr.code === 'auth/invalid-email') {
                    setErrorMsg('כתובת המייל אינה תקינה');
                    setAuthMode('email');
                    return;
                } else {
                    throw signInErr;
                }
            }

            // Successfully authenticated, now claim the token
            await claimTokenAndRedirect();
        } catch (err: any) {
            setAuthMode('email');
            setErrorMsg(err?.message || 'שגיאה. אנא נסה שנית');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6" dir="rtl">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-10 py-10 text-center">
                    {info?.logoUrl ? (
                        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 overflow-hidden border border-white/20 shadow-lg relative p-2">
                            <img src={info.logoUrl} alt="Agency Logo" className="w-full h-full object-contain" />
                        </div>
                    ) : (
                        <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Building2 size={30} className="text-white" />
                        </div>
                    )}
                    <h1 className="text-2xl font-bold text-white">הוזמנת להצטרף!</h1>
                </div>

                <div className="px-10 py-8">
                    {status === 'loading' && (
                        <div className="space-y-3 text-center">
                            <div className="h-5 bg-slate-100 rounded-lg animate-pulse w-3/4 mx-auto" />
                            <div className="h-4 bg-slate-100 rounded-lg animate-pulse w-1/2 mx-auto" />
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="text-center space-y-4">
                            <p className="text-slate-600 text-sm">{errorMsg}</p>
                            <button
                                onClick={() => navigate('/login')}
                                className="text-blue-600 text-sm font-semibold hover:underline"
                            >
                                עבור לדף ההתחברות →
                            </button>
                        </div>
                    )}

                    {status === 'ready' && info && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <p className="text-slate-500 text-sm">שלום,</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{info.agentName}</p>
                                <p className="text-slate-500 text-sm mt-2">
                                    הוזמנת להצטרף לסוכנות{' '}
                                    <span className="font-semibold text-slate-700">{info.agencyName}</span>
                                </p>
                            </div>

                            {/* Already logged in — show quick continue button */}
                            {currentUserEmail && authMode === 'choose' && (
                                <div className="space-y-4">
                                    <button
                                        onClick={handleContinueAsCurrentUser}
                                        className="w-full flex items-center justify-center gap-3 bg-emerald-50 border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100 text-emerald-700 font-semibold py-3.5 rounded-2xl transition-all"
                                    >
                                        ✓ להמשיך כ- {currentUserEmail}
                                    </button>
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-slate-300" />
                                        </div>
                                        <div className="relative flex justify-center bg-white">
                                            <span className="px-2 text-xs text-slate-500">או</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Choose auth method */}
                            {authMode === 'choose' && (
                                <div className="space-y-3">
                                    {errorMsg && (
                                        <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                                            {errorMsg}
                                        </div>
                                    )}
                                    <button
                                        onClick={handleGoogleSignIn}
                                        className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 font-semibold py-3.5 rounded-2xl transition-all"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-5 h-5">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        התחבר עם Google
                                    </button>

                                    <button
                                        onClick={() => setAuthMode('email')}
                                        className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-slate-700 font-semibold py-3.5 rounded-2xl transition-all"
                                    >
                                        <Mail className="w-5 h-5" />
                                        התחבר עם אימייל וסיסמה
                                    </button>
                                </div>
                            )}

                            {/* Email/password form */}
                            {authMode === 'email' && (
                                <form onSubmit={handleEmailSignIn} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-2">כתובת אימייל</label>
                                        <div className="relative">
                                            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input
                                                type="email"
                                                value={emailInput}
                                                onChange={e => setEmailInput(e.target.value)}
                                                placeholder="your@email.com"
                                                className="w-full border border-slate-200 rounded-lg px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                                dir="ltr"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-2">סיסמה</label>
                                        <div className="relative">
                                            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={passwordInput}
                                                onChange={e => setPasswordInput(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full border border-slate-200 rounded-lg px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                                dir="ltr"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700"
                                            >
                                                {showPassword ? 'הסתר' : 'הצג'}
                                            </button>
                                        </div>
                                    </div>

                                    {errorMsg && (
                                        <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                                            {errorMsg}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        className="w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                                    >
                                        הצטרף עכשיו
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAuthMode('choose');
                                            setErrorMsg('');
                                        }}
                                        className="w-full text-xs text-slate-500 hover:text-slate-700 transition-colors"
                                    >
                                        ← חזור בחזרה
                                    </button>
                                </form>
                            )}

                            {/* Loading state */}
                            {authMode === 'loading' && (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                                </div>
                            )}

                            {authMode === 'choose' && (
                                <p className="text-xs text-center text-slate-400">
                                    עם ההתחברות אתה מאשר את המדיניות ותנאי השימוש של הסוכנות.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
