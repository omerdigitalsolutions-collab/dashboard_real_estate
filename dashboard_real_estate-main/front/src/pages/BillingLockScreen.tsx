import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useSubscriptionGuard } from '../hooks/useSubscriptionGuard';
import { useAuth } from '../context/AuthContext';
import { Clock, CheckCircle2, LogOut } from 'lucide-react';
import SubscriptionRequestModal from '../components/billing/SubscriptionRequestModal';

const PLANS = [
    {
        id: 'basic',
        name: 'בסיסי',
        price: 279,
        description: 'לעשות סדר בבלגן',
        features: ['ניהול לידים ויומן', 'דירות על המפה', 'התאמה אוטומטית בין ליד לדירה'],
        color: 'blue'
    },
    {
        id: 'advanced',
        name: 'מתקדם',
        price: 349,
        description: 'למשרדים שרוצים לגדול',
        features: ['כל הפיצ׳רים של המסלול הבסיסי', 'הודעות תפוצה בווטסאפ', 'סינון לידים מתקדם'],
        popular: true,
        badge: 'וואטסאפ וקטלוג נכסים',
        color: 'cyan'
    },
    {
        id: 'premium',
        name: 'פרימיום',
        price: 499,
        description: 'שליטה מוחלטת ב-AI',
        features: ['כל הפיצ׳רים של המסלול המתקדם', 'בוט WhatsApp AI וסינון לידים', 'סריקת B2B קבוצות ווטסאפ'],
        badge: 'בוט AI שיהפוך את המשרד שלך למכונת לידים',
        color: 'indigo'
    }
];

export default function BillingLockScreen() {
    const navigate = useNavigate();
    const { trialEndsAt, billingStatus } = useSubscriptionGuard();
    const { userData } = useAuth();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<'basic' | 'advanced' | 'premium'>('advanced');
    const [billingInterval, setBillingInterval] = useState<'monthly' | '6m' | '1year'>('monthly');

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login', { replace: true });
    };

    const handlePlanSelect = (planId: 'basic' | 'advanced' | 'premium') => {
        setSelectedPlan(planId);
        setIsModalOpen(true);
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

            <div className="w-full max-w-4xl relative z-10 space-y-8">

                {/* Header card */}
                <div className="bg-[#0a192f]/60 backdrop-blur-xl border border-rose-500/20 rounded-3xl p-8 text-center space-y-4 max-w-2xl mx-auto shadow-2xl shadow-rose-900/5">
                    <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center border-2 border-rose-500/20 mx-auto">
                        <Clock className="w-8 h-8 text-rose-400 animate-pulse" />
                    </div>

                    <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">
                        תקופת הניסיון שלך הסתיימה ⏳
                    </h1>

                    {endedOn && (
                        <p className="text-slate-400 text-sm">
                            תוקף הניסיון פג ב-<span className="text-rose-400 font-black">{endedOn}</span>
                        </p>
                    )}
                    {billingStatus === 'past_due' && (
                        <p className="text-rose-400 text-sm font-bold bg-rose-500/10 px-4 py-1.5 rounded-full inline-block">
                            תשלום חסר — הגישה הוקפאה זמנית
                        </p>
                    )}

                    <p className="text-slate-400 leading-relaxed text-sm md:text-base">
                        כדי להמשיך לייצר עסקאות ולשמור על הנתונים של המשרד, יש לבחור מסלול מנוי.
                    </p>

                    {/* Billing Interval Toggle (Matching Landing Page) */}
                    <div className="flex items-center justify-center p-1 bg-white/5 rounded-full w-fit mx-auto mt-8 border border-white/5 shadow-2xl backdrop-blur-md">
                        <button
                            onClick={() => setBillingInterval('monthly')}
                            className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${billingInterval === 'monthly' ? 'bg-white/10 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            חודשי
                        </button>
                        <button
                            onClick={() => setBillingInterval('6m')}
                            className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${billingInterval === '6m' ? 'bg-white/10 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            6 חודשים <span className={`${billingInterval === '6m' ? 'text-blue-400' : 'text-blue-500/50'} ml-0.5`}>· 5% הנחה</span>
                        </button>
                        <button
                            onClick={() => setBillingInterval('1year')}
                            className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${billingInterval === '1year' ? 'bg-white/10 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            שנתי <span className={`${billingInterval === '1year' ? 'text-blue-400' : 'text-blue-500/50'} ml-0.5`}>· 12.5% הנחה</span>
                        </button>
                    </div>
                </div>

                {/* Pricing Grid */}
                <div className="grid md:grid-cols-3 gap-6">
                    {PLANS.map((plan) => (
                        <div
                            key={plan.id}
                            className={`bg-[#0a192f]/80 backdrop-blur-xl border ${plan.popular ? 'border-[#00e5ff]/50 shadow-[0_0_40px_rgba(0,229,255,0.1)]' : 'border-slate-800'} rounded-3xl p-6 flex flex-col relative group transition-all hover:scale-[1.02]`}
                        >
                            {(plan as any).badge && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00e5ff] text-[#020b18] text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap shadow-lg z-20 text-center min-w-[120px]">
                                    {(plan as any).badge}
                                </div>
                            )}

                            {/* Price Calculation based on interval */}
                            {(() => {
                                const discount = billingInterval === '6m' ? 0.95 : (billingInterval === '1year' ? 0.875 : 1);
                                const finalPrice = Math.floor(plan.price * discount);
                                
                                return (
                                    <div className="mb-6">
                                        <h3 className="text-xl font-black text-white mb-1">{plan.name}</h3>
                                        <p className="text-slate-500 text-xs font-medium">{plan.description}</p>
                                        <div className="mt-4 flex flex-col">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-black text-white">₪{finalPrice}</span>
                                                <span className="text-slate-500 text-xs">/חודש</span>
                                            </div>
                                            {billingInterval !== 'monthly' && (
                                                <span className="text-[10px] text-blue-400 font-bold mt-1">
                                                    תשלום {billingInterval === '6m' ? 'חצי-שנתי' : 'שנתי'} מראש
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            <ul className="space-y-3 mb-8 flex-1">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-start gap-2 text-slate-300 text-xs font-medium">
                                        <CheckCircle2 className={`w-4 h-4 shrink-0 transition-colors ${plan.popular ? 'text-[#00e5ff]' : 'text-blue-400'}`} />
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>

                            <button
                                onClick={() => handlePlanSelect(plan.id as any)}
                                className={`w-full py-3.5 rounded-xl font-black text-sm transition-all ${plan.popular ? 'bg-[#00e5ff] text-[#020b18] shadow-[0_0_20px_rgba(0,229,255,0.3)]' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                            >
                                בחר {plan.name}
                            </button>
                        </div>
                    ))}
                </div>

                {/* Global Limit Disclaimer - Simple Version */}
                <div className="max-w-xl mx-auto text-center px-4">
                    <p className="text-slate-500 text-xs font-medium leading-relaxed">
                        <span className="block font-black text-slate-400 mb-1"></span>
                        כל מסלול דורש בנוסף עלות אפיון והקמה חד פעמית במחיר של התשלום החודשי של המערכת. המחירים הם עבור משתמש אדמין + 5 משתמשים נוספים. כל משתמש נוסף כרוך בתוספת של ₪39 שקלים נוספים.*
                    </p>
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
                planName={selectedPlan}
                userData={userData}
            />
        </div>
    );
}
