import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../config/firebase';
import {
    Loader2, User, Phone, Building2, CheckCircle2,
    MapPin, BadgeCheck, Camera, Star, Briefcase, ChevronLeft, ChevronRight,
    Target, BarChart4
} from 'lucide-react';
import { completeOnboarding, uploadAgencyLogo, updateAgencyGoals } from '../services/agencyService';
import { updateUserProfile } from '../services/userService';
import { checkPhoneAvailableService, completeOnboarding as completeAuthOnboarding } from '../services/authService';
import type { AgencySpecialization } from '../types';
import { isValidPhone, normalizePhoneIL } from '../utils/validation';
import VerifyPhoneModal from '../components/auth/VerifyPhoneModal';

const inputCls = 'appearance-none block w-full px-4 py-3 pr-11 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-slate-50 focus:bg-white text-sm transition-all';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

const SPECIALIZATIONS: { value: AgencySpecialization; label: string; icon: string }[] = [
    { value: 'residential', label: 'מגורים', icon: '🏠' },
    { value: 'commercial', label: 'מסחרי', icon: '🏢' },
    { value: 'luxury', label: 'יוקרה', icon: '💎' },
    { value: 'new_projects', label: 'פרויקטים חדשים', icon: '🏗️' },
];

const STEP_TITLES = ['פרטים אישיים', 'פרטי הסוכנות', 'מיתוג והתמחות', 'הגדרת יעדים (רשות)'];

