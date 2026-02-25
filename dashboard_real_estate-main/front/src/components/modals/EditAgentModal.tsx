import { useState } from 'react';
import { X, UserCog, Loader2 } from 'lucide-react';
import { updateUserProfile } from '../../services/userService';
import { AppUser, UserRole } from '../../types';
import { isValidEmail, isValidPhone } from '../../utils/validation';

interface EditAgentModalProps {
    agent: AppUser;
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (msg: string) => void;
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function EditAgentModal({ agent, isOpen, onClose, onSuccess }: EditAgentModalProps) {
    const [name, setName] = useState(agent.name);
    const [phone, setPhone] = useState(agent.phone ?? '');
    const [email, setEmail] = useState(agent.email);
    const [role, setRole] = useState<UserRole>(agent.role);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.preventDefault();
        setError('');
        if (!name.trim()) { setError('שם הסוכן הוא שדה חובה'); return; }

        if (email && !isValidEmail(email)) { setError('כתובת האימייל אינה תקינה'); return; }
        if (phone && !isValidPhone(phone)) { setError('מספר הטלפון אינו תקין'); return; }

        setLoading(true);
        try {
            const docId = agent.id || agent.uid;
            if (!docId) throw new Error('מזהה סוכן חסר');
            await updateUserProfile(docId, {
                name: name.trim(),
                phone: phone.trim() || undefined,
                email: email.trim(),
                role,
            });
            onSuccess?.('פרטי הסוכן עודכנו בהצלחה ✓');
            onClose();
        } catch (err: any) {
            setError(err?.message || 'שגיאה בעדכון פרטי הסוכן');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
                            <UserCog size={18} className="text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">עריכת פרטי סוכן</h2>
                            <p className="text-xs text-slate-400">{agent.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className={labelCls}>שם מלא <span className="text-red-500">*</span></label>
                        <input value={name} onChange={e => setName(e.target.value)} required placeholder="ישראל ישראלי" className={inputCls} />
                    </div>

                    <div>
                        <label className={labelCls}>טלפון</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-1234567" className={inputCls} dir="ltr" />
                    </div>

                    <div>
                        <label className={labelCls}>אימייל</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="agent@example.com" className={inputCls} dir="ltr" />
                    </div>

                    <div>
                        <label className={labelCls}>הרשאה</label>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            {[{ val: 'agent' as UserRole, label: 'סוכן' }, { val: 'admin' as UserRole, label: 'מנהל' }].map(r => (
                                <button key={r.val} type="button" onClick={() => setRole(r.val)}
                                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${role === r.val ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >{r.label}</button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="text-xs font-medium px-4 py-3 rounded-xl border bg-red-50 text-red-600 border-red-100">{error}</div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                            ביטול
                        </button>
                        <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2">
                            {loading ? <><Loader2 size={16} className="animate-spin" />שומר...</> : 'שמור פרטים'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
