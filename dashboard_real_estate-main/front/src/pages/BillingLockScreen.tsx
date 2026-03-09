import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useSubscriptionGuard } from '../hooks/useSubscriptionGuard';
import { useAuth } from '../context/AuthContext';
import { Clock, Zap, CheckCircle2, LogOut } from 'lucide-react';
import SubscriptionRequestModal from '../components/billing/SubscriptionRequestModal';

const PLAN_FEATURES = [
    'ניהול לידים וסוכנים ללא הגבלה',
    'מאגר נכסים דיגיטלי + קטלוגים',
    'בוט AI לוואטסאפ + CRM חכם',
    'דוחות רווח והפסד אוטומטיים',
    'אינטגרציות בנקאיות + Stripe',
];

export default function BillingLockScreen() {
    const navigate = useNavigate();
    const { trialEndsAt, billingStatus } = useSubscriptionGuard();
    const { userData } = useAuth();

    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login', { replace: true });
    };

    const endedOn = trialEndsAt
        ? trialEndsAt.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#020b18] px-4 overflow-y-auto py-12"
            dir="rtl"
        >
            {/* Background glow */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00e5ff]/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-rose-900/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <div className="w-full max-w-lg relative z-10 space-y-6">

                {/* Header card */}
                <div className="bg-[#0a192f]/80 backdrop-blur-xl border border-rose-500/30 shadow-[0_0_40px_rgba(244,63,94,0.07)] rounded-3xl p-8 text-center space-y-4">
                    <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center border-2 border-amber-500/30 mx-auto">
                        <Clock className="w-10 h-10 text-amber-400" />
                    </div>

                    <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">
                        תקופת הניסיון שלך הסתיימה ⏳
                    </h1>

                    {endedOn && (
                        <p className="text-slate-500 text-sm">
                            תוקף הניסיון פג ב-<span className="text-amber-400 font-semibold">{endedOn}</span>
                        </p>
                    )}
                    {billingStatus === 'past_due' && !endedOn && (
                        <p className="text-rose-400 text-sm font-medium">
                            תשלום חסר — הגישה הוקפאה זמנית
                        </p>
                    )}

                    <p className="text-slate-400 leading-relaxed text-sm md:text-base">
                        מקווים שנהנית מהיכולות של hOMER! כדי להמשיך לייצר עסקאות ולשמור על הנתונים של המשרד, יש לבחור מסלול מנוי.
                    </p>
                </div>

                {/* Pricing card */}
                <div className="bg-[#0a192f]/80 backdrop-blur-xl border border-[#00e5ff]/30 shadow-[0_0_30px_rgba(0,229,255,0.08)] rounded-3xl p-8 space-y-6 relative overflow-hidden">
                    {/* Glow */}
                    <div className="absolute top-0 right-0 w-40 h-40 bg-[#00e5ff]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-xl font-black text-white flex items-center gap-2">
                                <Zap className="w-5 h-5 text-[#00e5ff]" />
                                Pro Plan
                            </h2>
                            <div className="text-right">
                                <span className="text-3xl font-black text-[#00e5ff]">₪349</span>
                                <span className="text-slate-400 text-sm">/חודש</span>
                            </div>
                        </div>
                        <p className="text-slate-500 text-sm mb-6">כל הכלים שצריך לניהול משרד תיווך מנצח</p>

                        <ul className="space-y-3 mb-8">
                            {PLAN_FEATURES.map((f) => (
                                <li key={f} className="flex items-center gap-3 text-slate-300 text-sm">
                                    <CheckCircle2 className="w-4 h-4 text-[#00e5ff] shrink-0" />
                                    {f}
                                </li>
                            ))}
                        </ul>

                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="block w-full text-center bg-[#00e5ff] hover:bg-[#00cce6] text-[#020b18] font-black py-4 rounded-xl transition-all shadow-[0_0_25px_rgba(0,229,255,0.4)] hover:shadow-[0_0_35px_rgba(0,229,255,0.6)] text-base"
                        >
                            שדרג עכשיו והחזר גישה 🚀
                        </button>
                    </div>
                </div>

                {/* Logout */}
                <div className="text-center">
                    <button
                        onClick={handleLogout}
                        className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors py-2"
                    >
                        <LogOut className="w-4 h-4" />
                        יציאה מהמערכת
                    </button>
                </div>
            </div>

            <SubscriptionRequestModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                planName="pro"
                userData={userData}
            />
        </div>
    );
}
