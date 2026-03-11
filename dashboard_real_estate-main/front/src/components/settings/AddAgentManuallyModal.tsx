import { useState } from 'react';
import { X, UserPlus, Copy, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { addAgentManually } from '../../services/teamService';
import { isValidPhone } from '../../utils/validation';

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function AddAgentManuallyModal({ onClose, onSuccess }: Props) {
    const { userData } = useAuth();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState<UserRole>('agent');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [joinLink, setJoinLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!name.trim()) {
            setError('יש להזין שם מלא');
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
            const stubId = await addAgentManually(userData.agencyId, { name, phone, role });
            const link = `https://homer.management/join?token=${stubId}`;
            setJoinLink(link);
        } catch (err: any) {
            console.error('Failed to add agent manually:', err);
            setError('אירעה שגיאה בהוספת הסוכן. נסה שנית.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!joinLink) return;
        navigator.clipboard.writeText(joinLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleWhatsApp = () => {
        if (!joinLink || !phone) return;
        const digits = phone.replace(/\D/g, '');
        const intl = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
        const msg = encodeURIComponent(
            `שלום ${name.trim()}! 👋\nהוזמנת להצטרף לסוכנות שלנו.\nלחץ על הקישור כדי להצטרף: ${joinLink}`
        );
        window.open(`https://wa.me/${intl}?text=${msg}`, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                            <UserPlus size={18} className="text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">הוסף סוכן ידנית</h2>
                            <p className="text-xs text-slate-400">ללא שליחת מייל — תשלח קישור בעצמך</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Success state */}
                {joinLink ? (
                    <div className="p-6 space-y-4">
                        <div className="bg-emerald-50 rounded-xl p-4 text-center">
                            <p className="text-2xl mb-1">✅</p>
                            <p className="text-sm font-bold text-emerald-800">הסוכן <span className="text-emerald-700">{name}</span> נוסף בהצלחה!</p>
                            <p className="text-xs text-emerald-600 mt-1">שלח לו את הקישור הבא כדי שיצטרף למערכת</p>
                        </div>

                        <div>
                            <label className={labelCls}>קישור הצטרפות</label>
                            <div className="flex gap-2">
                                <input
                                    readOnly
                                    value={joinLink}
                                    className={inputCls + ' flex-1 text-xs font-mono select-all'}
                                    dir="ltr"
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                />
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors flex-shrink-0 flex items-center gap-1 ${copied ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? 'הועתק!' : 'העתק'}
                                </button>
                            </div>
                        </div>

                        {phone && (
                            <button
                                type="button"
                                onClick={handleWhatsApp}
                                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1EB856] text-white text-sm font-bold py-3 rounded-xl transition-colors shadow-sm"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                שלח ב-WhatsApp
                            </button>
                        )}

                        <div className="flex gap-3 pt-1">
                            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                סגור
                            </button>
                            <button type="button" onClick={() => { setJoinLink(null); setName(''); setPhone(''); setRole('agent'); onSuccess(); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm">
                                הוסף עוד סוכן
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Form state */
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div>
                            <label className={labelCls}>שם מלא <span className="text-red-500">*</span></label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="ישראל ישראלי" className={inputCls} />
                        </div>

                        <div>
                            <label className={labelCls}>מספר טלפון <span className="text-slate-400 font-normal">— אופציונלי</span></label>
                            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-0000000" className={inputCls} dir="ltr" />
                        </div>

                        <div>
                            <label className={labelCls}>תפקיד</label>
                            <div className="flex gap-3">
                                {(['agent', 'admin'] as UserRole[]).map(r => (
                                    <button
                                        type="button"
                                        key={r}
                                        onClick={() => setRole(r)}
                                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all ${role === r ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        {r === 'agent' ? 'סוכן' : 'מנהל'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">{error}</p>
                        )}

                        <div className="bg-amber-50 rounded-xl px-4 py-3 text-xs text-amber-700 leading-relaxed">
                            💡 הסוכן ייווסף לרשימה כ"ממתין לחיבור". לאחר ההוספה תקבל קישור שתוכל לשלוח לו ידנית. הסוכן יצטרך להתחבר דרך הקישור עם חשבון Google.
                        </div>

                        <div className="flex gap-3 pt-1">
                            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                ביטול
                            </button>
                            <button type="submit" disabled={loading || !name.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                                {loading ? 'מוסיף...' : 'הוסף סוכן'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
