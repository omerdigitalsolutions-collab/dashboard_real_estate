import { useState } from 'react';
import { X, UserCog, Loader2, MapPin, Plus } from 'lucide-react';
import { updateUserProfile } from '../../services/userService';
import { AppUser, UserRole, AgentSpecialization } from '../../types';
import { isValidEmail, isValidPhone } from '../../utils/validation';

interface EditAgentModalProps {
    agent: AppUser;
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (msg: string) => void;
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

const SPECIALIZATION_OPTIONS: { val: AgentSpecialization; label: string; emoji: string; color: string }[] = [
    { val: 'sale', label: 'מכירה', emoji: '🏡', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
    { val: 'rent', label: 'השכרה', emoji: '🔑', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
    { val: 'commercial', label: 'מסחרי', emoji: '🏢', color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
];

export default function EditAgentModal({ agent, isOpen, onClose, onSuccess }: EditAgentModalProps) {
    const [name, setName] = useState(agent.name);
    const [phone, setPhone] = useState(agent.phone ?? '');
    const [email, setEmail] = useState(agent.email);
    const [role, setRole] = useState<UserRole>(agent.role);
    const [specializations, setSpecializations] = useState<AgentSpecialization[]>(agent.specializations ?? []);
    const [serviceAreas, setServiceAreas] = useState<string[]>(agent.serviceAreas ?? []);
    const [areaInput, setAreaInput] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const toggleSpecialization = (val: AgentSpecialization) => {
        setSpecializations(prev =>
            prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]
        );
    };

    const addArea = () => {
        const trimmed = areaInput.trim();
        if (!trimmed || serviceAreas.includes(trimmed)) { setAreaInput(''); return; }
        setServiceAreas(prev => [...prev, trimmed]);
        setAreaInput('');
    };

    const removeArea = (area: string) => {
        setServiceAreas(prev => prev.filter(a => a !== area));
    };

    const handleSubmit = async (e: React.FormEvent) => {
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
                specializations,
                serviceAreas,
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
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
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

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Basic Details */}
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

                    {/* ─── Specializations ─── */}
                    <div className="pt-1 border-t border-slate-100">
                        <label className={labelCls + ' mb-2'}>
                            תחום התמחות
                            <span className="text-slate-400 font-normal mr-1">— לבחור אחד או יותר</span>
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {SPECIALIZATION_OPTIONS.map(opt => {
                                const active = specializations.includes(opt.val);
                                return (
                                    <button
                                        key={opt.val}
                                        type="button"
                                        onClick={() => toggleSpecialization(opt.val)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${active
                                            ? opt.color + ' shadow-sm ring-1 ring-inset ring-current/20'
                                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                            }`}
                                    >
                                        <span>{opt.emoji}</span>
                                        {opt.label}
                                        {active && <span className="text-[10px] font-bold opacity-70">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ─── Service Areas ─── */}
                    <div>
                        <label className={labelCls + ' flex items-center gap-1'}>
                            <MapPin size={12} className="text-slate-400" />
                            אזורי התמחות
                            <span className="text-slate-400 font-normal mr-1">— ערים / שכונות</span>
                        </label>

                        {/* Existing areas as chips */}
                        {serviceAreas.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {serviceAreas.map(area => (
                                    <span key={area} className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full text-xs font-semibold">
                                        {area}
                                        <button
                                            type="button"
                                            onClick={() => removeArea(area)}
                                            className="text-violet-400 hover:text-red-500 transition-colors leading-none"
                                        >×</button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Add new area */}
                        <div className="flex gap-2">
                            <input
                                value={areaInput}
                                onChange={e => setAreaInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
                                placeholder="הוסף עיר או שכונה..."
                                className={inputCls + ' flex-1'}
                            />
                            <button
                                type="button"
                                onClick={addArea}
                                disabled={!areaInput.trim()}
                                className="px-3 py-2 rounded-xl bg-violet-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-violet-700 transition-colors flex items-center"
                            >
                                <Plus size={16} />
                            </button>
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
