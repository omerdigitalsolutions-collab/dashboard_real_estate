import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { RecaptchaVerifier, linkWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Loader2, Phone, XCircle, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { isValidPhone, normalizePhoneIL } from '../utils/validation';
import { checkPhoneAvailableService, completeOnboarding as completeAuthOnboarding, forceRefreshToken } from '../services/authService';
import { completeOnboarding, updateAgencyGoals } from '../services/agencyService';
import { updateUserProfile } from '../services/userService';

export default function VerifyPhonePage() {
    const { currentUser, requireOnboarding, refreshUserData } = useAuth();
    const location = useLocation() as { state?: { phone?: string; fromOnboarding?: boolean } };
    const [params] = useSearchParams();
    const navigate = useNavigate();
    
    const token = params.get('token');

    const [phone, setPhone] = useState(location.state?.phone || '');
    const [step, setStep] = useState<'input' | 'send' | 'verify'>('input');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

    const recaptchaContainerId = 'recaptcha-verify-phone';

    // If they already have a phone number, send them to onboarding immediately
    useEffect(() => {
        if (currentUser?.phoneNumber && requireOnboarding) {
            navigate('/onboarding', { replace: true });
        }
    }, [currentUser, requireOnboarding, navigate]);

    // Handle Phone Submit
    const handlePhoneSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isValidPhone(phone)) {
            setError('מספר הטלפון שהוזן אינו תקין');
            return;
        }

        const normalized = normalizePhoneIL(phone);
        if (!normalized) {
            setError('פורמט המספר אינו נתמך');
            return;
        }

        setIsLoading(true);

        try {
            // First check if phone is available in the DB
            const isAvail = await checkPhoneAvailableService(normalized);
            if (!isAvail) {
                setError('מספר הטלפון הזה כבר מקושר לסוכנות במערכת.');
                setIsLoading(false);
                return;
            }

            // Proceed to send SMS
            setStep('send');
            await sendSms(normalized);
        } catch (err: any) {
            console.error('Phone check error:', err);
            setError('שגיאה בבדיקת מספר הטלפון.');
            setIsLoading(false);
        }
    };

    const sendSms = async (targetPhone: string) => {
        if (!auth.currentUser) return;
        setIsLoading(true);
        setError('');

        try {
            if (!(window as any).recaptchaVerifier) {
                (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
                    size: 'invisible'
                });
            }

            const result = await linkWithPhoneNumber(auth.currentUser, targetPhone, (window as any).recaptchaVerifier);
            setConfirmationResult(result);
            setStep('verify');
        } catch (err: any) {
            console.error('Error sending SMS:', err);
            if (err.code === 'auth/invalid-phone-number') {
                setError('מספר הטלפון לא תקין או שהקידומת שגויה.');
            } else if (err.code === 'auth/credential-already-in-use') {
                setError('מספר הטלפון הזה כבר מקושר לחשבון אחר במערכת פיירבייס.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('יותר מדי ניסיונות. אנא נסה שוב מאוחר יותר.');
            } else {
                setError('שגיאה בשליחת קוד אימות. ודא שהאבטחה מוגדרת כראוי בהגדרות מערכת.');
            }
            // Go back to input to let them fix it if it failed
            setStep('input');
        } finally {
            setIsLoading(false);
        }
    };

    const verifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirmationResult || code.length !== 6) return;

        setIsLoading(true);
        setError('');

        try {
            await confirmationResult.confirm(code);
            // Ensure the local token is refreshed to pick up the confirmed phone
            if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
            }

            // --- Agent Flow (if token exists) ---
            if (token) {
                // If we have a token, it means an agent is joining via code/invite
                // We just linked their phone to Firebase Auth. Now we send them to setup.
                navigate(`/agent-setup?token=${token}`, { replace: true });
                return;
            }

            // --- New Onboarding Finalization Logic (Admins) ---
            const rawData = sessionStorage.getItem('onboarding_pending_data');
            if (rawData) {
                const data = JSON.parse(rawData);
                try {
                    // 1. Create the agency via Cloud Function
                    const result = await completeAuthOnboarding(
                        auth.currentUser?.uid || '',
                        auth.currentUser?.email || '',
                        data.fullName,
                        normalizePhoneIL(phone)!,
                        data.agencyName
                    );

                    const newAgencyId = result.agencyId;

                    // 2. Refresh token to get agencyId claim
                    await forceRefreshToken();
                    await refreshUserData();

                    // 3. Save extended profile
                    await completeOnboarding(newAgencyId, {
                        agencyName: data.agencyName,
                        slogan: data.slogan,
                        officePhone: data.officePhone,
                        licenseNumber: data.licenseNumber,
                        mainServiceArea: data.mainServiceArea,
                        specialization: data.specialization
                    });

                    // 4. Save goals
                    if (data.goals.agency.revenue || data.goals.agency.deals) {
                        await updateAgencyGoals(newAgencyId, {
                            commissions: data.goals.agency.revenue,
                            deals: data.goals.agency.deals,
                            leads: 0
                        });
                    }

                    if (data.goals.personal.revenue || data.goals.personal.deals) {
                        await updateUserProfile(auth.currentUser?.uid || '', {
                            goals: {
                                monthly: {
                                    revenue: data.goals.personal.revenue,
                                    deals: data.goals.personal.deals
                                },
                                yearly: { revenue: 0, deals: 0 }
                            }
                        });
                    }

                    // Success!
                    sessionStorage.removeItem('onboarding_pending_data');
                    navigate('/pending-approval', { replace: true });
                    return;
                } catch (onboardingErr) {
                    console.error('Finalization error:', onboardingErr);
                    setError('אימות הטלפון הצליח, אך אירעה שגיאה בשמירת פרטי הסוכנות. אנא פנה לתמיכה.');
                    setIsLoading(false);
                    return;
                }
            }

            // Fallback for legacy flows
            navigate('/onboarding', { replace: true });
        } catch (err: any) {
            console.error('Error verifying code:', err);
            if (err.code === 'auth/invalid-verification-code') {
                setError('הקוד שהוזן שגוי.');
            } else if (err.code === 'auth/code-expired') {
                setError('הקוד פג תוקף, אנא בקש קוד חדש.');
            } else {
                setError('שגיאה באימות הקוד.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#020b18] px-4 relative overflow-hidden" dir="rtl">
            {/* Background Orbs */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00e5ff]/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-700/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-6">
                    <img src="/homer-logo.png" alt="hOMER CRM" className="h-14 mx-auto drop-shadow-lg" />
                </div>

                <div className="w-full bg-[#0a192f]/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl p-8">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-[#00e5ff]/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#00e5ff]/30 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                            <ShieldCheck className="w-8 h-8 text-[#00e5ff]" />
                        </div>
                        <h2 className="text-2xl font-black text-white mb-2">אימות מספר נייד</h2>
                        <p className="text-slate-400 text-sm">
                            {token 
                                ? 'לפני שנמשיך, עלינו לאמת את מספר הטלפון שלך לאבטחה מירבית.'
                                : 'לפני שנתחיל להקים את המשרד שלך, עלינו לאמת את מספר הטלפון הראשי של הסוכנות לאבטחה מירבית.'
                            }
                        </p>
                    </div>

                    {error && (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-start gap-3 mb-6">
                            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                            <p className="text-rose-400 text-sm font-medium leading-relaxed">{error}</p>
                        </div>
                    )}

                    <div id={recaptchaContainerId} className="flex justify-center mb-4"></div>

                    {step === 'input' && (
                        <form onSubmit={handlePhoneSubmit} className="space-y-6">
                            <div>
                                <label htmlFor="phone" className="block text-slate-300 font-medium mb-2 text-sm">מספר טלפון נייד</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                        <Phone className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        id="phone"
                                        type="tel"
                                        required
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-slate-700/80 text-white rounded-xl py-3.5 pr-12 pl-4 focus:outline-none focus:ring-2 focus:ring-[#00e5ff]/50 focus:border-[#00e5ff] transition-all placeholder-slate-500"
                                        placeholder="050-0000000"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || phone.length < 9}
                                className="w-full bg-[#00e5ff] hover:bg-[#00cce6] text-[#020b18] font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.35)] hover:shadow-[0_0_30px_rgba(0,229,255,0.55)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                    <>המשך לחשבון <ArrowRight className="w-5 h-5" /></>
                                )}
                            </button>
                        </form>
                    )}

                    {step === 'send' && (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <Loader2 size={36} className="animate-spin text-[#00e5ff] mb-4" />
                            <p className="text-white font-medium mb-1">שולח קוד אימות...</p>
                            <p className="text-slate-400 text-sm">למספר {phone}</p>
                        </div>
                    )}

                    {step === 'verify' && (
                        <form onSubmit={verifyCode} className="space-y-6">
                            <div>
                                <label className="block text-slate-300 font-medium mb-2 text-sm text-center">
                                    הזן את 6 הספרות שקיבלת לנייד:
                                </label>
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                                    className="w-full text-center text-3xl tracking-[0.7em] font-black p-4 bg-slate-900/50 border-2 border-slate-700/80 rounded-xl focus:border-[#00e5ff] focus:ring-0 text-white transition-colors"
                                    placeholder="------"
                                    dir="ltr"
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || code.length !== 6}
                                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-[#020b18] font-black rounded-xl transition-all disabled:opacity-50 flex justify-center items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                            >
                                {isLoading ? <Loader2 size={22} className="animate-spin" /> : <CheckCircle2 size={22} />}
                                אימות וסיום רשמה
                            </button>

                            <div className="text-center mt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep('input')}
                                    disabled={isLoading}
                                    className="text-sm text-slate-400 hover:text-white font-medium transition-colors disabled:opacity-50"
                                >
                                    טעות במספר? חזור אחורה
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
