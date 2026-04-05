import { useState } from 'react';
import { X, UserPlus, Phone, Copy, Check, ExternalLink } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { isValidEmail, isValidPhone } from '../../utils/validation';

interface InviteAgentModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface InvitePayload {
    email: string;
    name: string;
    role: string;
    phone?: string;
    appUrl: string;
}

interface InviteResult {
    success: boolean;
    stubId: string;
    inviteToken: string;
    whatsappUrl?: string;
}

export default function InviteAgentModal({ onClose, onSuccess }: InviteAgentModalProps) {
    const { userData } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState<UserRole>('agent');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [invitationResult, setInvitationResult] = useState<InviteResult | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isValidEmail(email)) {
            setError('כתובת האימייל אינה תקינה');
            return;
        }

        if (phone && !isValidPhone(phone)) {
            setError('מספר הטלפון שהוזן אינו תקין');
            return;
        }

        if (!userData?.agencyId) {
            setError('לא ניתן לאמת את פרטי הסוכנות');
            return;
        }

        try {
            setLoading(true);
            const callInviteAgent = httpsCallable<InvitePayload, InviteResult>(
                functions,
                'users-inviteAgent'
            );

            const result = await callInviteAgent({
                email: email.trim().toLowerCase(),
                name: name.trim(),
                role,
                phone: phone.trim() || undefined,
                appUrl: window.location.origin,
            });

            setInvitationResult(result.data);

            // If phone was provided and CF returned a WhatsApp URL, open it automatically
            if (result.data.whatsappUrl) {
                window.open(result.data.whatsappUrl, '_blank', 'noopener,noreferrer');
            }
        } catch (err: any) {
            console.error('Failed to invite agent:', err);
            if (err?.code === 'functions/already-exists') {
                setError('סוכן עם כתובת מייל זו כבר קיים בצוות.');
            } else {
                setError('הזמנת הסוכן נכשלה. נסה שנית.');
            }
        } finally {
            setLoading(false);
        }
    };

    if (invitationResult) {
        const joinLink = `https://homer.management/join?token=${invitationResult.inviteToken || invitationResult.stubId}`;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    onClick={() => { onSuccess(); onClose(); }}
                />
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" dir="rtl">
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <UserPlus size={32} className="text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-2">ההזמנה נשלחה בהצלחה! 🎉</h2>
                        <p className="text-sm text-slate-500 mb-8">
                            שלחנו מייל ל-{email}. באפשרותך גם להעתיק את הקישור הישיר ולשלוח אותו ידנית.
                        </p>

                        <div className="space-y-4">
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-right">קישור הצטרפות</p>
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-2 pr-3">
                                    <span className="text-xs text-slate-500 truncate flex-1 block text-left" dir="ltr">{joinLink}</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(joinLink);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                        className={`p-2 rounded-lg transition-all ${copied ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400 hover:text-slate-600'}`}
                                    >
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                {invitationResult.whatsappUrl && (
                                    <button
                                        onClick={() => window.open(invitationResult.whatsappUrl, '_blank')}
                                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm flex items-center justify-center gap-2"
                                    >
                                        <ExternalLink size={18} />
                                        שלח בוואטסאפ
                                    </button>
                                )}
                                <button
                                    onClick={() => { onSuccess(); onClose(); }}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-sm"
                                >
                                    סגור
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <UserPlus size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">הזמן סוכן</h2>
                            <p className="text-xs text-slate-400">ישלח מייל + הודעת וואטסאפ (אם הוזן טלפון)</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            שם מלא <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            placeholder="ישראל ישראלי"
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white"
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            כתובת אימייל <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="agent@example.com"
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white"
                            dir="ltr"
                        />
                    </div>

                    {/* Phone (optional) */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            <span className="flex items-center gap-1">
                                <Phone size={11} />
                                מספר טלפון (לוואטסאפ)
                                <span className="font-normal text-slate-400">— אופציונלי</span>
                            </span>
                        </label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="050-0000000"
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white"
                            dir="ltr"
                        />
                        {phone && (
                            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                <span>✅</span> תפתח חלונית וואטסאפ עם הודעה מוכנה לשליחה
                            </p>
                        )}
                    </div>

                    {/* Role toggle */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            תפקיד
                        </label>
                        <div className="flex gap-3">
                            {(['agent', 'admin'] as UserRole[]).map((r) => (
                                <button
                                    type="button"
                                    key={r}
                                    onClick={() => setRole(r)}
                                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all ${role === r
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                        }`}
                                >
                                    {r === 'agent' ? 'סוכן' : 'מנהל'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                            {error}
                        </p>
                    )}

                    {/* Info box */}
                    <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
                        📧 הסוכן יקבל מייל מ<strong>hello@homer.management</strong> עם לינק להצטרפות
                        {phone && <span> + הודעת וואטסאפ עם הקישור</span>}.
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name || !email}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            {loading ? 'שולח...' : 'שלח הזמנה'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
