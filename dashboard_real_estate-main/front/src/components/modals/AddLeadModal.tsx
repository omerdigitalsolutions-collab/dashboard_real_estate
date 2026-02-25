import { useState } from 'react';
import { X, UserPlus, MapPin, DollarSign, Home, Zap, Car, Wind, Shield, Layers, Clock } from 'lucide-react';
import { addLead } from '../../services/leadService';
import { useAuth } from '../../context/AuthContext';
import { useAgents } from '../../hooks/useFirestoreData';
import { isValidPhone } from '../../utils/validation';

interface AddLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SOURCES = ['פייסבוק', 'גוגל', 'קמפיין', 'המלצה', 'אחר'];
const PROPERTY_KINDS = ['דירה', 'דירת גן', 'וילה', 'פנטהאוז', 'דופלקס', 'קוטג׳'];

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

const sectionCls = 'rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-3';
const sectionTitleCls = 'flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider mb-2';

export default function AddLeadModal({ isOpen, onClose }: AddLeadModalProps) {
    const { userData } = useAuth();
    const { data: agents } = useAgents();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [source, setSource] = useState('אחר');
    const [leadType, setLeadType] = useState<'buyer' | 'seller'>('buyer');

    // Internal Tabs
    const [activeFormTab, setActiveFormTab] = useState<'personal' | 'property'>('personal');

    // ── Requirements (Buyer) ──────────────────────────────────────────
    const [desiredCity, setDesiredCity] = useState('');
    const [maxBudget, setMaxBudget] = useState('');
    const [transactionType, setTransactionType] = useState<'sale' | 'rent'>('sale');
    const [urgency, setUrgency] = useState<'immediate' | '1-3_months' | '3-6_months' | 'flexible'>('flexible');

    const [minRooms, setMinRooms] = useState('');
    const [maxRooms, setMaxRooms] = useState('');
    const [minSizeSqf, setMinSizeSqf] = useState('');
    const [floorMin, setFloorMin] = useState('');
    const [floorMax, setFloorMax] = useState('');
    const [propertyKind, setPropertyKind] = useState<string[]>([]);

    const [mustHaveElevator, setMustHaveElevator] = useState(false);
    const [mustHaveParking, setMustHaveParking] = useState(false);
    const [mustHaveBalcony, setMustHaveBalcony] = useState(false);
    const [mustHaveSafeRoom, setMustHaveSafeRoom] = useState(false);

    const [condition, setCondition] = useState<'new' | 'renovated' | 'needs_renovation' | 'any'>('any');

    // ── Seller fields ─────────────────────────────────────────────────
    const [sellerAddress, setSellerAddress] = useState('');
    const [sellerPrice, setSellerPrice] = useState('');

    const [assignedTo, setAssignedTo] = useState('');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    if (!isOpen) return null;

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const resetForm = () => {
        setName(''); setPhone(''); setSource('אחר'); setLeadType('buyer'); setActiveFormTab('personal');
        setDesiredCity(''); setMaxBudget(''); setTransactionType('sale'); setUrgency('flexible');
        setMinRooms(''); setMaxRooms(''); setMinSizeSqf(''); setFloorMin(''); setFloorMax(''); setPropertyKind([]);
        setMustHaveElevator(false); setMustHaveParking(false); setMustHaveBalcony(false); setMustHaveSafeRoom(false);
        setCondition('any');
        setSellerAddress(''); setSellerPrice('');
        setAssignedTo('');
    };

    const togglePropertyKind = (kind: string) => {
        setPropertyKind(prev => prev.includes(kind) ? prev.filter(k => k !== kind) : [...prev, kind]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData?.agencyId) return;

        if (!isValidPhone(phone)) {
            showToast('מספר הטלפון שהוזן אינו תקין', false);
            return;
        }

        try {
            setLoading(true);
            if (leadType === 'buyer') {
                await addLead(userData.agencyId, {
                    name: name.trim(),
                    phone: phone.trim(),
                    source,
                    type: leadType,
                    assignedAgentId: assignedTo === '' ? null : assignedTo,
                    requirements: {
                        desiredCity: desiredCity ? desiredCity.trim().split(',').map(c => c.trim()).filter(Boolean) : [],
                        maxBudget: maxBudget ? parseFloat(maxBudget) : null,
                        minRooms: minRooms ? parseInt(minRooms) : null,
                        maxRooms: maxRooms ? parseInt(maxRooms) : null,
                        minSizeSqf: minSizeSqf ? parseInt(minSizeSqf) : null,
                        floorMin: floorMin ? parseInt(floorMin) : null,
                        floorMax: floorMax ? parseInt(floorMax) : null,
                        propertyType: propertyKind.length > 0 ? propertyKind : [transactionType],
                        mustHaveElevator,
                        mustHaveParking,
                        mustHaveBalcony,
                        mustHaveSafeRoom,
                        condition,
                        urgency,
                    },
                });
            } else {
                await addLead(userData.agencyId, {
                    name: name.trim(),
                    phone: phone.trim(),
                    source,
                    type: leadType,
                    assignedAgentId: assignedTo === '' ? null : assignedTo,
                    requirements: {
                        desiredCity: sellerAddress ? [sellerAddress.trim()] : [],
                        maxBudget: sellerPrice ? parseFloat(sellerPrice) : null,
                        minRooms: minRooms ? parseInt(minRooms) : null,
                        maxRooms: null,
                        minSizeSqf: null,
                        floorMin: null,
                        floorMax: null,
                        propertyType: [],
                        mustHaveElevator: false,
                        mustHaveParking: false,
                        mustHaveBalcony: false,
                        mustHaveSafeRoom: false,
                        condition: 'any',
                        urgency: 'flexible',
                    },
                });
            }
            showToast('הליד נוסף בהצלחה ✓');
            resetForm();
            setTimeout(onClose, 1200);
        } catch (err: any) {
            if (err?.code === 'permission-denied') {
                showToast('אין הרשאה להוסיף לידים', false);
            } else {
                showToast('אירעה שגיאה, נסה שנית', false);
            }
        } finally {
            setLoading(false);
        }
    };

    const MustHaveBtn = ({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) => (
        <button
            type="button"
            onClick={onClick}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${active
                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
        >
            <Icon size={16} />
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                            <UserPlus size={18} className="text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">הוסף ליד חדש</h2>
                            <p className="text-xs text-slate-400">ייכנס לפאנל הלידים מיידית</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {/* Lead Type Toggle */}
                        <div className="flex bg-slate-100 p-1 rounded-xl w-full">
                            <button
                                type="button"
                                onClick={() => { setLeadType('buyer'); setActiveFormTab('personal'); }}
                                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${leadType === 'buyer' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                קונה / שוכר
                            </button>
                            <button
                                type="button"
                                onClick={() => { setLeadType('seller'); setActiveFormTab('personal'); }}
                                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${leadType === 'seller' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                בעל נכס
                            </button>
                        </div>

                        {/* Internal Form Tabs */}
                        <div className="flex border-b border-slate-200">
                            <button
                                type="button"
                                onClick={() => setActiveFormTab('personal')}
                                className={`flex-1 pb-2.5 text-sm font-semibold transition-all border-b-2 ${activeFormTab === 'personal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                                פרטים אישיים
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveFormTab('property')}
                                className={`flex-1 pb-2.5 text-sm font-semibold transition-all border-b-2 ${activeFormTab === 'property' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                                {leadType === 'buyer' ? 'דרישות נכס' : 'פרטי נכס'}
                            </button>
                        </div>

                        {/* ─── TAB 1: PERSONAL DETAILS ─── */}
                        {activeFormTab === 'personal' && (
                            <div className="space-y-3.5">
                                <div>
                                    <label className={labelCls}>שם מלא <span className="text-red-500">*</span></label>
                                    <input value={name} onChange={e => setName(e.target.value)} required placeholder="ישראל ישראלי" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>טלפון <span className="text-red-500">*</span></label>
                                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="050-1234567" className={inputCls} dir="ltr" />
                                </div>
                                <div>
                                    <label className={labelCls}>שיוך לסוכן</label>
                                    <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={inputCls}>
                                        <option value="">ללא שיוך (כללי)</option>
                                        {agents.map(agent => (
                                            <option key={agent.uid || agent.id} value={agent.uid || ''}>
                                                {agent.name || agent.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>מקור הליד</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SOURCES.map(s => (
                                            <button
                                                type="button"
                                                key={s}
                                                onClick={() => setSource(s)}
                                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${source === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB 2A: PROPERTY DETAILS (BUYER) ─── */}
                        {activeFormTab === 'property' && leadType === 'buyer' && (
                            <div className="space-y-3">

                                {/* Section A: Location & Budget */}
                                <div className={sectionCls}>
                                    <div className={sectionTitleCls}>
                                        <MapPin size={12} className="text-blue-500" />
                                        מיקום ותקציב
                                    </div>
                                    <div>
                                        <label className={labelCls}>אזורים מבוקשים (מופרד בפסיקים)</label>
                                        <input value={desiredCity} onChange={e => setDesiredCity(e.target.value)} placeholder="תל אביב, רמת גן, גבעתיים" className={inputCls} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>סוג עסקה</label>
                                            <div className="flex gap-1.5">
                                                {['sale', 'rent'].map(t => (
                                                    <button key={t} type="button" onClick={() => setTransactionType(t as 'sale' | 'rent')}
                                                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${transactionType === t ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                                                        {t === 'sale' ? 'קנייה' : 'שכירות'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className={labelCls}>תקציב מקסימלי (₪)</label>
                                            <input type="number" min="0" step="50000" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} placeholder="2,500,000" className={inputCls} dir="ltr" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelCls}>
                                            <Clock size={10} className="inline ml-1" />
                                            דחיפות
                                        </label>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {[
                                                { val: 'immediate', label: '⚡ מיידי' },
                                                { val: '1-3_months', label: '1–3 חודשים' },
                                                { val: '3-6_months', label: '3–6 חודשים' },
                                                { val: 'flexible', label: 'גמיש' },
                                            ].map(({ val, label }) => (
                                                <button key={val} type="button" onClick={() => setUrgency(val as typeof urgency)}
                                                    className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${urgency === val ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Section B: Property Specs */}
                                <div className={sectionCls}>
                                    <div className={sectionTitleCls}>
                                        <Home size={12} className="text-emerald-500" />
                                        מאפייני הנכס
                                    </div>
                                    <div>
                                        <label className={labelCls}>סוג נכס</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {PROPERTY_KINDS.map(k => (
                                                <button key={k} type="button" onClick={() => togglePropertyKind(k)}
                                                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${propertyKind.includes(k) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                                                    {k}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>חדרים (מין׳)</label>
                                            <select value={minRooms} onChange={e => setMinRooms(e.target.value)} className={inputCls}>
                                                <option value="">ללא הגבלה</option>
                                                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}{n === 6 ? '+' : ''}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelCls}>חדרים (מקס׳)</label>
                                            <select value={maxRooms} onChange={e => setMaxRooms(e.target.value)} className={inputCls}>
                                                <option value="">ללא הגבלה</option>
                                                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}{n === 6 ? '+' : ''}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelCls}>שטח מינימלי (מ"ר)</label>
                                            <input type="number" min="0" step="5" value={minSizeSqf} onChange={e => setMinSizeSqf(e.target.value)} placeholder="70" className={inputCls} dir="ltr" />
                                        </div>
                                        <div>
                                            <label className={labelCls}>קומה</label>
                                            <div className="flex gap-1.5 items-center">
                                                <input type="number" min="0" max="50" value={floorMin} onChange={e => setFloorMin(e.target.value)} placeholder="מין׳" className={inputCls + ' text-center'} dir="ltr" />
                                                <span className="text-slate-400 text-xs flex-shrink-0">—</span>
                                                <input type="number" min="0" max="50" value={floorMax} onChange={e => setFloorMax(e.target.value)} placeholder="מקס׳" className={inputCls + ' text-center'} dir="ltr" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section C: Must-Haves */}
                                <div className={sectionCls}>
                                    <div className={sectionTitleCls}>
                                        <Zap size={12} className="text-purple-500" />
                                        חובה בנכס
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <MustHaveBtn icon={Layers} label="מעלית" active={mustHaveElevator} onClick={() => setMustHaveElevator(p => !p)} />
                                        <MustHaveBtn icon={Car} label="חניה" active={mustHaveParking} onClick={() => setMustHaveParking(p => !p)} />
                                        <MustHaveBtn icon={Wind} label="מרפסת" active={mustHaveBalcony} onClick={() => setMustHaveBalcony(p => !p)} />
                                        <MustHaveBtn icon={Shield} label='ממ"ד' active={mustHaveSafeRoom} onClick={() => setMustHaveSafeRoom(p => !p)} />
                                    </div>
                                </div>

                                {/* Section D: Condition */}
                                <div className={sectionCls}>
                                    <div className={sectionTitleCls}>
                                        <DollarSign size={12} className="text-orange-500" />
                                        מצב הנכס
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {[
                                            { val: 'any', label: 'לא משנה' },
                                            { val: 'new', label: '⭐ חדש מקבלן' },
                                            { val: 'renovated', label: '✨ משופץ' },
                                            { val: 'needs_renovation', label: '🔨 דורש שיפוץ' },
                                        ].map(({ val, label }) => (
                                            <button key={val} type="button" onClick={() => setCondition(val as typeof condition)}
                                                className={`py-2 text-xs font-semibold rounded-lg border transition-all ${condition === val ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB 2B: PROPERTY DETAILS (SELLER) ─── */}
                        {activeFormTab === 'property' && leadType === 'seller' && (
                            <div className="space-y-3.5">
                                <div>
                                    <label className={labelCls}>כתובת הנכס</label>
                                    <input value={sellerAddress} onChange={e => setSellerAddress(e.target.value)} placeholder="הרצל 15, תל אביב" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>מחיר מבוקש (₪)</label>
                                    <input type="number" min="0" step="50000" value={sellerPrice} onChange={e => setSellerPrice(e.target.value)} placeholder="2,500,000" className={inputCls} dir="ltr" />
                                </div>
                                <div>
                                    <label className={labelCls}>מספר חדרים</label>
                                    <select value={minRooms} onChange={e => setMinRooms(e.target.value)} className={inputCls}>
                                        <option value="">לא מוגדר</option>
                                        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}{n === 6 ? '+' : ''} חדרים</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer (fixed at bottom) */}
                    <div className="flex-shrink-0 px-6 pb-5 pt-3 border-t border-slate-100 space-y-3">
                        {toast && (
                            <div className={`text-xs font-medium px-4 py-3 rounded-xl border ${toast.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                {toast.msg}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                ביטול
                            </button>
                            <button type="submit" disabled={loading || !name || !phone} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                                {loading ? 'שומר...' : 'הוסף ליד'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
