import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    Loader2, User, Phone, Building2, CheckCircle2,
    MapPin, BadgeCheck, Camera, Star, ChevronLeft, ChevronRight,
    Target, BarChart4, Mail, Lock
} from 'lucide-react';
import { completeOnboarding, uploadAgencyLogo, updateAgencyGoals } from '../services/agencyService';
import { 
    completeOnboarding as completeAuthOnboarding, 
    captureLeadService, 
    signInWithGooglePopup 
} from '../services/authService';
import { updateUserProfile } from '../services/userService';
import type { AgencySpecialization } from '../types';
import { isValidPhone, normalizePhoneIL } from '../utils/validation';
import LegalConsentStep from '../components/onboarding/LegalConsentStep';

const inputCls = 'appearance-none block w-full px-4 py-3 pr-11 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-slate-50 focus:bg-white text-sm transition-all';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

const SPECIALIZATIONS: { value: AgencySpecialization; label: string; icon: string }[] = [
    { value: 'residential', label: 'מגורים', icon: '🏠' },
    { value: 'commercial', label: 'מסחרי', icon: '🏢' },
    { value: 'luxury', label: 'יוקרה', icon: '💎' },
    { value: 'new_projects', label: 'פרויקטים חדשים', icon: '🏗️' },
];

const STEP_TITLES = ['פרטים אישיים', 'פרטי הסוכנות', 'מיתוג והתמחות', 'הגדרת יעדים', 'חיבור משתמש', 'אישור והסכם'];

