import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Mail, ArrowRight, Building2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { joinWithCode } from '../services/authService';
import toast from 'react-hot-toast';

/**
 * JoinByCode — Public page for agents to join an agency via a passcode.
 * /join-agency
 */
export default function JoinByCode() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !code.trim()) return;

        setStatus('loading');
        setErrorMsg('');

        try {
            const inviteToken = await joinWithCode(email.trim(), code.trim().toUpperCase());
            setStatus('success');
            toast.success('הקוד אומת בהצלחה! מעביר אותך להמשך הרישום...');
            
            // Redirect to the established join flow
            setTimeout(() => {
                navigate(`/join?token=${inviteToken}`);
            }, 2000);
        } catch (err: any) {
            console.error(err);
            setStatus('idle');
            let msg = 'שגיאה באימות הקוד. וודא שהקוד והמייל תקינים.';
            const code = err?.code || '';
            if (code === 'functions/not-found') {
                msg = 'קוד ההצטרפות לא תקין. בדוק שהקוד נכון ונסה שוב.';
            } else if (code === 'functions/already-exists') {
                msg = 'המשתמש הזה כבר רשום במערכת. פנה למנהל המשרד או התחבר ישירות.';
            } else if (code === 'functions/resource-exhausted') {
                msg = 'יותר מדי ניסיונות כושלים. המתן 10 דקות ונסה שוב.';
            } else if (code === 'functions/failed-precondition') {
                msg = 'הסוכנות אינה פעילה. פנה למנהל המשרד לסיוע.';
            } else if (err.message) {
                msg = err.message;
            }
            setErrorMsg(msg);
            toast.error(msg);
        }
    };

    return (
        <div className="min-h-screen bg-[#020b18] flex items-center justify-center p-6 relative overflow-hidden" dir="rtl">
            {/* Background Aesthetics */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in duration-500">
                <div className="text-center mb-10">
                    <img src="/homer-logo.png" alt="hOMER CRM" className="h-14 mx-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
                </div>

                <div className="bg-[#0a192f]/60 backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-2xl overflow-hidden p-8 sm:p-10">
                    {status === 'success' ? (
                        <div className="py-8 text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/40">
                                <CheckCircle2 className="text-emerald-400 w-10 h-10" />
                            </div>
                            <h2 className="text-2xl font-black text-white">הקוד אומת!</h2>
                            <p className="text-slate-400">אנחנו מעבירים אותך לדף ההצטרפות הרשמי של הסוכנות...</p>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                                    <KeyRound className="text-blue-400 w-8 h-8" />
                                </div>
                                <h1 className="text-2xl font-black text-white mb-2">צטרפות לסוכנות</h1>
                                <p className="text-slate-400 text-sm">הזן את המייל שלך ואת קוד ההצטרפות שקיבלת ממנהל המשרד</p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-400 mr-1">כתובת אימייל</label>
                                    <div className="relative group">
                                        <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="your@email.com"
                                            className="w-full bg-slate-900/50 border border-slate-700/50 text-white rounded-2xl py-4 pr-12 pl-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all placeholder-slate-600 font-medium"
                                            dir="ltr"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-400 mr-1">קוד הצטרפות</label>
                                    <div className="relative group">
                                        <ShieldCheck className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                        <input
                                            type="text"
                                            required
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            placeholder="למשל: AGENCY-XJ921"
                                            className="w-full bg-slate-900/50 border border-slate-700/50 text-white rounded-2xl py-4 pr-12 pl-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all placeholder-slate-600 font-bold uppercase tracking-wider"
                                            dir="ltr"
                                        />
                                    </div>
                                </div>

                                {errorMsg && (
                                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-rose-400 text-sm font-medium animate-in shake-2 duration-300">
                                        {errorMsg}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={status === 'loading'}
                                    className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 group disabled:opacity-50"
                                >
                                    {status === 'loading' ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <>
                                            הצטרף עכשיו
                                            <ArrowRight className="w-5 h-5 group-hover:translate-x-[-4px] transition-transform" />
                                        </>
                                    )}
                                </button>
                            </form>

                            <div className="mt-8 pt-8 border-t border-white/5 text-center">
                                <button
                                    onClick={() => navigate('/login')}
                                    className="text-slate-500 hover:text-white text-sm font-medium transition-colors"
                                >
                                    חזרה לדף ההתחברות
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-10 flex items-center justify-center gap-6 opacity-30">
                    <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-white" />
                        <span className="text-[10px] text-white font-bold tracking-widest uppercase">Certified Agency Tool</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
