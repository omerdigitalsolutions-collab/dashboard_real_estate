import { useState } from 'react';
import { X, Building2, MapPin, Home, DollarSign, Users } from 'lucide-react';
import { Property, PropertyType } from '../../types';
import { cityCoordinates } from '../../utils/constants';
import { useAgents } from '../../hooks/useFirestoreData';

interface AddPropertyModalProps {
    onClose: () => void;
    onAdd: (property: Partial<Property>) => void; // Uses Partial because id/agencyId will be added by backend
}

const propertyCategories = ['דירה', 'פנטהאוז', 'וילה', 'קרקע', 'מסחרי'];
const cities = Object.keys(cityCoordinates);

export default function AddPropertyModal({ onClose, onAdd }: AddPropertyModalProps) {
    const { data: agentOptions } = useAgents();

    const [form, setForm] = useState({
        address: '',
        city: 'תל אביב',
        category: 'דירה',
        type: 'sale' as PropertyType,
        price: '',
        rooms: '',
        sqm: '',
        floor: '',
        agentId: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitted, setSubmitted] = useState(false);

    const set = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    };

    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.address.trim()) e.address = 'נדרשת כתובת';
        if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) e.price = 'נדרש מחיר תקין';
        if (!form.rooms || isNaN(Number(form.rooms))) e.rooms = 'נדרש מספר חדרים';
        if (!form.sqm || isNaN(Number(form.sqm))) e.sqm = 'נדרש גודל במ"ר';
        if (!form.agentId && agentOptions.length > 0) e.agentId = 'נדרש סוכן מטפל';
        return e;
    };

    const handleSubmit = () => {
        const e = validate();
        if (Object.keys(e).length > 0) { setErrors(e); return; }

        const coords = cityCoordinates[form.city] ?? cityCoordinates['אחר'];
        const jitter = () => (Math.random() - 0.5) * 4;

        const newProperty: Partial<Property> & { category?: string } = {
            address: form.address,
            city: form.city,
            type: form.type,
            price: Number(form.price),
            rooms: Number(form.rooms),
            status: 'active',
            daysOnMarket: 0,
            agentId: form.agentId || (agentOptions[0]?.uid ?? 'unassigned'),
            lat: coords.x + jitter(), // Will map to mapX in DealsPipeline unfortunately, need to reconcile later
            lng: coords.y + jitter(), // Will map to mapY in DealsPipeline 
            category: form.category, // Added temporarily
        };

        onAdd(newProperty);
        setSubmitted(true);
        setTimeout(onClose, 1200);
    };

    const inputClass = (field: string) =>
        `w-full border rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all ${errors[field] ? 'border-red-300 bg-red-50' : 'border-slate-200'}`;

    if (submitted) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 shadow-2xl">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                        <MapPin size={32} className="text-emerald-600" />
                    </div>
                    <p className="text-lg font-bold text-slate-900">הנכס נוסף בהצלחה!</p>
                    <p className="text-sm text-slate-500">הנכס מופיע כעת על המפה</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <Building2 size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">הוסף נכס חדש</h2>
                            <p className="text-xs text-slate-400">הנכס יופיע על מפת הנכסים</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

                    {/* Listing type toggle */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-2">סוג מודעה</label>
                        <div className="flex gap-2">
                            {[{ v: 'sale', label: 'למכירה', color: 'bg-blue-600' }, { v: 'rent', label: 'להשכרה', color: 'bg-violet-600' }].map(opt => (
                                <button
                                    key={opt.v}
                                    onClick={() => set('type', opt.v)}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${form.type === opt.v ? `${opt.color} text-white shadow-sm` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Address + City */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                <MapPin size={11} className="inline ml-1" />כתובת
                            </label>
                            <input
                                value={form.address}
                                onChange={e => set('address', e.target.value)}
                                placeholder="רחוב הרצל 42"
                                className={inputClass('address')}
                            />
                            {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">עיר</label>
                            <select value={form.city} onChange={e => set('city', e.target.value)} className={inputClass('city')}>
                                {cities.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Property type */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-2">
                            <Home size={11} className="inline ml-1" />סוג נכס
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {propertyCategories.map(t => (
                                <button
                                    key={t}
                                    onClick={() => set('category', t)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${form.category === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Price */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            <DollarSign size={11} className="inline ml-1" />
                            {form.type === 'sale' ? 'מחיר מכירה (₪)' : 'שכירות חודשית (₪)'}
                        </label>
                        <input
                            type="number"
                            value={form.price}
                            onChange={e => set('price', e.target.value)}
                            placeholder={form.type === 'sale' ? '1,500,000' : '7,500'}
                            className={inputClass('price')}
                        />
                        {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
                    </div>

                    {/* Rooms / SQM / Floor */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">חדרים</label>
                            <input type="number" value={form.rooms} onChange={e => set('rooms', e.target.value)} placeholder="3" className={inputClass('rooms')} />
                            {errors.rooms && <p className="text-xs text-red-500 mt-1">{errors.rooms}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">מ"ר</label>
                            <input type="number" value={form.sqm} onChange={e => set('sqm', e.target.value)} placeholder="80" className={inputClass('sqm')} />
                            {errors.sqm && <p className="text-xs text-red-500 mt-1">{errors.sqm}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">קומה</label>
                            <input type="number" value={form.floor} onChange={e => set('floor', e.target.value)} placeholder="3" className={inputClass('floor')} />
                        </div>
                    </div>

                    {/* Agent */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            <Users size={11} className="inline ml-1" />סוכן מטפל
                        </label>
                        <select value={form.agentId} onChange={e => set('agentId', e.target.value)} className={inputClass('agentId')}>
                            {agentOptions.map(a => <option key={a.uid} value={a.uid}>{a.name}</option>)}
                        </select>
                    </div>

                    {/* Map preview hint */}
                    <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-3">
                        <MapPin size={14} className="text-blue-500 flex-shrink-0" />
                        <p className="text-xs text-blue-700 font-medium">
                            הנכס יופיע על המפה באזור <strong>{form.city}</strong>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                        ביטול
                    </button>
                    <button onClick={handleSubmit} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm">
                        הוסף נכס למפה
                    </button>
                </div>
            </div>
        </div>
    );
}