export default function Onboarding() {
    const { currentUser, userData, refreshUserData } = useAuth();
    const navigate = useNavigate();
    const logoInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // SMS Verification State
    const [showSmsModal, setShowSmsModal] = useState(false);
    const [normalizedPhone, setNormalizedPhone] = useState('');

    // Step 1: Personal
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');

    // Step 2: Agency basics
    const [agencyName, setAgencyName] = useState('');
    const [slogan, setSlogan] = useState('');
    const [officePhone, setOfficePhone] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');

    // Step 3: Branding
    const [mainServiceArea, setMainServiceArea] = useState('');
    const [specialization, setSpecialization] = useState<AgencySpecialization>('residential');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string>('');

    // Step 4: Goals
    const [monthlyAgencyRevenue, setMonthlyAgencyRevenue] = useState<number | ''>('');
    const [monthlyAgencyDeals, setMonthlyAgencyDeals] = useState<number | ''>('');
    const [monthlyPersonalRevenue, setMonthlyPersonalRevenue] = useState<number | ''>('');
    const [monthlyPersonalDeals, setMonthlyPersonalDeals] = useState<number | ''>('');

    useEffect(() => {
        if (currentUser?.displayName) setFullName(currentUser.displayName);
    }, [currentUser]);

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoFile(file);
        const url = URL.createObjectURL(file);
        setLogoPreview(url);
    };

    const canAdvance = () => {
        if (step === 0) return fullName.trim() && phone.trim();
        if (step === 1) return agencyName.trim() && officePhone.trim();
        return true;
    };

    const handleNext = () => {
        setError('');
        if (step === 0 && !isValidPhone(phone)) {
            setError('מספר הטלפון שהוזן אינו תקין');
            return;
        }
        if (step === 1 && !isValidPhone(officePhone)) {
            setError('טלפון המשרד שהוזן אינו תקין');
            return;
        }
        if (step < 3) setStep(s => s + 1);
    };

    const handleBack = () => {
        setError('');
        if (step > 0) setStep(s => s - 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!currentUser) return;

        if (!isValidPhone(phone)) {
            setError('מספר הטלפון (פרטים אישיים) אינו תקין');
            setStep(0);
            return;
        }

        if (!isValidPhone(officePhone)) {
            setError('טלפון המשרד שהוזן אינו תקין');
            setStep(1);
            return;
        }

        const normalized = normalizePhoneIL(phone);
        if (!normalized) {
            setError('שגיאה בנרמול מספר הטלפון (פרטים אישיים)');
            setStep(0);
            return;
        }

        setIsLoading(true);

        try {
            // First check phone availability
            const isAvail = await checkPhoneAvailableService(normalized);
            if (!isAvail) {
                setError('מספר הטלפון הזה כבר מוגדר לסוכנות קיימת. אנא השתמש במספר אחר.');
                setStep(0);
                setIsLoading(false);
                return;
            }

            // All valid - trigger SMS modal 
            setNormalizedPhone(normalized);
            setShowSmsModal(true);
            setIsLoading(false);

        } catch (err: any) {
            console.error('Phone check error:', err);
            setError('שגיאה בבדיקת מספר הטלפון. אנא נסה שוב.');
            setIsLoading(false);
        }
    };

    const handleSmsVerified = async () => {
        setShowSmsModal(false);
        setIsLoading(true);
        setError('');

        let newAgencyId = '';
        try {
            // Step 1: Create the agency via Cloud Function
            if (!currentUser) throw new Error("No user found");

            const result = await completeAuthOnboarding(
                currentUser.uid,
                currentUser.email || '',
                fullName.trim(),
                normalizedPhone,
                agencyName.trim()
            );

            newAgencyId = result.agencyId;

            // Force token refresh so custom claims (agencyId, role) are immediately
            // present in the JWT — without this, Firestore rules deny all listeners.
            if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
            }

            // Refresh context so userData reflects the new agencyId
            await refreshUserData();
        } catch (err: any) {
            if (err?.code === 'functions/already-exists') {
                await refreshUserData();
                // If the user already existed and has an agencyId, fallback to that
                newAgencyId = userData?.agencyId || '';
            } else {
                console.error('Onboarding CF error:', err);
                setError('אירעה שגיאה במהלך ההרשמה. אנא נסה שוב.');
                setIsLoading(false);
                return;
            }
        }

        if (!newAgencyId) {
            navigate('/');
            return;
        }

        // Step 2: Save extended profile fields
        try {
            let logoUrl: string | undefined;
            if (logoFile) {
                // Upload logo to the new agency's storage path
                logoUrl = await uploadAgencyLogo(newAgencyId, logoFile);
            }

            await completeOnboarding(newAgencyId, {
                agencyName: agencyName.trim() || undefined,
                slogan: slogan.trim() || undefined,
                officePhone: officePhone.trim() || undefined,
                licenseNumber: licenseNumber.trim() || undefined,
                mainServiceArea: mainServiceArea.trim() || undefined,
                specialization,
                logoUrl,
            });

            // Save goals
            if (monthlyAgencyRevenue || monthlyAgencyDeals) {
                await updateAgencyGoals(
                    newAgencyId,
                    {
                        commissions: monthlyAgencyRevenue || 0,
                        deals: monthlyAgencyDeals || 0,
                        leads: 0
                    }
                );
            }

            if (monthlyPersonalRevenue || monthlyPersonalDeals) {
                if (currentUser) {
                    await updateUserProfile(currentUser.uid, {
                        goals: {
                            monthly: {
                                revenue: monthlyPersonalRevenue || 0,
                                deals: monthlyPersonalDeals || 0
                            },
                            yearly: { revenue: 0, deals: 0 } // default blank yearly for now
                        }
                    });
                }
            }

            // Head to the dashboard!
            navigate('/');
        } catch (err2: any) {
            console.error('Extended profile save error:', err2);
            // Non-critical — agency was created, just navigate
            navigate('/');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSmsCancel = () => {
        setShowSmsModal(false);
        setError('עליך לאמת את מספר הטלפון כדי לסיים את הקמת המשרד.');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6" dir="rtl">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">

                {/* Header */}
                <div className="bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-10 py-8 text-center relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                    <div className="relative z-10">
                        <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-3">
                            <Building2 size={26} className="text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-white">הקמת משרד התיווך</h1>
                        <p className="text-blue-100 text-xs mt-1">שלב {step + 1} מתוך 4 — {STEP_TITLES[step]}</p>
                    </div>
                </div>

                {/* Progress dots */}
                <div className="flex items-center justify-center gap-2 pt-5 px-10">
                    {STEP_TITLES.map((title, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' : 'bg-slate-100 text-slate-400'}`}>
                                {i < step ? <CheckCircle2 size={14} /> : i + 1}
                            </div>
                            <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-blue-700' : 'text-slate-400'}`}>{title}</span>
                            {i < 3 && <div className={`w-8 h-0.5 rounded-full ml-1 ${i < step ? 'bg-blue-500' : 'bg-slate-200'}`} />}
                        </div>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="px-10 py-6 space-y-5">

                    {/* ─── STEP 1: Personal ─── */}
                    {step === 0 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div>
                                <label className={labelCls}>שם מלא *</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                        <User className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="ישראל ישראלי" className={inputCls} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>מספר טלפון *</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                        <Phone className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-0000000" className={inputCls} dir="ltr" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 2: Agency basics ─── */}
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

                    {/* ─── STEP 3: Branding & Specialization ─── */}
                    {step === 2 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
                            {/* Logo Upload */}
                            <div>
                                <label className={labelCls}>לוגו הסוכנות <span className="text-slate-400 font-normal">(אופציונלי)</span></label>
                                <div
                                    onClick={() => logoInputRef.current?.click()}
                                    className="flex items-center gap-4 p-4 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer transition-all group"
                                >
                                    {logoPreview ? (
                                        <img src={logoPreview} alt="Logo preview" className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors flex-shrink-0">
                                            <Camera size={22} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm font-semibold text-slate-700">{logoPreview ? 'לחץ להחלפת הלוגו' : 'העלה לוגו'}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">PNG, JPG עד 2MB</p>
                                    </div>
                                </div>
                                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoChange} />
                            </div>

                            {/* Service Area */}
                            <div>
                                <label className={labelCls}>אזור שירות ראשי <span className="text-slate-400 font-normal">(אופציונלי)</span></label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                        <MapPin className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <input type="text" value={mainServiceArea} onChange={e => setMainServiceArea(e.target.value)} placeholder="תל אביב והמרכז" className={inputCls} />
                                </div>
                            </div>

                            {/* Specialization */}
                            <div>
                                <label className={labelCls}>
                                    <Briefcase size={10} className="inline ml-1" />
                                    התמחות עיקרית
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {SPECIALIZATIONS.map(s => (
                                        <button
                                            key={s.value}
                                            type="button"
                                            onClick={() => setSpecialization(s.value)}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-semibold transition-all ${specialization === s.value
                                                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                                }`}
                                        >
                                            <span className="text-lg">{s.icon}</span>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 4: Goals ─── */}
                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                                <p className="text-sm text-slate-600 leading-relaxed font-medium">כדי להתחיל ברגל ימין, אתה יכול להגדיר כאן את יעדי החברה והיעדים האישיים שלך לחודש הנוכחי. תוכל תמיד לשנות אותם תחת עמוד ה"הגדרות" במערכת. <br /><span className="font-bold">ניתן לדלג על שלב זה אם תרצה להגדירם מאוחר יותר.</span></p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>יעד הכנסות חודשי משרד</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                            <BarChart4 className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input type="number" min="0" value={monthlyAgencyRevenue} onChange={e => setMonthlyAgencyRevenue(e.target.value ? Number(e.target.value) : '')} placeholder="₪ 100,000" className={inputCls} dir="ltr" />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>יעד עסקאות חודשי משרד</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                            <Target className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input type="number" min="0" value={monthlyAgencyDeals} onChange={e => setMonthlyAgencyDeals(e.target.value ? Number(e.target.value) : '')} placeholder="5" className={inputCls} dir="ltr" />
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <label className={labelCls}>יעד הכנסות אישי</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                            <BarChart4 className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input type="number" min="0" value={monthlyPersonalRevenue} onChange={e => setMonthlyPersonalRevenue(e.target.value ? Number(e.target.value) : '')} placeholder="₪ 50,000" className={inputCls} dir="ltr" />
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <label className={labelCls}>יעד עסקאות אישי</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                            <Target className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input type="number" min="0" value={monthlyPersonalDeals} onChange={e => setMonthlyPersonalDeals(e.target.value ? Number(e.target.value) : '')} placeholder="2" className={inputCls} dir="ltr" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl">
                            {error}
                        </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex gap-3 pt-1">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={handleBack}
                                className="flex-1 flex justify-center items-center gap-1.5 py-3 rounded-2xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                                <ChevronLeft size={16} />
                                חזור
                            </button>
                        )}

                        {step < 3 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={!canAdvance()}
                                className="flex-1 flex justify-center items-center gap-1.5 py-3 rounded-2xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                המשך
                                <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex-1 flex justify-center items-center gap-2 py-3 rounded-2xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                {isLoading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> מקים את הסוכנות...</>
                                ) : (
                                    <><CheckCircle2 size={16} /> סיום — כניסה למערכת</>
                                )}
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <VerifyPhoneModal
                phone={normalizedPhone}
                isOpen={showSmsModal}
                onVerified={handleSmsVerified}
                onCancel={handleSmsCancel}
            />
        </div>
    );
}
