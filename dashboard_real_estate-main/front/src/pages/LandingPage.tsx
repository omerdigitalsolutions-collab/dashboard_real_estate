import { Link } from 'react-router-dom';
import {
    CheckCircle2,
    MessageCircle,
    Home,
    FileSignature,
    FileSpreadsheet,
    PlayCircle,
    Star,
    ArrowLeft
} from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-[#eff5f5] font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden text-slate-900" dir="rtl">
            {/* Navigation */}
            <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 md:px-12 flex justify-between items-center bg-[#eff5f5]/80 backdrop-blur-md border-b border-slate-200/50 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center" dir="ltr">
                    <img src="/homer-logo.png" alt="Homer CRM" className="h-14 md:h-20 w-auto" />
                </div>
                <div className="flex items-center gap-4 md:gap-6">
                    <Link to="/login" className="text-sm md:text-base font-semibold text-slate-600 hover:text-blue-900 transition-colors">
                        התחברות
                    </Link>
                    <Link to="/register" className="text-sm md:text-base font-bold bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 md:px-6 md:py-2.5 rounded-full shadow-lg shadow-emerald-500/25 transition-all hover:-translate-y-0.5 flex items-center gap-2">
                        הירשם עכשיו
                    </Link>
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

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link to="/register" className="w-full sm:w-auto px-8 py-4 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg shadow-xl shadow-emerald-500/30 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2">
                            הירשם עכשיו
                            <ArrowLeft size={20} />
                        </Link>
                        <button className="w-full sm:w-auto px-8 py-4 rounded-full bg-white border-2 border-slate-200 hover:border-blue-900 hover:text-blue-900 text-slate-700 font-bold text-lg shadow-sm transition-all flex items-center justify-center gap-2 group">
                            <PlayCircle size={24} className="text-slate-400 group-hover:text-blue-900 transition-colors" />
                            צפה בהדגמה
                        </button>
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
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
                        {/* Feature 1 */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <Home size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">ניהול לידים ונכסים חכם</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                התאמה חכמה ואוטומטית בניהול מאגרי הלקוחות והנכסים, ליצירת התאמות מדויקות בזמן אמת.
                            </p>
                        </div>
                        {/* Feature 2 */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <MessageCircle size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">אינטגרציית WhatsApp מובנית</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                תקשרו עם לקוחות, שילחו נכסים מעוצבים והודעות תפוצה ישירות מתוך ה-CRM בקליק אחד.
                            </p>
                        </div>
                        {/* Feature 3 */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <FileSignature size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">חתימה דיגיטלית</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                שליחה נוחה של טפסי תיווך מחייבים משפטית להחתמה דיגיטלית מהירה דרך SMS או WhatsApp.
                            </p>
                        </div>
                        {/* Feature 4 */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-100 transition-all hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 group">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <FileSpreadsheet size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">יבוא אקסל חכם</h3>
                            <p className="text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                                ייבוא נתונים מרוכז מקבצי אקסל בתוך שניות, כך שתוכלו להעביר את כל המידע ההיסטורי שלכם בקלות רבה.
                            </p>
                        </div>
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
                        {/* Tier 1 */}
                        <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-shadow flex flex-col h-full">
                            <h3 className="text-2xl font-bold text-slate-900">סוכן עצמאי</h3>
                            <div className="mt-4 flex items-baseline gap-2">
                                <span className="text-5xl font-black text-blue-900">₪199</span>
                                <span className="text-slate-500 font-medium whitespace-nowrap">/ לחודש</span>
                            </div>
                            <ul className="mt-8 space-y-5 mb-8 flex-1">
                                <li className="flex items-start gap-3 text-slate-700 font-medium">
                                    <CheckCircle2 className="text-emerald-500 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>CRM בסיסי</span>
                                </li>
                                <li className="flex items-start gap-3 text-slate-700 font-medium">
                                    <CheckCircle2 className="text-emerald-500 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>חיבור לווטסאפ אחד</span>
                                </li>
                                <li className="flex items-start gap-3 text-slate-700 font-medium">
                                    <CheckCircle2 className="text-emerald-500 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>ניהול לידים ונכסים אישי</span>
                                </li>
                            </ul>
                            <Link to="/register" className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-blue-900 font-bold text-lg text-center rounded-xl transition-colors">
                                הירשם עכשיו
                            </Link>
                        </div>

                        {/* Tier 2 (Recommended) */}
                        <div className="bg-blue-900 rounded-[2rem] p-8 border border-blue-800 shadow-2xl shadow-blue-900/40 transform lg:-translate-y-4 flex flex-col h-full relative">
                            <div className="absolute top-0 inset-x-0 flex justify-center -translate-y-1/2">
                                <div className="bg-emerald-500 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
                                    <Star size={14} className="fill-white" />
                                    מומלץ
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-white mt-2">משרד בוטיק</h3>
                            <div className="mt-4 flex items-baseline gap-2">
                                <span className="text-5xl font-black text-white">₪499</span>
                                <span className="text-blue-200 font-medium whitespace-nowrap">/ לחודש</span>
                            </div>
                            <ul className="mt-8 space-y-5 mb-8 flex-1">
                                <li className="flex items-start gap-3 text-blue-50 font-medium">
                                    <CheckCircle2 className="text-emerald-400 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>עד 5 סוכנים</span>
                                </li>
                                <li className="flex items-start gap-3 text-blue-50 font-medium">
                                    <CheckCircle2 className="text-emerald-400 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>חתימות דיגיטליות ללא הגבלה</span>
                                </li>
                                <li className="flex items-start gap-3 text-blue-50 font-medium">
                                    <CheckCircle2 className="text-emerald-400 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>יבוא אקסל</span>
                                </li>
                                <li className="flex items-start gap-3 text-blue-50 font-medium">
                                    <CheckCircle2 className="text-emerald-400 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>מחולל קטלוגים לנכסים</span>
                                </li>
                            </ul>
                            <Link to="/register" className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-lg text-center rounded-xl shadow-lg transition-colors">
                                הירשם עכשיו
                            </Link>
                        </div>

                        {/* Tier 3 */}
                        <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-shadow flex flex-col h-full">
                            <h3 className="text-2xl font-bold text-slate-900">רשת ברוקרים</h3>
                            <div className="mt-4 flex items-baseline gap-2">
                                <span className="text-4xl font-black text-blue-900">בהתאמה אישית</span>
                            </div>
                            <ul className="mt-8 space-y-5 mb-8 flex-1">
                                <li className="flex items-start gap-3 text-slate-700 font-medium">
                                    <CheckCircle2 className="text-emerald-500 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>סוכנים ללא הגבלה</span>
                                </li>
                                <li className="flex items-start gap-3 text-slate-700 font-medium">
                                    <CheckCircle2 className="text-emerald-500 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>דאשבורד סופר-אדמין</span>
                                </li>
                                <li className="flex items-start gap-3 text-slate-700 font-medium">
                                    <CheckCircle2 className="text-emerald-500 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>אינטגרציות API</span>
                                </li>
                                <li className="flex items-start gap-3 text-slate-700 font-medium">
                                    <CheckCircle2 className="text-emerald-500 w-6 h-6 flex-shrink-0 mt-0.5" />
                                    <span>מנהל תיק אישי</span>
                                </li>
                            </ul>
                            <Link to="/register" className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-blue-900 font-bold text-lg text-center rounded-xl transition-colors">
                                הירשם עכשיו
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-[#eff5f5] border-t border-slate-200/50 py-12">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-col items-center">
                    <div className="flex items-center mb-6 opacity-80 hover:opacity-100 transition-opacity" dir="ltr">
                        <img src="/homer-logo.png" alt="Homer CRM" className="h-16 md:h-20 w-auto grayscale hover:grayscale-0 transition-all" />
                    </div>

                    <div className="flex gap-6 mb-8 text-sm font-semibold text-slate-600">
                        <Link to="/terms" className="hover:text-blue-900 transition-colors">תנאי שימוש</Link>
                        <Link to="/privacy" className="hover:text-blue-900 transition-colors">מדיניות פרטיות</Link>
                        <Link to="/contact" className="hover:text-blue-900 transition-colors">צור קשר</Link>
                    </div>

                    <p className="text-slate-500 text-sm md:text-base text-center font-medium">
                        © 2026 hOMER מבית עומר פתרונות דיגיטלים. <br className="sm:hidden" />Automate Your Success.
                    </p>
                </div>
            </footer>
        </div>
    );
}
