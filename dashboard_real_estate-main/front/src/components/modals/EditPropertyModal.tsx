import { useState } from 'react';
import { X, Building2, Loader2 } from 'lucide-react';
import { updateProperty } from '../../services/propertyService';
import { useAgents } from '../../hooks/useFirestoreData';
import { Property } from '../../types';

interface EditPropertyModalProps {
    property: Property;
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (msg: string) => void;
}

const PROPERTY_KINDS = ['דירה', 'דירת גן', 'וילה', 'פנטהאוז', 'דופלקס', 'קוטג׳', 'מסחרי', 'קרקע'];
const STATUS_OPTIONS = [
    { val: 'active', label: 'פעיל' },
    { val: 'pending', label: 'ממתין' },
    { val: 'sold', label: 'נמכר' },
    { val: 'rented', label: 'הושכר' },
    { val: 'withdrawn', label: 'הוסר' },
];

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function EditPropertyModal({ property, isOpen, onClose, onSuccess }: EditPropertyModalProps) {
    const { data: agents } = useAgents();

    const [address, setAddress] = useState(property.address);
    const [city, setCity] = useState(property.city ?? '');
    const [type, setType] = useState<'sale' | 'rent'>(property.type);
    const [kind, setKind] = useState(property.kind ?? '');
    const [price, setPrice] = useState(property.price.toString());
    const [rooms, setRooms] = useState(property.rooms?.toString() ?? '');
    const [status, setStatus] = useState(property.status);
    const [agentId, setAgentId] = useState(property.agentId ?? '');
    const [description, setDescription] = useState(property.description ?? '');
    const [isExclusive, setIsExclusive] = useState(property.isExclusive ?? false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const parsedPrice = parseFloat(price);
        if (!address.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
            setError('יש למלא כתובת ומחיר תקין');
            return;
        }

        setLoading(true);
        try {
            await updateProperty(property.id, {
                address: address.trim(),
                city: city.trim(),
                type,
                kind,
                price: parsedPrice,
                rooms: rooms ? parseFloat(rooms) : undefined,
                status,
                agentId: agentId || property.agentId,
                description: description.trim() || undefined,
                isExclusive,
            });
            onSuccess?.('הנכס עודכן בהצלחה ✓');
            onClose();
        } catch (err: any) {
            setError(err?.message || 'שגיאה בעדכון הנכס');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <Building2 size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">עריכת נכס</h2>
                            <p className="text-xs text-slate-400">{property.address}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                        {/* Type toggle */}
                        <div>
                            <label className={labelCls}>סוג עסקה</label>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                {[{ val: 'sale', label: 'למכירה' }, { val: 'rent', label: 'להשכרה' }].map(t => (
                                    <button key={t.val} type="button" onClick={() => setType(t.val as 'sale' | 'rent')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${type === t.val ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >{t.label}</button>
                                ))}
                            </div>
                        </div>

                        {/* Address + City */}
                        <div>
                            <label className={labelCls}>כתובת <span className="text-red-500">*</span></label>
                            <input value={address} onChange={e => setAddress(e.target.value)} required placeholder="הרצל 15" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>עיר</label>
                            <input value={city} onChange={e => setCity(e.target.value)} placeholder="תל אביב" className={inputCls} />
                        </div>

                        {/* Price + Rooms */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>מחיר (₪) <span className="text-red-500">*</span></label>
                                <input type="number" min="0" step="1000" value={price} onChange={e => setPrice(e.target.value)} required placeholder="2,500,000" className={inputCls} dir="ltr" />
                            </div>
                            <div>
                                <label className={labelCls}>חדרים</label>
                                <input type="number" min="1" max="20" step="0.5" value={rooms} onChange={e => setRooms(e.target.value)} placeholder="4" className={inputCls} dir="ltr" />
                            </div>
                        </div>

                        {/* Property kind */}
                        <div>
                            <label className={labelCls}>סוג נכס</label>
                            <div className="flex flex-wrap gap-1.5">
                                {PROPERTY_KINDS.map(k => (
                                    <button key={k} type="button" onClick={() => setKind(k)}
                                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${kind === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >{k}</button>
                                ))}
                            </div>
                        </div>

                        {/* Status */}
                        <div>
                            <label className={labelCls}>סטטוס נכס</label>
                            <div className="grid grid-cols-3 gap-1.5">
                                {STATUS_OPTIONS.map(s => (
                                    <button key={s.val} type="button" onClick={() => setStatus(s.val as any)}
                                        className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${status === s.val ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >{s.label}</button>
                                ))}
                            </div>
                        </div>

                        {/* Agent */}
                        <div>
                            <label className={labelCls}>סוכן מטפל</label>
                            <select value={agentId} onChange={e => setAgentId(e.target.value)} className={inputCls}>
                                <option value="">ללא שיוך</option>
                                {agents.map(a => <option key={a.uid || a.id} value={a.uid || ''}>{a.name || a.email}</option>)}
                            </select>
                        </div>

                        {/* Exclusivity toggle */}
                        <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                            <div>
                                <p className="text-sm font-semibold text-slate-700">בלעדיות</p>
                                <p className="text-xs text-slate-400 mt-0.5">הנכס בטיפול בלעדי של המשרד</p>
                            </div>
                            <button type="button" onClick={() => setIsExclusive(p => !p)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isExclusive ? 'bg-amber-500' : 'bg-slate-200'}`}>
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isExclusive ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {/* Description */}
                        <div>
                            <label className={labelCls}>תיאור הנכס</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="תאר את הנכס בקצרה..." className={inputCls} />
                        </div>
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
                            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2">
                                {loading ? <><Loader2 size={16} className="animate-spin" />שומר...</> : 'שמור שינויים'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
