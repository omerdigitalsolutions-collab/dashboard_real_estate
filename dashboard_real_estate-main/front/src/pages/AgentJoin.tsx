import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../config/firebase';
import { Building2 } from 'lucide-react';

interface InviteInfo {
    agencyName: string;
    agentName: string;
}

/**
 * /join?token=<stubId>
 *
 * Public page shown to an invited agent before they log in.
 * Fetches the invite details (agency name, agent name) via Cloud Function,
 * then lets the agent sign in with Google to complete the flow.
 */
export default function AgentJoin() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get('token') ?? '';

    const [info, setInfo] = useState<InviteInfo | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'signing-in'>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setErrorMsg('קישור ההזמנה לא תקין.');
            return;
        }

        const getInviteInfo = httpsCallable<{ token: string }, { agencyName: string; agentName: string }>(
            functions, 'users-getInviteInfo'
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

    const handleGoogleSignIn = async () => {
        try {
            setStatus('signing-in');
            await signInWithPopup(auth, new GoogleAuthProvider());
            // AuthContext will detect the stub + redirect to /agent-setup automatically
        } catch {
            setStatus('ready');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6" dir="rtl">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header gradient */}
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-10 py-10 text-center">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Building2 size={30} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">הוזמנת להצטרף!</h1>
                </div>

                <div className="px-10 py-8 text-center">
                    {status === 'loading' && (
                        <div className="space-y-3">
                            <div className="h-5 bg-slate-100 rounded-lg animate-pulse w-3/4 mx-auto" />
                            <div className="h-4 bg-slate-100 rounded-lg animate-pulse w-1/2 mx-auto" />
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="space-y-4">
                            <p className="text-slate-600 text-sm">{errorMsg}</p>
                            <button
                                onClick={() => navigate('/login')}
                                className="text-blue-600 text-sm font-semibold hover:underline"
                            >
                                עבור לדף ההתחברות →
                            </button>
                        </div>
                    )}

                    {(status === 'ready' || status === 'signing-in') && info && (
                        <div className="space-y-6">
                            <div>
                                <p className="text-slate-500 text-sm">שלום,</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{info.agentName}</p>
                                <p className="text-slate-500 text-sm mt-2">
                                    הוזמנת להצטרף לסוכנות{' '}
                                    <span className="font-semibold text-slate-700">{info.agencyName}</span>
                                </p>
                            </div>

                            <button
                                onClick={handleGoogleSignIn}
                                disabled={status === 'signing-in'}
                                className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 font-semibold py-3.5 rounded-2xl transition-all disabled:opacity-60"
                            >
                                <svg viewBox="0 0 24 24" className="w-5 h-5">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                {status === 'signing-in' ? 'מתחבר...' : 'התחבר עם Google להצטרפות'}
                            </button>

                            <p className="text-xs text-slate-400">
                                עם ההתחברות אתה מאשר את המדיניות ותנאי השימוש של הסוכנות.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
