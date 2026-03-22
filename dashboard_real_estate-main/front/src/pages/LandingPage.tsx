import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    CheckCircle2,
    MessageCircle,
    Star,
    ArrowLeft,
    Bot,
    Zap,
    Share2,
    LayoutDashboard,
    XCircle,
    Phone,
    Instagram,
    Facebook,
    Mail,
    Clock,
    Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
    const { userData } = useAuth();
    const navigate = useNavigate();

    const handleLoginClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        // If a user is stuck in a half-registered state (auth exists, but no Firestore document),
        // we sign them out so they can see the Google/Email login screen instead of being forced to /onboarding
        if (userData === null) {
            try {
                const { auth } = await import('../config/firebase');
                const { signOut } = await import('firebase/auth');
                await signOut(auth);
            } catch (err) { }
        }
        navigate('/login');
    };

    // Contact Form State
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactStatus, setContactStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const handleContactSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setContactStatus('loading');

        // TODO: Replace this URL with the deployed Google Apps Script Web App URL
        const GOOGLE_SCRIPT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz2XVMpUrISGf6TwoHOb9LFw_Q5AuGVpd7ZEbJBf0V9681fpbjSB9BDrvEMUUqrdelu/exec';

        if (!GOOGLE_SCRIPT_WEBHOOK_URL) {
            console.warn('Google Apps Script URL is missing. Cannot submit form.');
            // Simulate success for now so user sees the UI state
            setTimeout(() => setContactStatus('success'), 1500);
            return;
        }

        try {
            await fetch(GOOGLE_SCRIPT_WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors', // standard way to post to AppScript without CORS issues
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: contactName,
                    phone: contactPhone,
                    email: contactEmail,
                }),
            });
            setContactStatus('success');
            setContactName('');
            setContactPhone('');
            setContactEmail('');
        } catch (error) {
            console.error('Submission error:', error);
            setContactStatus('error');
        }
    };

    const [isModalOpen, setIsModalOpen] = useState(false);

    const scrollToPricing = (e: React.MouseEvent) => {
        e.preventDefault();
        const pricingSect = document.getElementById('pricing');
        if (pricingSect) {
            pricingSect.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const handleSubscribe = (_plan: 'solo' | 'boutique' | 'pro' | 'enterprise') => {
        navigate('/register');
    };
    return (
        <div className="min-h-screen bg-[#eff5f5] font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden text-slate-900" dir="rtl">
            {/* Navigation */}
            <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 md:px-12 flex justify-between items-center bg-[#eff5f5]/80 backdrop-blur-md border-b border-slate-200/50 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center" dir="ltr">
                    <img src="/homer-logo.png" alt="Homer CRM" className="h-14 md:h-20 w-auto" />
                </div>
                <div className="flex items-center gap-4 md:gap-6">
                    {userData ? (
                        <Link to="/dashboard" className="text-sm md:text-base font-bold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 md:px-6 md:py-2.5 rounded-full shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-0.5 flex items-center gap-2">
                            אל המערכת
                        </Link>
                    ) : (
                        <>
                            <a href="/login" onClick={handleLoginClick} className="text-sm md:text-base font-semibold text-slate-600 hover:text-blue-900 transition-colors cursor-pointer">
                                התחברות
                            </a>
                            <a href="#pricing" onClick={scrollToPricing} className="text-sm md:text-base font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 md:px-6 md:py-2.5 rounded-full shadow-lg shadow-emerald-500/25 transition-all hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer">
                                הירשם עכשיו
                            </a>
                        </>
                    )}
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative pt-32 pb-16 md:pt-48 md:pb-32 px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
                {/* Background decorative blobs */}
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[400px] bg-blue-900/5 rounded-full blur-3xl -z-10"></div>
                <div className="absolute top-40 right-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl -z-10 animate-pulse-slow"></div>

                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 max-w-4xl">
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-tight text-slate-900 mb-6 flex flex-col items-center">
                        <div className="flex justify-center items-center mb-6" dir="ltr">
                            <img src="/homer-logo.png" alt="Homer CRM" className="h-28 md:h-40 lg:h-52 w-auto" />
                        </div>
                        <span className="text-3xl md:text-5xl lg:text-6xl mt-2 text-slate-800"> הבית של המתווכים</span>
                    </h1>

                    <p className="text-lg md:text-xl lg:text-2xl text-slate-600 leading-relaxed max-w-3xl mx-auto font-medium mb-10">
                        מערכת ה-CRM החכמה והמתקדמת בישראל לניהול משרדי תיווך, עסקאות וסוכנים.<br />
                        <span className="text-slate-500 text-base md:text-lg mt-2 block font-normal">מבית עומר פתרונות דיגיטלים.</span>
                    </p>

                    <div className="flex flex-col items-center justify-center gap-3">
                        {userData ? (
                            <Link to="/dashboard" className="w-full sm:w-auto px-10 py-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl md:text-2xl shadow-2xl shadow-emerald-500/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3">
                                כניסה למערכת
                                <ArrowLeft size={28} strokeWidth={2.5} />
                            </Link>
                        ) : (
                            <a href="#pricing" onClick={scrollToPricing} className="w-full sm:w-auto px-10 py-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl md:text-2xl shadow-2xl shadow-emerald-500/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 cursor-pointer">
                                הירשם עכשיו (7 ימי ניסיון בחינם)
                                <ArrowLeft size={28} strokeWidth={2.5} />
                            </a>
                        )}
                        {!userData && (
                            <span className="text-emerald-700 font-bold text-lg bg-emerald-50 px-5 py-2 rounded-full shadow-sm border border-emerald-100">
                                🎁 7 ימי ניסיון ללא עלות!
                            </span>
                        )}
                    </div>
                </div>

                {/* Dashboard Mockup Placeholder */}
                <div className="mt-16 md:mt-24 w-full max-w-5xl animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
                    <div className="relative rounded-2xl bg-white p-2 shadow-2xl shadow-blue-900/10 ring-1 ring-slate-200 lg:rounded-3xl lg:p-4 perspective-1000 group">
                        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-blue-900/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div className="relative overflow-hidden rounded-xl bg-slate-50 border border-slate-100 aspect-[16/9] flex flex-col">
                            {/* Browser Header */}
                            <div className="h-12 border-b border-slate-200 bg-white flex items-center px-4 gap-2">
                                <div className="w-3.5 h-3.5 rounded-full bg-slate-200"></div>
                                <div className="w-3.5 h-3.5 rounded-full bg-slate-200"></div>
                                <div className="w-3.5 h-3.5 rounded-full bg-slate-200"></div>
                            </div>
                            {/* App Content Mockup Video */}
                            <div className="flex-1 w-full bg-slate-50 relative border-t border-slate-200 overflow-hidden flex items-start justify-center">
                                <video
                                    src="/dashboard-animation.mp4"
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    className="w-full h-auto object-cover object-top opacity-95 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                                />
                            </div>

                            {/* Floating Element Mock */}
                            <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur rounded-xl p-4 shadow-xl border border-slate-100 w-64 transform transition-transform group-hover:-translate-y-2 duration-500 hidden md:block">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
                                        <CheckCircle2 size={18} />
                                    </div>
                                    <div className="text-sm font-bold text-slate-800">ליד חדש התקבל!</div>
                                </div>
                                <div className="text-sm text-slate-500 font-medium">קונה פוטנציאלי לדירת 4 חדרים בתל אביב</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Overview */}
            <section className="py-24 bg-[#eff5f5] relative border-t border-slate-100/50">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <h2 className="text-3xl md:text-5xl font-black text-blue-900 mb-6">
                            כל מה שהמשרד שלך צריך במקום אחד
                        </h2>
                        <p className="text-lg text-slate-600 font-medium">
                            טכנולוגיה מתקדמת שחוסכת זמן ומייצרת עסקאות
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {/* Feature 1: AI WhatsApp */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Bot size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">אל תסננו. הבוט כבר עשה את זה.</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                סייען וירטואלי שיושב על הווטסאפ שלכם. ממיין לידים, מבין מה הם מחפשים ומכניס לפייפליין. עניתם בעצמכם? מנגנון ה-AI Firewall משתיק את הבוט אוטומטית. אפס פדיחות.
                            </p>
                        </div>
                        {/* Feature 2: Matchmaking */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Star size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">אל תחפשו קונים. חברו ביניהם.</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                קסם בקליק. מנוע ה-Matchmaking סורק אלפי נכסים ומתאים עבור כל לקוח בדיוק את הנכס שעונה לדרישות שלו. בלי לנחש, בלי אקסלים מיוזעים.
                            </p>
                        </div>
                        {/* Feature 3: Webot Catalog */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Share2 size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">אל תשלחו תמונות. שלחו חוויות.</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                הלקוחות שונאים לקבל 15 תמונות מטושטשות בווטסאפ. המערכת מייצרת מיני-סייט יוקרתי של הנכס לכל לקוח. עשו 'לייק'? אתם מקבלים התראה מיד ב-CRM.
                            </p>
                        </div>
                        {/* Feature 4: Smart Dashboard / P&L */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <LayoutDashboard size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">מבט מגבוה על הכסף שלכם</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                דאשבורד מעוצב שמרכז עסקאות סגורות מול הוצאות משרד, רווחיות, ויעדי סוכנים שנותן לכם שליטה אבסולוטית על התזרים. דוח רווח והפסד (P&L) בלחיצת כפתור.
                            </p>
                        </div>
                        {/* Feature 5: Broadcast */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <MessageCircle size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">תפוצת הודעות המונית בווטסאפ</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                שליחת הודעות תפוצה בווצאפ לעשרות לידים בלחיצת כפתור ע"י סינון מורכב ישירות מהמערכת - הגיע נכס חדש? כל מי שחיפש אותו יקבל הודעה שיווקית מיד.
                            </p>
                        </div>
                        {/* Feature 6: AI Import / Data */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Zap size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">יבוא חכם ויצירת נכסים ב-AI</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                חסכו שעות של הקלדה. ה-AI סורק טקסטים חופשיים, תמונות ואקסלים מלאים, ומקים נכסים אוטומטית. סריקת קבוצות B2B של מתווכים מייצרת נכסים מלאים מההודעות שלהם.
                            </p>
                        </div>
                    </div>

                    <div className="mt-16 flex flex-col items-center justify-center gap-3">
                        {userData ? (
                            <Link to="/dashboard" className="w-full sm:w-auto px-10 py-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl md:text-2xl shadow-2xl shadow-emerald-500/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3">
                                כניסה למערכת
                                <ArrowLeft size={28} strokeWidth={2.5} />
                            </Link>
                        ) : (
                            <button onClick={scrollToPricing} className="w-full sm:w-auto px-10 py-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl md:text-2xl shadow-2xl shadow-emerald-500/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 cursor-pointer">
                                הירשם עכשיו
                                <ArrowLeft size={28} strokeWidth={2.5} />
                            </button>
                        )}
                        {!userData && (
                            <span className="text-emerald-700 font-bold text-lg bg-emerald-50 px-5 py-2 rounded-full shadow-sm border border-emerald-100">
                                🎁 7 ימי ניסיון ללא עלות!
                            </span>
                        )}
                    </div>
                </div>
            </section>

            {/* ── "What Does an Agency Manager Actually Do?" — Old vs hOMER ── */}
            <section className="bg-[#020b18] text-white py-24 px-4 sm:px-6 lg:px-8 overflow-hidden" dir="rtl">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-16 space-y-4">
                        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-6">
                            תפסיק לנהל את הבלגן. תתחיל לנהל עסק.
                        </h2>
                        <h3 className="text-xl md:text-2xl font-bold text-[#8892b0] max-w-4xl mx-auto leading-relaxed">
                            בוא נהיה כנים: זה אתה עכשיו, מתוסכל ומבוזר, מול הגרסה המשודרגת שלך לאחר שנטמיע לך את מערכת hOMER ותחזיר לעצמך את השליטה.
                        </h3>
                    </div>

                    {/* Split Screen Headers */}
                    <div className="grid md:grid-cols-2 gap-8 relative mb-12">
                        {/* RIGHT COLUMN HEADER */}
                        <div className="sticky top-24 bg-[#020b18]/90 backdrop-blur z-20 py-4 border-b border-red-500/20 flex justify-center shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)]">
                            <h3 className="text-2xl md:text-3xl font-black text-red-500 flex items-center gap-3">
                                זה אתה עכשיו <XCircle className="w-8 h-8" strokeWidth={2.5} />
                            </h3>
                        </div>

                        {/* LEFT COLUMN HEADER */}
                        <div className="sticky top-24 bg-[#020b18]/90 backdrop-blur z-20 py-4 border-b border-[#00e5ff]/30 flex justify-center shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)]">
                            <h3 className="text-2xl md:text-3xl font-black text-[#00e5ff] flex items-center gap-3 drop-shadow-[0_0_10px_rgba(0,229,255,0.5)]">
                                <CheckCircle2 className="w-8 h-8 filter drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]" strokeWidth={2.5} /> זה אתה אחרי hOMER
                            </h3>
                        </div>
                    </div>

                    {/* Split Screen Content */}
                    <div className="space-y-16 relative">
                        {/* Central Glowing Divider (Desktop) */}
                        <div className="hidden md:block absolute top-[20px] bottom-0 left-1/2 w-0.5 bg-gradient-to-b from-transparent via-[#00e5ff]/50 to-transparent -translate-x-1/2 shadow-[0_0_15px_rgba(0,229,255,0.8)]"></div>

                        {/* Stage 1 */}
                        <div className="relative">
                            <div className="flex justify-center mb-8 relative z-10 w-full">
                                <h4 className="text-xl md:text-2xl font-bold text-white bg-[#020b18] px-8 py-2.5 rounded-full border border-slate-800 shadow-[0_0_15px_rgba(0,229,255,0.1)] inline-block">1. לידים ושיווק</h4>
                            </div>
                            <div className="grid md:grid-cols-2 gap-8">
                                {/* Right (Now) */}
                                <div className="bg-red-950/20 border border-red-500/10 rounded-3xl p-8 backdrop-blur-sm group hover:bg-red-950/30 transition-all duration-300 flex items-center">
                                    <p className="text-slate-400 text-lg leading-relaxed font-medium w-full text-center">
                                        קמפיינים יקרים נשרפים. לידים נופלים בין הכיסאות, הודעות בוואטסאפ נשארות ללא מענה, ולקוחות חמים מתקררים כי שכחת לחזור אליהם.
                                    </p>
                                </div>
                                {/* Left (Homer) */}
                                <div className="bg-[#0a192f]/60 border border-[#00e5ff]/20 rounded-3xl p-8 backdrop-blur-md shadow-[0_8px_32px_rgba(0,229,255,0.05)] transition-all duration-500 hover:border-[#00e5ff]/50 hover:shadow-[0_8px_32px_rgba(0,229,255,0.15)] hover:-translate-y-1 overflow-hidden relative group flex items-center">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-[#00e5ff]/20 transition-colors duration-500"></div>
                                    <p className="text-[#00e5ff] text-lg leading-relaxed font-medium relative z-10 w-full text-center">
                                        קליטה מידית מכל הקמפיינים למסך אחד. הליד מנותב אוטומטית לסוכן, ובוט AI כבר שולח לו הודעת "נעים להכיר" בווצאפ.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stage 2 */}
                        <div className="relative">
                            <div className="flex justify-center mb-8 relative z-10 w-full">
                                <h4 className="text-xl md:text-2xl font-bold text-white bg-[#020b18] px-8 py-2.5 rounded-full border border-slate-800 shadow-[0_0_15px_rgba(0,229,255,0.1)] inline-block">2. צוות וביצועים</h4>
                            </div>
                            <div className="grid md:grid-cols-2 gap-8">
                                {/* Right (Now) */}
                                <div className="bg-red-950/20 border border-red-500/10 rounded-3xl p-8 backdrop-blur-sm group hover:bg-red-950/30 transition-all duration-300 flex items-center">
                                    <p className="text-slate-400 text-lg leading-relaxed font-medium w-full text-center">
                                        "איפה הליד של אתמול?" – חוסר שליטה מוחלט. מנהל סוכנים דרך קבוצות ווצאפ חופרות, בלי שום מושג אמיתי מי באמת סוגר עסקאות.
                                    </p>
                                </div>
                                {/* Left (Homer) */}
                                <div className="bg-[#0a192f]/60 border border-[#00e5ff]/20 rounded-3xl p-8 backdrop-blur-md shadow-[0_8px_32px_rgba(0,229,255,0.05)] transition-all duration-500 hover:border-[#00e5ff]/50 hover:shadow-[0_8px_32px_rgba(0,229,255,0.15)] hover:-translate-y-1 overflow-hidden relative group flex items-center">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-[#00e5ff]/20 transition-colors duration-500"></div>
                                    <p className="text-[#00e5ff] text-lg leading-relaxed font-medium relative z-10 w-full text-center">
                                        שקיפות של 100%. לוח קנבן ויזואלי לכל סוכן, תזכורות למשימות ופולואפ, ודאשבורד מנהלים שחושף מי הכוכב של המשרד.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stage 3 */}
                        <div className="relative">
                            <div className="flex justify-center mb-8 relative z-10 w-full">
                                <h4 className="text-xl md:text-2xl font-bold text-white bg-[#020b18] px-8 py-2.5 rounded-full border border-slate-800 shadow-[0_0_15px_rgba(0,229,255,0.1)] inline-block">3. מאגר נכסים</h4>
                            </div>
                            <div className="grid md:grid-cols-2 gap-8">
                                {/* Right (Now) */}
                                <div className="bg-red-950/20 border border-red-500/10 rounded-3xl p-8 backdrop-blur-sm group hover:bg-red-950/30 transition-all duration-300 flex items-center">
                                    <p className="text-slate-400 text-lg leading-relaxed font-medium w-full text-center">
                                        קובץ אקסל מסורבל ומייאש. תמונות מפוזרות בטלפונים של הסוכנים, לקוחות מקבלים פרטים חסרים, ונכסים שכבר נמכרו עדיין מפורסמים.
                                    </p>
                                </div>
                                {/* Left (Homer) */}
                                <div className="bg-[#0a192f]/60 border border-[#00e5ff]/20 rounded-3xl p-8 backdrop-blur-md shadow-[0_8px_32px_rgba(0,229,255,0.05)] transition-all duration-500 hover:border-[#00e5ff]/50 hover:shadow-[0_8px_32px_rgba(0,229,255,0.15)] hover:-translate-y-1 overflow-hidden relative group flex items-center">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-[#00e5ff]/20 transition-colors duration-500"></div>
                                    <p className="text-[#00e5ff] text-lg leading-relaxed font-medium relative z-10 w-full text-center">
                                        מאגר דיגיטלי חכם בענן. לחיצת כפתור אחת מפיקה קטלוג נכסים דיגיטלי ויוקרתי שנשלח ישירות לווצאפ של הלקוח.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stage 4 */}
                        <div className="relative">
                            <div className="flex justify-center mb-8 relative z-10 w-full">
                                <h4 className="text-xl md:text-2xl font-bold text-white bg-[#020b18] px-8 py-2.5 rounded-full border border-slate-800 shadow-[0_0_15px_rgba(0,229,255,0.1)] inline-block">4. כספים ו-P&L</h4>
                            </div>
                            <div className="grid md:grid-cols-2 gap-8">
                                {/* Right (Now) */}
                                <div className="bg-red-950/20 border border-red-500/10 rounded-3xl p-8 backdrop-blur-sm group hover:bg-red-950/30 transition-all duration-300 flex items-center">
                                    <p className="text-slate-400 text-lg leading-relaxed font-medium w-full text-center">
                                        רואה החשבון מתקשר ויש לך חור בבטן. ערימות של חשבוניות מקומטות, חישובי עמלות סוכנים ידניים, וקושי לדעת אם המשרד בכלל רווחי.
                                    </p>
                                </div>
                                {/* Left (Homer) */}
                                <div className="bg-[#0a192f]/60 border border-[#00e5ff]/20 rounded-3xl p-8 backdrop-blur-md shadow-[0_8px_32px_rgba(0,229,255,0.05)] transition-all duration-500 hover:border-[#00e5ff]/50 hover:shadow-[0_8px_32px_rgba(0,229,255,0.15)] hover:-translate-y-1 overflow-hidden relative group flex items-center">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00e5ff]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-[#00e5ff]/20 transition-colors duration-500"></div>
                                    <p className="text-[#00e5ff] text-lg leading-relaxed font-medium relative z-10 w-full text-center">
                                        ה-CFO הווירטואלי שלך. ייבוא קבצי בנק שמסווגים אוטומטית בעזרת AI, ודוח רווח והפסד (P&L) מהמם בלחיצת כפתור.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-20 flex flex-col items-center justify-center gap-3">
                        {userData ? (
                            <Link to="/dashboard" className="w-full sm:w-auto px-10 py-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl md:text-2xl shadow-2xl shadow-emerald-500/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3">
                                כניסה למערכת
                                <ArrowLeft size={28} strokeWidth={2.5} />
                            </Link>
                        ) : (
                            <button onClick={scrollToPricing} className="w-full sm:w-auto px-10 py-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl md:text-2xl shadow-2xl shadow-emerald-500/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 cursor-pointer">
                                הירשם עכשיו
                                <ArrowLeft size={28} strokeWidth={2.5} />
                            </button>
                        )}
                        {!userData && (
                            <span className="text-[#00e5ff] font-bold text-lg bg-[#00e5ff]/10 px-5 py-2 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.2)] border border-[#00e5ff]/20">
                                🎁 7 ימי ניסיון ללא עלות!
                            </span>
                        )}
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section className="py-24 bg-[#eff5f5] relative border-t border-slate-200/50">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <h2 className="text-3xl md:text-5xl font-black text-blue-900 mb-4">תוכניות ומחירים</h2>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
                        {/* Tier 1 - Starter */}
                        <div className="bg-[#020b18] rounded-[2rem] p-8 border border-slate-800 shadow-sm hover:border-[#00e5ff]/30 transition-all flex flex-col h-full group">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-2xl font-black text-white group-hover:text-[#00e5ff] transition-colors">Starter</h3>
                                    <p className="text-slate-400 text-sm mt-1 font-medium">לעשות סדר בבלגן</p>
                                </div>
                            </div>
                            <ul className="mt-8 space-y-4 mb-8 flex-1 text-sm md:text-base">
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>ניהול לידים (קונים ומוכרים)</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>ניהול סטטוס עסקאות ב-Kanban</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>דאשבורד חכם עם נתונים</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>ניהול דירות המשרד על המפה</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>ייבוא דירות/לידים מאקסל</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>ניהול משימות ויומן</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>התאמה בין ליד לדירה</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>קטלוגים דיגיטליים ומיני-סייט</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>מסך דו״ח רווח והפסד (P&L)</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-600 font-medium border-b border-slate-800 pb-2 strike-through">
                                    <XCircle className="text-slate-700 w-5 h-5 flex-shrink-0" />
                                    <span className="line-through">בוט WhatsApp AI וסינון</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-600 font-medium border-b border-slate-800 pb-2 strike-through">
                                    <XCircle className="text-slate-700 w-5 h-5 flex-shrink-0" />
                                    <span className="line-through">הודעות תפוצה בווטסאפ</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-600 font-medium border-b border-slate-800 pb-2 strike-through">
                                    <XCircle className="text-slate-700 w-5 h-5 flex-shrink-0" />
                                    <span className="line-through">סריקת B2B קבוצות ווטסאפ</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-600 font-medium border-b border-slate-800 pb-2 strike-through">
                                    <XCircle className="text-slate-700 w-5 h-5 flex-shrink-0" />
                                    <span className="line-through">יבוא נכסים חכם (AI) מטקסט</span>
                                </li>
                            </ul>
                            <button
                                onClick={() => handleSubscribe('solo')}
                                className="w-full py-4 bg-transparent border border-slate-700 hover:border-[#00e5ff] hover:bg-[#00e5ff]/10 text-white font-bold text-lg text-center rounded-xl transition-all"
                            >
                                בחר Starter
                            </button>
                        </div>

                        {/* Tier 2 (Recommended) - Pro */}
                        <div className="bg-[#020b18] rounded-[2rem] p-8 border border-[#00e5ff]/50 shadow-[0_0_30px_rgba(0,229,255,0.15)] transform lg:-translate-y-4 flex flex-col h-full relative group z-10">
                            <div className="absolute top-0 inset-x-0 flex justify-center -translate-y-1/2">
                                <div className="bg-[#00e5ff] text-[#020b18] text-sm font-black px-5 py-1.5 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.4)]">
                                    הבחירה הפופולרית
                                </div>
                            </div>
                            <div className="flex justify-between items-start mb-4 mt-2">
                                <div>
                                    <h3 className="text-2xl font-black text-white group-hover:text-[#00e5ff] transition-colors">Pro</h3>
                                    <p className="text-[#00e5ff]/80 text-sm mt-1 font-medium">למשרדים שרוצים לגדול</p>
                                </div>
                            </div>
                            <ul className="mt-8 space-y-4 mb-8 flex-1 text-sm md:text-base">
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>ניהול לידים, עסקאות ומשימות</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>דאשבורד, דירות במפה ואקסלים</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>התאמה בין ליד לדירה וקטלוגים</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>מסך דו״ח רווח והפסד (P&L)</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span className="font-bold">בוט WhatsApp AI וסינון</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span className="font-bold">הודעות תפוצה בווטסאפ</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span className="font-bold">יבוא נכסים חכם (AI) מטקסט</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-600 font-medium border-b border-slate-800 pb-2 strike-through">
                                    <XCircle className="text-slate-700 w-5 h-5 flex-shrink-0" />
                                    <span className="line-through">סריקת B2B קבוצות ווטסאפ</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-600 font-medium border-b border-slate-800 pb-2 strike-through">
                                    <XCircle className="text-slate-700 w-5 h-5 flex-shrink-0" />
                                    <span className="line-through">משתמשים ללא הגבלה</span>
                                </li>
                                <li className="flex items-center gap-3 text-slate-600 font-medium border-b border-slate-800 pb-2 strike-through">
                                    <XCircle className="text-slate-700 w-5 h-5 flex-shrink-0" />
                                    <span className="line-through">ריבוי מספרי ווטסאפ רובוטיים</span>
                                </li>
                            </ul>
                            <button
                                onClick={() => handleSubscribe('pro')}
                                className="w-full py-4 bg-[#00e5ff] hover:bg-[#00cce6] text-[#020b18] font-black text-lg text-center rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all hover:-translate-y-1"
                            >
                                התחל 7 ימים ניסיון
                            </button>
                        </div>

                        {/* Tier 3 - Enterprise */}
                        <div className="bg-[#020b18] rounded-[2rem] p-8 border border-slate-800 shadow-sm hover:border-[#00e5ff]/30 transition-all flex flex-col h-full group">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-2xl font-black text-white group-hover:text-[#00e5ff] transition-colors">Enterprise</h3>
                                    <p className="text-slate-400 text-sm mt-1 font-medium">לרשתות תיווך ולזיכיונות</p>
                                </div>
                            </div>
                            <ul className="mt-8 space-y-4 mb-8 flex-1 text-sm md:text-base">
                                <li className="flex items-center gap-3 text-slate-300 font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span>כל יכולות ה-Pro</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span className="font-bold text-[#00e5ff]">סריקת B2B קבוצות ווטסאפ</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span className="font-bold">משתמשים וסוכנים ללא הגבלה</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span className="font-bold">ריבוי מספרי ווטסאפ למשרד</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span className="font-bold">דאשבורד אדמיניסטרציה מתקדם</span>
                                </li>
                                <li className="flex items-center gap-3 text-white font-medium border-b border-slate-800 pb-2">
                                    <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                    <span className="font-bold">מנהל תיק אישי ואינטגרציות API</span>
                                </li>
                            </ul>
                            <button
                                onClick={() => handleSubscribe('enterprise')}
                                className="w-full py-4 mt-auto bg-transparent border border-slate-700 hover:border-[#00e5ff] hover:bg-[#00e5ff]/10 text-white font-bold text-lg text-center rounded-xl transition-all block"
                            >
                                קבל 7 ימים ניסיון דמו
                            </button>
                        </div>
                    </div>

                    <div className="mt-16 flex flex-col items-center justify-center gap-3">
                        <h4 className="text-xl md:text-2xl font-black text-blue-900 mb-4 text-center">
                            הגעת עד לכאן ועוד לא נרשמת? הגיע הזמן!
                        </h4>
                        {userData ? (
                            <Link to="/dashboard" className="w-full sm:w-auto px-10 py-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl md:text-2xl shadow-2xl shadow-emerald-500/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3">
                                כניסה למערכת
                                <ArrowLeft size={28} strokeWidth={2.5} />
                            </Link>
                        ) : (
                            <button onClick={scrollToPricing} className="w-full sm:w-auto px-10 py-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl md:text-2xl shadow-2xl shadow-emerald-500/40 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 cursor-pointer">
                                הירשם עכשיו
                                <ArrowLeft size={28} strokeWidth={2.5} />
                            </button>
                        )}
                        {!userData && (
                            <span className="text-emerald-700 font-bold text-lg bg-emerald-50 px-5 py-2 rounded-full shadow-sm border border-emerald-100">
                                🎁 7 ימי ניסיון ללא עלות!
                            </span>
                        )}
                    </div>
                </div>
            </section>

            {/* --- FAQ SECTION START --- */}
            <section className="py-24 bg-[#020b18] border-t border-slate-800">
                <div className="container mx-auto px-6 max-w-4xl">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
                            שאלות נפוצות
                        </h2>
                        <p className="text-lg text-slate-400">
                            משהו לא ברור? ריכזנו את התשובות לשאלות שעולות הכי הרבה
                        </p>
                    </div>

                    <div className="space-y-4 text-right">
                        {/* FAQ 1 */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-[#00e5ff]/30 transition-colors">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-3">
                                <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                האם אפשר לייבא את הנתונים שלי ממערכת קודמת?
                            </h3>
                            <p className="text-slate-400 leading-relaxed pr-8">
                                בטח. hOMER תומכת ביבוא מכל קובץ אקסל (CSV/XLSX). מנוע הייבוא שלנו שואב את הנתונים ישירות למערכת, כולל לידים ונכסים, בצורה מסודרת ומהירה וללא התערבות טכנית.
                            </p>
                        </div>

                        {/* FAQ 2 */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-[#00e5ff]/30 transition-colors">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-3">
                                <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                איך עובדת ה"התאמה בין ליד לדירה"?
                            </h3>
                            <p className="text-slate-400 leading-relaxed pr-8">
                                המערכת מצליבה נתונים בזמן אמת. כשנכנס לקוח שמחפש 4 חדרים עד 3 מיליון, המערכת סורקת את כל הנכסים ומציגה לכם מיד את ההתאמות המדויקות. הקליק הבא שלכם הוא כבר לשלוח לו וובוט (Webot) של הנכס.
                            </p>
                        </div>

                        {/* FAQ 3 */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-[#00e5ff]/30 transition-colors">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-3">
                                <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                הלקוחות שלי צריכים להוריד אפליקציה?
                            </h3>
                            <p className="text-slate-400 leading-relaxed pr-8">
                                ממש לא. הלקוח מקבל הכל בוואטסאפ: הודעות, קטלוגים דיגיטליים, והצעות. עבור הלקוח החוויה שקופה, יוקרתית ונוחה דרך הדפדפן והוואטסאפ.
                            </p>
                        </div>

                        {/* FAQ 4 */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-[#00e5ff]/30 transition-colors">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-3">
                                <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                מה אם אני אשנה את דעתי?
                            </h3>
                            <p className="text-slate-400 leading-relaxed pr-8">
                                אפשר לבטל את המינוי בכל עת. הנתונים שלכם שייכים לכם תמיד - תוכלו לייצא אותם בלחיצת כפתור לאקסל מתי שרק תרצו, גם בסיום המנוי.
                            </p>
                        </div>

                        {/* FAQ 5 */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-[#00e5ff]/30 transition-colors">
                            <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-3">
                                <CheckCircle2 className="text-[#00e5ff] w-5 h-5 flex-shrink-0" />
                                האם זה מתאים לסוכנים עצמאיים או רק למשרדים?
                            </h3>
                            <p className="text-slate-400 leading-relaxed pr-8">
                                המערכת נבנתה ליצור סדר גם לסוכן העצמאי (חבילת Starter/Pro), וגם למשרדי בוטיק ורשתות זכיינים שחייבים ניהול צוותים במקביל (חבילת Enterprise ו-Pro).
                            </p>
                        </div>
                    </div>
                </div>
            </section>
            {/* --- FAQ SECTION END --- */}

            {/* Contact Form Section */}
            <section id="contact" className="py-24 bg-white border-t border-slate-200" dir="rtl">
                <div className="max-w-4xl mx-auto px-6 lg:px-8">
                    <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 md:p-12 shadow-xl relative overflow-hidden">
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                        <div className="relative z-10 text-center mb-10">
                            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">שנספר לכם עוד? השאירו פרטים 👇</h2>
                            <p className="text-slate-600 text-lg max-w-2xl mx-auto">מלאו את הפרטים והצוות שלנו יחזור אליכם בהקדם לתכנון השדרוג של המשרד שלכם.</p>
                        </div>

                        {contactStatus === 'success' ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center animate-in zoom-in duration-300">
                                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 mb-2">תודה רבה!</h3>
                                <p className="text-slate-600 text-lg">קיבלנו את הפנייה שלך. ניצור איתך קשר בהקדם.</p>
                                <button
                                    onClick={() => setContactStatus('idle')}
                                    className="mt-8 text-emerald-600 font-bold hover:text-emerald-700 transition"
                                >
                                    חזור לטופס
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleContactSubmit} className="space-y-6 relative z-10 max-w-2xl mx-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">שם מלא</label>
                                        <input
                                            type="text"
                                            required
                                            value={contactName}
                                            onChange={(e) => setContactName(e.target.value)}
                                            placeholder="ישראל ישראלי"
                                            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">טלפון</label>
                                        <input
                                            type="tel"
                                            required
                                            value={contactPhone}
                                            onChange={(e) => setContactPhone(e.target.value)}
                                            placeholder="050-0000000"
                                            dir="ltr"
                                            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-sm text-right"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">אימייל (אופציונלי)</label>
                                    <input
                                        type="email"
                                        value={contactEmail}
                                        onChange={(e) => setContactEmail(e.target.value)}
                                        placeholder="name@agency.co.il"
                                        dir="ltr"
                                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all shadow-sm text-right"
                                    />
                                </div>
                                {contactStatus === 'error' && (
                                    <p className="text-rose-500 text-sm font-bold text-center bg-rose-50 p-3 rounded-lg border border-rose-100">
                                        אירעה שגיאה בשליחת הטופס. אנא נסה שוב או פנה אלינו בוואטסאפ.
                                    </p>
                                )}
                                <button
                                    type="submit"
                                    disabled={contactStatus === 'loading'}
                                    className="w-full py-4 bg-[#020b18] hover:bg-slate-800 text-white font-black text-lg text-center rounded-xl shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center mt-4"
                                >
                                    {contactStatus === 'loading' ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        'שלח פרטים'
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-[#eff5f5] border-t border-slate-200/50 py-12">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-col items-center">
                    <div className="flex items-center mb-6 opacity-80 hover:opacity-100 transition-opacity" dir="ltr">
                        <img src="/homer-logo.png" alt="Homer CRM" className="h-16 md:h-20 w-auto grayscale hover:grayscale-0 transition-all" />
                    </div>

                    <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 mb-8 w-full max-w-4xl mx-auto border-y border-slate-200/60 py-8">
                        {/* Contact Details */}
                        <div className="flex flex-col items-center md:items-start gap-4">
                            <a href="tel:0507706024" className="flex items-center gap-2 text-slate-600 hover:text-blue-900 transition-colors font-medium">
                                <Phone className="w-5 h-5 text-emerald-500" />
                                <span dir="ltr">050-770-6024</span>
                            </a>
                            <a href="mailto:contact@homer.management" className="flex items-center gap-2 text-slate-600 hover:text-blue-900 transition-colors font-medium">
                                <Mail className="w-5 h-5 text-emerald-500" />
                                <span>omerdigitalsolutions@gmail.com
                                </span>
                            </a>
                            <div className="flex items-center gap-2 text-slate-600 font-medium">
                                <Clock className="w-5 h-5 text-emerald-500" />
                                <span>א'-ה': 09:00 - 18:00</span>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="hidden md:block w-px h-24 bg-slate-200"></div>
                        <div className="md:hidden w-full h-px bg-slate-200"></div>

                        {/* Social & WhatsApp */}
                        <div className="flex flex-col items-center gap-5">
                            <div className="flex items-center gap-4">
                                <a href="https://www.instagram.com/omer.digital.solutions" target="_blank" rel="noopener noreferrer" className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-pink-600 hover:border-pink-200 transition-all hover:-translate-y-1">
                                    <Instagram className="w-6 h-6" />
                                </a>
                                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all hover:-translate-y-1">
                                    <Facebook className="w-6 h-6" />
                                </a>
                            </div>
                            <a
                                href="https://wa.me/972507706024"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-6 py-2.5 rounded-full font-bold shadow-lg shadow-[#25D366]/30 transition-all hover:-translate-y-0.5"
                            >
                                <MessageCircle className="w-5 h-5" />
                                דברו איתנו בוואטסאפ
                            </a>
                        </div>
                    </div>

                    <p className="text-slate-500 text-sm md:text-base text-center font-medium">
                        © 2026 Homer מבית עומר פתרונות דיגיטלים. <br className="sm:hidden" />Automate Your Success.
                    </p>
                </div>
            </footer>

            {/* Global Floating WhatsApp Button */}
            <a href="https://wa.me/972507706024" target="_blank" rel="noopener noreferrer" className="fixed bottom-6 right-6 md:bottom-10 md:right-10 w-16 h-16 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 hover:bg-[#20bd5a] transition-all z-50 group">
                <MessageCircle size={34} strokeWidth={2.5} />
                <span className="absolute right-[calc(100%+1rem)] bg-white text-slate-800 px-4 py-2 rounded-xl text-sm md:text-base font-bold shadow-xl opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 pointer-events-none transition-all duration-300 origin-right whitespace-nowrap border border-slate-100 hidden sm:block">
                    דברו איתנו בוואטסאפ
                </span>
            </a>
        </div>
    );
}
