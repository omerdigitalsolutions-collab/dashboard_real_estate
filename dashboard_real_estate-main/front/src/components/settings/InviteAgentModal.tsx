import { useState } from 'react';
import { X, UserPlus, Phone, Copy, Check, Mail, MessageSquare } from 'lucide-react';
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
    email?: string;
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
    smsUrl?: string;
}

export default function InviteAgentModal({ onClose, onSuccess }: InviteAgentModalProps) {
    const { userData } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState<UserRole>('agent');
    const [loadingEmail, setLoadingEmail] = useState(false);
    const [loadingSms, setLoadingSms] = useState(false);
    const [error, setError] = useState('');
    const [invitationResult, setInvitationResult] = useState<InviteResult | null>(null);
    const [copied, setCopied] = useState(false);

    const callInviteAgent = httpsCallable<InvitePayload, InviteResult>(
        functions,
        'users-inviteAgent'
    );

    const handleSendEmail = async () => {
        setError('');
        if (!name.trim()) { setError('יש להזין שם מלא'); return; }
        if (!isValidEmail(email)) { setError('כתובת האימייל אינה תקינה'); return; }
        if (!userData?.agencyId) { setError('לא ניתן לאמת את פרטי הסוכנות'); return; }

        try {
            setLoadingEmail(true);
            const result = await callInviteAgent({
                email: email.trim().toLowerCase(),
                name: name.trim(),
                role,
                phone: phone.trim() || undefined,
                appUrl: window.location.origin,
            });
            setInvitationResult(result.data);
        } catch (err: any) {
            console.error('Failed to invite agent:', err);
            if (err?.code === 'functions/already-exists') {
                setError('סוכן עם כתובת מייל זו כבר קיים בצוות.');
            } else {
                setError('הזמנת הסוכן נכשלה. נסה שנית.');
            }
        } finally {
            setLoadingEmail(false);
        }
    };

    const handleSendSms = async () => {
        setError('');
        if (!name.trim()) { setError('יש להזין שם מלא'); return; }
        if (!isValidPhone(phone)) { setError('מספר הטלפון שהוזן אינו תקין'); return; }
        if (!userData?.agencyId) { setError('לא ניתן לאמת את פרטי הסוכנות'); return; }

        try {
            setLoadingSms(true);
            const result = await callInviteAgent({
                email: email.trim() ? email.trim().toLowerCase() : undefined,
                name: name.trim(),
                role,
                phone: phone.trim(),
                appUrl: window.location.origin,
            });
            setInvitationResult(result.data);
            if (result.data.smsUrl) {
                window.open(result.data.smsUrl, '_blank', 'noopener,noreferrer');
            }
        } catch (err: any) {
            console.error('Failed to invite agent:', err);
            if (err?.code === 'functions/already-exists') {
                setError('סוכן עם כתובת מייל זו כבר קיים בצוות.');
            } else {
                setError('הזמנת הסוכן נכשלה. נסה שנית.');
            }
        } finally {
            setLoadingSms(false);
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
                        <h2 className="text-xl font-bold text-slate-900 mb-2">ההזמנה נוצרה בהצלחה! 🎉</h2>
                        <p className="text-sm text-slate-500 mb-8">
                            העתק את הקישור ושלח אותו לסוכן ידנית, או השתמש בכפתורים למטה.
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
                                        <MessageSquare size={16} />
                                        וואטסאפ
                                    </button>
                                )}
                                {invitationResult.smsUrl && (
                                    <button
                                        onClick={() => window.open(invitationResult.smsUrl, '_blank')}
                                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm flex items-center justify-center gap-2"
                                    >
                                        <Phone size={16} />
                                        SMS
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

    const isLoading = loadingEmail || loadingSms;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <UserPlus size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">הזמן סוכן</h2>
                            <p className="text-xs text-slate-400">שלח לינק הצטרפות במייל או SMS</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            שם מלא <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="ישראל ישראלי"
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white"
                        />
                    </div>

                    {/* Email + send button */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            כתובת אימייל
                            <span className="font-normal text-slate-400 mr-1">— אופציונלי</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="agent@example.com"
                                className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white"
                                dir="ltr"
                            />
                            <button
                                type="button"
                                onClick={handleSendEmail}
                                disabled={isLoading || !name.trim() || !email.trim()}
                                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap"
                            >
                                {loadingEmail ? (
                                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Mail size={15} />
                                )}
                                שלח מייל
                            </button>
                        </div>
                    </div>

                    {/* Phone + send SMS button */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            <span className="flex items-center gap-1">
                                <Phone size={11} />
                                מספר טלפון
                                <span className="font-normal text-slate-400">— אופציונלי</span>
                            </span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="050-0000000"
                                className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white"
                                dir="ltr"
                            />
                            <button
                                type="button"
                                onClick={handleSendSms}
                                disabled={isLoading || !name.trim() || !phone.trim()}
                                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap"
                            >
                                {loadingSms ? (
                                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <MessageSquare size={15} />
                                )}
                                שלח SMS
                            </button>
                        </div>
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

                    <div className="pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                            ביטול
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