export default function Onboarding() {
    const { currentUser, refreshUserData } = useAuth();
    const navigate = useNavigate();
    const logoInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [leadId, setLeadId] = useState<string>(sessionStorage.getItem('homer_onboarding_lead_id') || '');

    // Step 0: Personal
    const [fullName, setFullName] = useState('');
    const [personalPhone, setPersonalPhone] = useState('');
    const [personalEmail, setPersonalEmail] = useState('');

    // Step 1: Agency basics
    const [agencyName, setAgencyName] = useState('');
    const [slogan, setSlogan] = useState('');
    const [officePhone, setOfficePhone] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');

    // Step 2: Branding
    const [mainServiceArea, setMainServiceArea] = useState('');
    const [specialization, setSpecialization] = useState<AgencySpecialization>('residential');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string>('');

    // Step 3: Goals
    const [monthlyAgencyRevenue, setMonthlyAgencyRevenue] = useState<number | ''>('');
    const [monthlyAgencyDeals, setMonthlyAgencyDeals] = useState<number | ''>('');

    useEffect(() => {
        if (currentUser) {
            if (currentUser.displayName && !fullName) setFullName(currentUser.displayName);
            if (currentUser.email && !personalEmail) setPersonalEmail(currentUser.email);
            // If already at Auth step and just logged in, move to Legal
            if (step === 4) setStep(5);
        }
    }, [currentUser, step, fullName, personalEmail]);

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoFile(file);
        const url = URL.createObjectURL(file);
        setLogoPreview(url);
    };

    const canAdvance = () => {
        if (step === 0) return fullName.trim().length > 0 && personalPhone.trim().length >= 9;
        if (step === 1) return agencyName.trim() && officePhone.trim();
        if (step === 4) return !!currentUser;
        return true;
    };

    const handleNext = async () => {
        setError('');
        
        // Step 0 -> Lead Capture
        if (step === 0) {
            if (!isValidPhone(personalPhone)) {
                setError('מספר הטלפון שהוזן אינו תקין');
                return;
            }
            
            setIsLoading(true);
            try {
                const id = await captureLeadService({
                    name: fullName.trim(),
                    email: personalEmail.trim(),
                    phone: normalizePhoneIL(personalPhone)!
                });
                setLeadId(id);
                sessionStorage.setItem('homer_onboarding_lead_id', id);
                setStep(1);
            } catch (err) {
                setError('שגיאה בשמירת הפרטים הראשוניים. אנא נסה שוב.');
            } finally {
                setIsLoading(false);
            }
            return;
        }

        if (step === 1 && !isValidPhone(officePhone)) {
            setError('טלפון המשרד שהוזן אינו תקין');
            return;
        }

        if (step < 5) setStep(s => s + 1);
    };

    const handleBack = () => {
        setError('');
        if (step > 0) setStep(s => s - 1);
    };

    const handleAuthAction = async () => {
        setIsLoading(true);
        setError('');
        try {
            await signInWithGooglePopup();
            // Auth observer will pick it up and useEffect will move to step 5
        } catch (err: any) {
            console.error('Auth error:', err);
            setError('שגיאה בתהליך ההתחברות. אנא נסה שוב.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOnboardingFinalize = async (consentData: { acceptedAt: string; version: string }) => {
        if (!currentUser) return;
        setIsLoading(true);
        setError('');

        try {
            // 1. Create secure account
            const authResult = await completeAuthOnboarding(
                currentUser.uid,
                currentUser.email || '',
                fullName.trim(),
                normalizePhoneIL(personalPhone)!,
                agencyName.trim(),
                consentData,
                leadId || undefined
            );

            if (authResult.agencyId) {
                // 2. Logo Upload
                let logoUrl = '';
                if (logoFile) {
                    try {
                        logoUrl = await uploadAgencyLogo(authResult.agencyId, logoFile);
                    } catch (e) { console.warn('Logo upload failed', e); }
                }

                // 3. Save Profile & Goals
                await completeOnboarding(authResult.agencyId, {
                    agencyName, slogan, officePhone: normalizePhoneIL(officePhone),
                    licenseNumber, mainServiceArea, specialization, logoUrl
                });

                if (monthlyAgencyRevenue || monthlyAgencyDeals) {
                    await updateAgencyGoals(authResult.agencyId, {
                        commissions: Number(monthlyAgencyRevenue) || 100000,
                        deals: Number(monthlyAgencyDeals) || 5,
                    });
                }

                // 4. Final user sync
                await updateUserProfile(currentUser.uid, { name: fullName.trim() });
                await refreshUserData();
                
                // Clear state
                sessionStorage.removeItem('homer_onboarding_lead_id');
                
                // Redirect to pending
                navigate('/pending-approval');
            }
        } catch (err: any) {
            console.error('Finalization error:', err);
            setError(err.message || 'שגיאה בסיום ההרשמה. אנא נסה שוב.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6" dir="rtl">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col min-h-[600px]">

                {/* Header */}
                <div className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-10 py-8 text-center relative flex-shrink-0">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                    <div className="relative z-10">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-3">
                            <Building2 size={26} className="text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-white">הקמת משרד התיווך</h1>
                        <p className="text-blue-100 text-xs mt-1">שלב {step + 1} מתוך 6 — {STEP_TITLES[step]}</p>
                    </div>
                </div>

                {/* Progress Indicators */}
                <div className="px-10 pt-6 pb-2 flex-shrink-0">
                    <div className="flex items-center justify-between gap-1">
                        {STEP_TITLES.map((_, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group cursor-help">
                                <div className={`h-1.5 w-full rounded-full transition-all duration-500 ${i <= step ? 'bg-blue-600 shadow-sm shadow-blue-200' : 'bg-slate-100'}`} />
                                <span className={`text-[9px] font-bold tracking-tight ${i === step ? 'text-blue-600' : 'text-slate-300'}`}>0{i + 1}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Form Content */}
                <div className="flex-1 px-10 py-6 overflow-y-auto">
                    {step === 0 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                             <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl text-[13px] border border-emerald-100 mb-2 font-medium">
                                בוא נתחיל! מלא את הפרטים הבאים כדי להתחיל את תהליך הקמת הסוכנות שלך.
                             </div>
                            <div>
                                <label className={labelCls}>שם מלא *</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none border-l border-slate-200 ml-3">
                                        <User className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="ישראל ישראלי" className={inputCls} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>אימייל (אישי/עסקי) *</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                        <Mail className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="email" required value={personalEmail} onChange={e => setPersonalEmail(e.target.value)} placeholder="name@agency.co.il" className={inputCls} dir="ltr" />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>מספר טלפון נייד *</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                        <Phone className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="tel" required value={personalPhone} onChange={e => setPersonalPhone(e.target.value)} placeholder="050-0000000" className={inputCls} dir="ltr" />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div>
                                <label className={labelCls}>שם משרד התיווך *</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                        <Building2 className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="text" required value={agencyName} onChange={e => setAgencyName(e.target.value)} placeholder='כהן נדל"ן' className={inputCls} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>סלוגן <span className="text-slate-400 font-normal">(אופציונלי)</span></label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                        <Star className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="text" value={slogan} onChange={e => setSlogan(e.target.value)} placeholder="מוצאים לך את הבית המושלם" className={inputCls} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>טלפון משרד *</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                            <Phone className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input type="tel" required value={officePhone} onChange={e => setOfficePhone(e.target.value)} placeholder="03-0000000" className={inputCls} dir="ltr" />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>מספר רישיון <span className="text-slate-400 font-normal">(אופציונלי)</span></label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                            <BadgeCheck className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input type="text" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="IL-12345" className={inputCls} dir="ltr" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div>
                                <label className={labelCls}>לוגו הסוכנות <span className="text-slate-400 font-normal">(אופציונלי)</span></label>
                                <div onClick={() => logoInputRef.current?.click()} className="flex items-center gap-4 p-4 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer transition-all">
                                    {logoPreview ? (
                                        <img src={logoPreview} alt="Logo preview" className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                                            <Camera size={22} className="text-slate-400" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm font-semibold text-slate-700">{logoPreview ? 'לחץ להחלפת הלוגו' : 'העלה לוגו'}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">PNG, JPG עד 2MB</p>
                                    </div>
                                </div>
                                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChange} />
                            </div>
                            <div>
                                <label className={labelCls}>אזור שירות ראשי <span className="text-slate-400 font-normal">(אופציונלי)</span></label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                        <MapPin className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="text" value={mainServiceArea} onChange={e => setMainServiceArea(e.target.value)} placeholder="תל אביב והמרכז" className={inputCls} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>התמחות עיקרית</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {SPECIALIZATIONS.map(s => (
                                        <button key={s.value} type="button" onClick={() => setSpecialization(s.value)} className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-semibold transition-all ${specialization === s.value ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                                            <span className="text-lg">{s.icon}</span>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-[13px] text-slate-600 leading-relaxed italic">
                                יעדים עוזרים לך למדוד התקדמות. תוכל לשנות אותם בכל עת.
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>יעד הכנסות חודשי</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                            <BarChart4 className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input type="number" value={monthlyAgencyRevenue} onChange={e => setMonthlyAgencyRevenue(e.target.value ? Number(e.target.value) : '')} placeholder="₪ 100,000" className={inputCls} dir="ltr" />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>יעד עסקאות חודשי</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                            <Target className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input type="number" value={monthlyAgencyDeals} onChange={e => setMonthlyAgencyDeals(e.target.value ? Number(e.target.value) : '')} placeholder="5" className={inputCls} dir="ltr" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300 py-4">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm">
                                    <Lock size={28} className="text-blue-600" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">אבטחת חשבון</h3>
                                <p className="text-sm text-slate-500 mt-1 max-w-[280px] mx-auto">כעת נחבר את הפרטים שלך לחשבון מאובטח במערכת hOMER.</p>
                            </div>

                            {currentUser ? (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-4">
                                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-sm">
                                        <CheckCircle2 size={24} />
                                    </div>
                                    <div>
                                        <p className="text-emerald-800 font-bold text-sm">מחובר בהצלחה</p>
                                        <p className="text-emerald-600 text-xs truncate max-w-[180px]">{currentUser.email}</p>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleAuthAction}
                                    disabled={isLoading}
                                    className="w-full py-4 rounded-2xl bg-white border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex items-center justify-center gap-3 font-bold text-slate-700 shadow-sm active:scale-[0.98]"
                                >
                                    {isLoading ? <Loader2 className="animate-spin h-5 w-5 text-blue-600" /> : (
                                        <>
                                            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                                            התחברות עם Google
                                        </>
                                    )}
                                </button>
                            )}
                            
                            <div className="flex items-center gap-3 py-2">
                                <div className="h-px bg-slate-100 flex-1" />
                                <span className="text-[10px] uppercase font-bold text-slate-300 tracking-widest">Antigravity - AI Verified</span>
                                <div className="h-px bg-slate-100 flex-1" />
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <LegalConsentStep 
                            isLoading={isLoading} 
                            onConsentComplete={handleOnboardingFinalize} 
                        />
                    )}

                    {/* Error Display */}
                    {error && (
                        <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl flex items-start gap-2 mt-4">
                           <div className="bg-red-200 rounded-full p-0.5 mt-0.5"><div className="w-1.5 h-1.5 bg-red-600 rounded-full" /></div>
                           {error}
                        </div>
                    )}
                </div>

                {/* Footer Navigation (only for steps 0-4) */}
                {step < 5 && (
                    <div className="px-10 py-6 bg-slate-50 border-t border-slate-100 flex gap-3 flex-shrink-0">
                        <button
                            type="button"
                            onClick={handleBack}
                            disabled={step === 0 || isLoading}
                            className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex justify-center items-center gap-2 ${step === 0 ? 'opacity-0 pointer-events-none' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 shadow-sm'}`}
                        >
                            <ChevronLeft size={18} />
                            חזור
                        </button>

                        <button
                            type="button"
                            onClick={handleNext}
                            disabled={!canAdvance() || isLoading}
                            className={`flex-2 py-3.5 rounded-2xl text-sm font-bold transition-all flex justify-center items-center gap-2 shadow-sm ${canAdvance() ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                        >
                            {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (
                                <>
                                    {step === 4 ? 'אישור המשתמש והמשך' : 'המשך לשלב הבא'}
                                    <ChevronRight size={18} />
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
