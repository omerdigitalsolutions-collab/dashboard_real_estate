import { useEffect, useState } from 'react';
import { Mail, MessageCircle, Instagram, Facebook, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

// ─── Contact Links ─────────────────────────────────────────────────────────────
const WHATSAPP_URL = 'https://wa.me/972526292624'; // Update with your number
const EMAIL = 'omerdigitalsolutions@gmail.com';
const INSTAGRAM_URL = 'https://www.instagram.com/p/DOaY9Z5CMwM/';
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61575865530708';

// ─── Animated dots ─────────────────────────────────────────────────────────────
function WaitingDots() {
    const [count, setCount] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setCount(c => (c + 1) % 4), 600);
        return () => clearInterval(id);
    }, []);
    return <span className="inline-block w-6 text-left">{'.'.repeat(count)}</span>;
}

// ─── Step tracker ──────────────────────────────────────────────────────────────
const STEPS = [
    { label: 'פרטי הסוכנות התקבלו', done: true },
    { label: 'בדיקת הבקשה על־ידי הצוות שלנו', done: false },
    { label: 'אישור גישה למערכת', done: false },
];

export default function PendingApproval() {
    const { userData } = useAuth();
    const navigate = useNavigate();
    const [approved, setApproved] = useState(false);

    // When userData.isActive flips to true (via real-time onSnapshot), auto-redirect
    useEffect(() => {
        if (userData && userData.isActive === true) {
            setApproved(true);
            const timer = setTimeout(() => navigate('/dashboard', { replace: true }), 2500);
            return () => clearTimeout(timer);
        }
    }, [userData?.isActive]);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login', { replace: true });
    };

    // ── Auto-approved state ────────────────────────────────────────────────────
    if (approved) {
        return (
            <div
                className="min-h-screen flex items-center justify-center"
                style={{ background: 'radial-gradient(ellipse at center, #0a1628 0%, #000d1a 100%)' }}
            >
                <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-700">
                    <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto"
                        style={{ boxShadow: '0 0 60px rgba(16,185,129,0.4)' }}>
                        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                    </div>
                    <h2 className="text-3xl font-black text-white">הבקשה אושרה! 🎉</h2>
                    <p className="text-slate-400">מעביר אותך למערכת</p>
                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
                </div>
            </div>
        );
    }

    return (
        <div
            dir="rtl"
            className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
            style={{
                background: 'radial-gradient(ellipse at 30% 20%, #0d1f3c 0%, #000d1a 60%, #0a0014 100%)',
                fontFamily: "'Inter', 'Segoe UI', sans-serif",
            }}
        >
            {/* Background orbs */}
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[120px] opacity-20 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #2563eb, transparent)' }} />
            <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full blur-[100px] opacity-15 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />

            {/* Logo */}
            <div className="mb-10 text-center">
                <h1
                    className="text-4xl font-black tracking-widest uppercase"
                    style={{
                        background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 60%, #c084fc 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        filter: 'drop-shadow(0 0 20px rgba(56,189,248,0.5))',
                    }}
                >
                    hOMER
                </h1>
                <p className="text-slate-500 text-sm tracking-widest uppercase mt-1">Real Estate CRM</p>
            </div>

            {/* Main card */}
            <div
                className="w-full max-w-lg rounded-3xl p-8 sm:p-10 text-center space-y-8"
                style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(56,189,248,0.15)',
                    boxShadow: '0 0 60px rgba(56,189,248,0.08), 0 25px 50px rgba(0,0,0,0.5)',
                }}
            >
                {/* Pulsing icon */}
                <div className="flex justify-center">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full animate-ping"
                            style={{ background: 'rgba(56,189,248,0.15)', animationDuration: '2s' }} />
                        <div
                            className="w-20 h-20 rounded-full flex items-center justify-center relative"
                            style={{
                                background: 'rgba(56,189,248,0.1)',
                                border: '2px solid rgba(56,189,248,0.3)',
                                boxShadow: '0 0 30px rgba(56,189,248,0.2)',
                            }}
                        >
                            <Clock className="w-9 h-9 text-cyan-400" />
                        </div>
                    </div>
                </div>

                {/* Main message */}
                <div className="space-y-3">
                    <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                        פרטיך נקלטו בהצלחה ✅
                    </h2>
                    <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
                        נבדוק את הבקשה לפתיחת משתמש במערכת<br />
                        <span className="text-cyan-400 font-semibold">ונחזור אליך בהקדם</span>
                    </p>
                    <p className="text-slate-500 text-sm">
                        ממתין לאישור<WaitingDots />
                    </p>
                </div>

                {/* Progress steps */}
                <div className="space-y-3 text-right">
                    {STEPS.map((step, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                                step.done
                                    ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-400'
                                    : i === 1
                                        ? 'bg-cyan-500/10 border border-cyan-400/40'
                                        : 'bg-slate-800 border border-slate-700'
                            }`}>
                                {step.done ? (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                ) : i === 1 ? (
                                    <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                                ) : (
                                    <span className="text-slate-600">{i + 1}</span>
                                )}
                            </div>
                            <span className={`text-sm ${step.done ? 'text-emerald-400 font-semibold' : i === 1 ? 'text-cyan-300' : 'text-slate-600'}`}>
                                {step.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Divider */}
                <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.2), transparent)' }} />

                {/* Contact section */}
                <div className="space-y-4">
                    <p className="text-slate-400 text-sm font-medium">יש שאלות? צרו איתנו קשר ישירות:</p>

                    <div className="grid grid-cols-2 gap-3">
                        {/* WhatsApp */}
                        <a
                            href={WHATSAPP_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg group"
                            style={{
                                background: 'rgba(37,211,102,0.1)',
                                border: '1px solid rgba(37,211,102,0.3)',
                                color: '#25d366',
                                boxShadow: '0 0 0 transparent',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 20px rgba(37,211,102,0.3)')}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 0 transparent')}
                        >
                            <MessageCircle className="w-4 h-4" />
                            WhatsApp
                        </a>

                        {/* Email */}
                        <a
                            href={`mailto:${EMAIL}`}
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                            style={{
                                background: 'rgba(56,189,248,0.1)',
                                border: '1px solid rgba(56,189,248,0.3)',
                                color: '#38bdf8',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 20px rgba(56,189,248,0.3)')}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 0 transparent')}
                        >
                            <Mail className="w-4 h-4" />
                            אימייל
                        </a>

                        {/* Instagram */}
                        <a
                            href={INSTAGRAM_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300 hover:scale-105"
                            style={{
                                background: 'rgba(225,48,108,0.1)',
                                border: '1px solid rgba(225,48,108,0.3)',
                                color: '#e1306c',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 20px rgba(225,48,108,0.3)')}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 0 transparent')}
                        >
                            <Instagram className="w-4 h-4" />
                            Instagram
                        </a>

                        {/* Facebook */}
                        <a
                            href={FACEBOOK_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300 hover:scale-105"
                            style={{
                                background: 'rgba(24,119,242,0.1)',
                                border: '1px solid rgba(24,119,242,0.3)',
                                color: '#1877f2',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 20px rgba(24,119,242,0.3)')}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 0 0 transparent')}
                        >
                            <Facebook className="w-4 h-4" />
                            Facebook
                        </a>
                    </div>
                </div>

                {/* User info + logout */}
                {userData && (
                    <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                        <div className="text-right">
                            <p className="text-slate-300 text-xs font-semibold">{userData.name}</p>
                            <p className="text-slate-600 text-xs">{userData.email}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-xs text-slate-600 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                        >
                            התנתק
                        </button>
                    </div>
                )}
            </div>

            <p className="mt-8 text-slate-700 text-xs text-center">
                © 2025 hOMER CRM — כל הזכויות שמורות
            </p>
        </div>
    );
}
