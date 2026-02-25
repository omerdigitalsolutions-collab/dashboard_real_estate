import { useState } from 'react';
import { X, PenLine, MapPin, DollarSign, Home, Zap, Car, Wind, Shield, Layers, Clock, Loader2 } from 'lucide-react';
import { updateLead } from '../../services/leadService';
import { useAgents } from '../../hooks/useFirestoreData';
import { Lead } from '../../types';
import { isValidPhone } from '../../utils/validation';

interface EditLeadModalProps {
    lead: Lead;
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (msg: string) => void;
}

const SOURCES = ['פייסבוק', 'גוגל', 'קמפיין', 'המלצה', 'אחר'];
const PROPERTY_KINDS = ['דירה', 'דירת גן', 'וילה', 'פנטהאוז', 'דופלקס', 'קוטג׳'];

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';
const sectionCls = 'rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-3';
const sectionTitleCls = 'flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider mb-2';

export default function EditLeadModal({ lead, isOpen, onClose, onSuccess }: EditLeadModalProps) {
    const { data: agents } = useAgents();

    // Personal details
    const [name, setName] = useState(lead.name);
    const [phone, setPhone] = useState(lead.phone);
    const [source, setSource] = useState(lead.source || 'אחר');
    const [assignedTo, setAssignedTo] = useState(lead.assignedAgentId ?? '');
    const [status, setStatus] = useState(lead.status);

    // Tabs
    const [activeFormTab, setActiveFormTab] = useState<'personal' | 'property'>('personal');
    const leadType = lead.type || 'buyer';

    // Buyer requirements
    const [desiredCity, setDesiredCity] = useState(lead.requirements?.desiredCity?.join(', ') ?? '');
    const [maxBudget, setMaxBudget] = useState(lead.requirements?.maxBudget?.toString() ?? '');
    const [transactionType, setTransactionType] = useState<'sale' | 'rent'>(
        lead.requirements?.propertyType?.includes('rent') ? 'rent' : 'sale'
    );
    const [urgency, setUrgency] = useState(lead.requirements?.urgency ?? 'flexible');
    const [minRooms, setMinRooms] = useState(lead.requirements?.minRooms?.toString() ?? '');
    const [maxRooms, setMaxRooms] = useState(lead.requirements?.maxRooms?.toString() ?? '');
    const [minSizeSqf, setMinSizeSqf] = useState(lead.requirements?.minSizeSqf?.toString() ?? '');
    const [floorMin, setFloorMin] = useState(lead.requirements?.floorMin?.toString() ?? '');
    const [floorMax, setFloorMax] = useState(lead.requirements?.floorMax?.toString() ?? '');
    const [propertyKind, setPropertyKind] = useState<string[]>(lead.requirements?.propertyType ?? []);
    const [mustHaveElevator, setMustHaveElevator] = useState(lead.requirements?.mustHaveElevator ?? false);
    const [mustHaveParking, setMustHaveParking] = useState(lead.requirements?.mustHaveParking ?? false);
    const [mustHaveBalcony, setMustHaveBalcony] = useState(lead.requirements?.mustHaveBalcony ?? false);
    const [mustHaveSafeRoom, setMustHaveSafeRoom] = useState(lead.requirements?.mustHaveSafeRoom ?? false);
    const [condition, setCondition] = useState(lead.requirements?.condition ?? 'any');

    // Seller
    const [sellerAddress, setSellerAddress] = useState(
        leadType === 'seller' ? (lead.requirements?.desiredCity?.[0] ?? '') : ''
    );
    const [sellerPrice, setSellerPrice] = useState(
        leadType === 'seller' ? (lead.requirements?.maxBudget?.toString() ?? '') : ''
    );

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const togglePropertyKind = (kind: string) =>
        setPropertyKind(prev => prev.includes(kind) ? prev.filter(k => k !== kind) : [...prev, kind]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (phone && !isValidPhone(phone)) {
            setError('מספר הטלפון שהוזן אינו תקין');
            return;
        }

        setLoading(true);
        try {
            const updates: Partial<Lead> = {
                name: name.trim(),
                phone: phone.trim(),
                source,
                status,
                assignedAgentId: assignedTo === '' ? null : assignedTo,
            };

            if (leadType === 'buyer') {
                updates.requirements = {
                    desiredCity: desiredCity ? desiredCity.split(',').map(c => c.trim()).filter(Boolean) : [],
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
                    condition: condition as any,
                    urgency: urgency as any,
                };
            } else {
                updates.requirements = {
                    desiredCity: sellerAddress ? [sellerAddress.trim()] : [],
                    maxBudget: sellerPrice ? parseFloat(sellerPrice) : null,
                    minRooms: minRooms ? parseInt(minRooms) : null,
                    maxRooms: null, minSizeSqf: null, floorMin: null, floorMax: null,
                    propertyType: [], mustHaveElevator: false, mustHaveParking: false,
                    mustHaveBalcony: false, mustHaveSafeRoom: false, condition: 'any', urgency: 'flexible',
                };
            }

            await updateLead(lead.id, updates);
            onSuccess?.('הליד עודכן בהצלחה ✓');
            onClose();
        } catch (err: any) {
            setError(err?.message || 'שגיאה בעדכון הליד');
        } finally {
            setLoading(false);
        }
    };

    const MustHaveBtn = ({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) => (
        <button type="button" onClick={onClick}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${active
                ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}>
            <Icon size={16} />{label}
        </button>
    );

    const STATUS_OPTIONS = [
        { val: 'new', label: 'חדש' },
        { val: 'contacted', label: 'בטיפול' },
        { val: 'meeting_set', label: 'נקבעה פגישה' },
        { val: 'won', label: 'נסגר הדיל' },
        { val: 'lost', label: 'אבוד' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <PenLine size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">עריכת ליד</h2>
                            <p className="text-xs text-slate-400">{lead.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {/* Tabs */}
                        <div className="flex border-b border-slate-200">
                            {[{ key: 'personal', label: 'פרטים אישיים' }, { key: 'property', label: leadType === 'buyer' ? 'דרישות נכס' : 'פרטי נכס' }].map(tab => (
                                <button key={tab.key} type="button"
                                    onClick={() => setActiveFormTab(tab.key as any)}
                                    className={`flex-1 pb-2.5 text-sm font-semibold transition-all border-b-2 ${activeFormTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >{tab.label}</button>
                            ))}
                        </div>

                        {/* ─── TAB 1: PERSONAL ─── */}
                        {activeFormTab === 'personal' && (
                            <div className="space-y-3.5">
                                <div>
                                    <label className={labelCls}>שם מלא <span className="text-red-500">*</span></label>
                                    <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>טלפון <span className="text-red-500">*</span></label>
                                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required className={inputCls} dir="ltr" />
                                </div>
                                <div>
                                    <label className={labelCls}>סטטוס</label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {STATUS_OPTIONS.map(s => (
                                            <button key={s.val} type="button" onClick={() => setStatus(s.val as any)}
                                                className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${status === s.val ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                            >{s.label}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>שיוך לסוכן</label>
                                    <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={inputCls}>
                                        <option value="">ללא שיוך</option>
                                        {agents.map(a => <option key={a.uid || a.id} value={a.uid || ''}>{a.name || a.email}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>מקור הליד</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SOURCES.map(s => (
                                            <button type="button" key={s} onClick={() => setSource(s)}
                                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${source === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                            >{s}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB 2A: BUYER REQUIREMENTS ─── */}
                        {activeFormTab === 'property' && leadType === 'buyer' && (
                            <div className="space-y-3">
                                <div className={sectionCls}>
                                    <div className={sectionTitleCls}><MapPin size={12} className="text-blue-500" />מיקום ותקציב</div>
                                    <div>
                                        <label className={labelCls}>אזורים מבוקשים (מופרד בפסיקים)</label>
                                        <input value={desiredCity} onChange={e => setDesiredCity(e.target.value)} placeholder="תל אביב, רמת גן" className={inputCls} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>סוג עסקה</label>
                                            <div className="flex gap-1.5">
                                                {['sale', 'rent'].map(t => (
                                                    <button key={t} type="button" onClick={() => setTransactionType(t as any)}
                                                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${transactionType === t ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200'}`}
                                                    >{t === 'sale' ? 'קנייה' : 'שכירות'}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className={labelCls}>תקציב מקסימלי (₪)</label>
                                            <input type="number" min="0" step="50000" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} placeholder="2,500,000" className={inputCls} dir="ltr" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelCls}><Clock size={10} className="inline ml-1" />דחיפות</label>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {[{ val: 'immediate', label: '⚡ מיידי' }, { val: '1-3_months', label: '1–3 חודשים' }, { val: '3-6_months', label: '3–6 חודשים' }, { val: 'flexible', label: 'גמיש' }].map(({ val, label }) => (
                                                <button key={val} type="button" onClick={() => setUrgency(val as any)}
                                                    className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${urgency === val ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                                >{label}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className={sectionCls}>
                                    <div className={sectionTitleCls}><Home size={12} className="text-emerald-500" />מאפייני הנכס</div>
                                    <div>
                                        <label className={labelCls}>סוג נכס</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {PROPERTY_KINDS.map(k => (
                                                <button key={k} type="button" onClick={() => togglePropertyKind(k)}
                                                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${propertyKind.includes(k) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                                >{k}</button>
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
                                <div className={sectionCls}>
                                    <div className={sectionTitleCls}><Zap size={12} className="text-purple-500" />חובה בנכס</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <MustHaveBtn icon={Layers} label="מעלית" active={mustHaveElevator} onClick={() => setMustHaveElevator(p => !p)} />
                                        <MustHaveBtn icon={Car} label="חניה" active={mustHaveParking} onClick={() => setMustHaveParking(p => !p)} />
                                        <MustHaveBtn icon={Wind} label="מרפסת" active={mustHaveBalcony} onClick={() => setMustHaveBalcony(p => !p)} />
                                        <MustHaveBtn icon={Shield} label='ממ"ד' active={mustHaveSafeRoom} onClick={() => setMustHaveSafeRoom(p => !p)} />
                                    </div>
                                </div>
                                <div className={sectionCls}>
                                    <div className={sectionTitleCls}><DollarSign size={12} className="text-orange-500" />מצב הנכס</div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {[{ val: 'any', label: 'לא משנה' }, { val: 'new', label: '⭐ חדש' }, { val: 'renovated', label: '✨ משופץ' }, { val: 'needs_renovation', label: '🔨 דורש שיפוץ' }].map(({ val, label }) => (
                                            <button key={val} type="button" onClick={() => setCondition(val as any)}
                                                className={`py-2 text-xs font-semibold rounded-lg border transition-all ${condition === val ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                            >{label}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB 2B: SELLER ─── */}
                        {activeFormTab === 'property' && leadType === 'seller' && (
                            <div className="space-y-3.5">
                                <div>
                                    <label className={labelCls}>כתובת הנכס</label>
                                    <input value={sellerAddress} onChange={e => setSellerAddress(e.target.value)} placeholder="הרצל 15, תל אביב" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>מחיר מבוקש (₪)</label>
                                    <input type="number" min="0" step="50000" value={sellerPrice} onChange={e => setSellerPrice(e.target.value)} className={inputCls} dir="ltr" />
                                </div>
                                <div>
                                    <label className={labelCls}>מספר חדרים</label>
                                    <select value={minRooms} onChange={e => setMinRooms(e.target.value)} className={inputCls}>
                                        <option value="">לא מוגדר</option>
                                        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} חדרים</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex-shrink-0 px-6 pb-5 pt-3 border-t border-slate-100 space-y-3">
                        {error && (
                            <div className="text-xs font-medium px-4 py-3 rounded-xl border bg-red-50 text-red-600 border-red-100">{error}</div>
                        )}
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                ביטול
                            </button>
                            <button type="submit" disabled={loading || !name || !phone} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center gap-2">
                                {loading ? <><Loader2 size={16} className="animate-spin" />שומר...</> : 'שמור שינויים'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
