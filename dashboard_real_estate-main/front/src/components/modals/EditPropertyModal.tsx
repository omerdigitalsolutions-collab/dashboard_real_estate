import { useState, useRef, useEffect } from 'react';
import { X, Building2, Loader2 } from 'lucide-react';
import { formatNumberWithCommas, parseFormattedNumber } from '../../utils/formatters';
import { updateProperty } from '../../services/propertyService';
import { useAgents } from '../../hooks/useFirestoreData';
import { Property } from '../../types';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { app } from '../../config/firebase';
import toast from 'react-hot-toast';
import { ISRAEL_CITIES } from '../../utils/constants';

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

    const [address, setAddress] = useState(property.address?.fullAddress ?? '');
    const [city, setCity] = useState(property.address?.city ?? '');
    const [transactionType, setTransactionType] = useState<'forsale' | 'rent'>(
        property.transactionType === 'rent' ? 'rent' : 'forsale'
    );
    const [kind, setKind] = useState(property.propertyType ?? '');
    const [price, setPrice] = useState((property.financials?.price ?? 0).toString());
    const [rooms, setRooms] = useState(property.rooms?.toString() ?? '');
    const [sqm, setSqm] = useState(property.squareMeters?.toString() ?? '');
    const [status, setStatus] = useState(property.status);
    const [agentId, setAgentId] = useState(property.management?.assignedAgentId ?? '');
    const [description, setDescription] = useState(property.management?.descriptions ?? '');
    const isWhatsappProperty = property.source === 'whatsapp_group' || property.listingType === 'external';
    const [listingType, setListingType] = useState<'private' | 'exclusive' | 'external'>(
        isWhatsappProperty ? 'external' : (property.listingType || (property.isExclusive ? 'exclusive' : 'private'))
    );
    const [originalSource, setOriginalSource] = useState(property.originalSource ?? '');
    const [externalLink, setExternalLink] = useState(property.externalLink ?? property.yad2Link ?? '');
    const [collaborationStatus, setCollaborationStatus] = useState<'private' | 'collaborative'>(property.collaborationStatus || 'private');
    const [collaborationTerms, setCollaborationTerms] = useState(property.collaborationTerms || '');
    const [hideImagesFromPublic, setHideImagesFromPublic] = useState<boolean>(!!property.hideImagesFromPublic);

    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState<{ address: string, city: string, lat?: number, lng?: number } | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [cityFocus, setCityFocus] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
                setSuggestions([]);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!isOpen) return null;

    const fetchSuggestions = async (query: string) => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }
        setIsSearching(true);
        try {
            const fns = getFunctions(app, 'europe-west1');
            const getSuggestions = httpsCallable(fns, 'properties-getAddressSuggestions');
            const res = await getSuggestions({ query });
            
            const data = res.data;
            let results: any[] = [];
            if (Array.isArray(data)) {
                results = data;
            } else if (data && typeof data === 'object' && Array.isArray((data as any).predictions)) {
                results = (data as any).predictions;
            } else if (data && typeof data === 'object' && Array.isArray((data as any).results)) {
                results = (data as any).results;
            }

            setSuggestions(results.slice(0, 5));
        } catch (error) {
            console.error('Error fetching suggestions', error);
            setSuggestions([]);
        } finally {
            setIsSearching(false);
        }
    };

    const searchTimeout = useRef<any>(null);
    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setAddress(val);
        setSelectedAddress(null);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => fetchSuggestions(val), 600);
    };

    const handleSelectSuggestion = async (place: any) => {
        setSuggestions([]);
        const displayName = place.display_name || place.description || place.structured_formatting?.main_text || '';
        setAddress(displayName);

        setIsSearching(true);
        try {
            const fns = getFunctions(app, 'europe-west1');
            const getDetails = httpsCallable(fns, 'properties-getPlaceDetails');
            const res = await getDetails({ placeId: place.place_id });
            const details = res.data as { street: string, houseNumber: string, city: string, lat: number, lng: number, formattedAddress: string } | null;

            if (details) {
                const finalAddress = `${details.street}${details.houseNumber ? ` ${details.houseNumber}` : ''}`;
                setAddress(finalAddress || details.formattedAddress);
                setCity(details.city);
                setSelectedAddress({
                    address: finalAddress || details.formattedAddress,
                    city: details.city,
                    lat: details.lat,
                    lng: details.lng
                });
            }
        } catch (error) {
            console.error('Error fetching place details', error);
            setAddress(displayName);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const parsedPrice = parseFloat(price);
        if (!address.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
            toast.error('יש למלא כתובת ומחיר תקין');
            return;
        }

        setLoading(true);
        try {
            const finalStreet = selectedAddress?.address ?? address.trim();
            const finalCity = selectedAddress?.city ?? city.trim();
            await updateProperty(property.id, {
                address: {
                    city: finalCity,
                    street: finalStreet,
                    fullAddress: `${finalStreet} ${finalCity}`.trim(),
                    ...(selectedAddress?.lat && selectedAddress?.lng ? {
                        coords: { lat: selectedAddress.lat, lng: selectedAddress.lng }
                    } : {}),
                },
                transactionType,
                propertyType: kind,
                financials: { price: parsedPrice },
                rooms: (rooms && !isNaN(parseFloat(rooms))) ? parseFloat(rooms) : 0,
                squareMeters: (sqm && !isNaN(parseFloat(sqm))) ? parseFloat(sqm) : 0,
                status,
                management: {
                    assignedAgentId: agentId || property.management?.assignedAgentId || null,
                    assignedAgentName: agentId ? agents.find(a => (a.uid || a.id) === agentId)?.name || null : property.management?.assignedAgentName || null,
                    descriptions: (description || "").trim() || null,
                },
                listingType,
                isExclusive: listingType === 'exclusive',
                originalSource: originalSource.trim(),
                externalLink: externalLink.trim(),
                collaborationStatus,
                collaborationTerms: collaborationTerms.trim(),
                hideImagesFromPublic,
            });
            onSuccess?.('הנכס עודכן בהצלחה ✓');
            toast.success('הנכס עודכן בהצלחה ✓');
            onClose();
        } catch (err: any) {
            console.error('Update property error:', err);
            const friendlyMsg = err?.message?.includes('Unsupported field value: undefined') 
                ? 'שגיאה בשמירת הנתונים. אנא וודא שכל השדות תקינים.'
                : 'אירעה שגיאה בעדכון הנכס. אנא נסה שנית.';
            toast.error(friendlyMsg);
            setError(friendlyMsg);
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
                            <p className="text-xs text-slate-400">{property.address?.fullAddress}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                        {/* Type toggle */}
                        <div>
                            <label className={labelCls}>סוג עסקה</label>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                {[{ val: 'forsale', label: 'למכירה' }, { val: 'rent', label: 'להשכרה' }].map(t => (
                                    <button key={t.val} type="button" onClick={() => setTransactionType(t.val as 'forsale' | 'rent')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${transactionType === t.val ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >{t.label}</button>
                                ))}
                            </div>
                        </div>

                        {/* Address Autocomplete */}
                        <div className="relative">
                            <label className={labelCls}>כתובת <span className="text-red-500">*</span></label>
                            <input
                                value={address}
                                onChange={handleAddressChange}
                                required
                                placeholder="הקלד כתובת לחיפוש..."
                                className={inputCls}
                            />
                            {isSearching && (
                                <div className="absolute left-3 top-[34px] text-xs text-slate-400">מחפש...</div>
                            )}
                            {suggestions.length > 0 && (
                                <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                    {suggestions.map((s, i) => (
                                        <li
                                            key={i}
                                            onMouseDown={() => handleSelectSuggestion(s)}
                                            className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 text-right"
                                        >
                                            {s.display_name}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="relative">
                            <label className={labelCls}>עיר</label>
                            <input
                                type="text"
                                value={city}
                                onChange={e => setCity(e.target.value)}
                                placeholder="הקלד שם עיר או ישוב..."
                                className={inputCls}
                                onFocus={() => setCityFocus(true)}
                                onBlur={() => setTimeout(() => setCityFocus(false), 200)}
                            />
                            {/* Autocomplete Dropdown */}
                            {cityFocus && city.trim() && (
                                <ul className="absolute z-10 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                                    {ISRAEL_CITIES
                                        .filter(c => c.includes(city.trim()))
                                        .slice(0, 10)
                                        .map((c) => (
                                            <li
                                                key={c}
                                                onMouseDown={() => {
                                                    setCity(c);
                                                    setCityFocus(false);
                                                }}
                                                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                                            >
                                                {c}
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>

                        {/* Price + Rooms + Sqm */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className={labelCls}>מחיר (₪) <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={formatNumberWithCommas(price)}
                                    onChange={e => setPrice(parseFormattedNumber(e.target.value))}
                                    required
                                    placeholder="2,500,000"
                                    className={inputCls}
                                    dir="ltr"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>חדרים</label>
                                <input type="number" min="1" max="20" step="0.5" value={rooms} onChange={e => setRooms(e.target.value)} placeholder="4" className={inputCls} dir="ltr" />
                            </div>
                            <div>
                                <label className={labelCls}>גודל במ"ר</label>
                                <input type="number" min="0" value={sqm} onChange={e => setSqm(e.target.value)} placeholder="100" className={inputCls} dir="ltr" />
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
                        <div>
                            <label className={labelCls}>סוג השיווק</label>
                            <div className="flex gap-4 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="editListingType"
                                        value="private"
                                        checked={listingType === 'private'}
                                        onChange={() => {
                                            setListingType('private');
                                            setCollaborationStatus('private');
                                        }}
                                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">רגיל (פרטי)</span>
                                </label>
                                <label className={`flex items-center gap-2 ${isWhatsappProperty ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                                    title={isWhatsappProperty ? 'לא ניתן לסמן נכס חיצוני/WhatsApp כבלעדי' : undefined}>
                                    <input
                                        type="radio"
                                        name="editListingType"
                                        value="exclusive"
                                        checked={listingType === 'exclusive'}
                                        onChange={() => setListingType('exclusive')}
                                        disabled={isWhatsappProperty}
                                        className="w-4 h-4 text-amber-500 focus:ring-amber-500 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-sm font-medium text-slate-700">👑 בלעדיות</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="editListingType"
                                        value="external"
                                        checked={listingType === 'external'}
                                        onChange={() => {
                                            setListingType('external');
                                            setCollaborationStatus('private');
                                        }}
                                        className="w-4 h-4 text-slate-600 focus:ring-slate-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">🤝 שת"פ</span>
                                </label>
                            </div>
                        </div>

                        {/* Source + Link */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>מקור הנכס</label>
                                <select value={originalSource} onChange={e => setOriginalSource(e.target.value)} className={inputCls}>
                                    <option value="">פרטי</option>
                                    <option value="Yad2">יד 2</option>
                                    <option value="Madlan">מדלן</option>
                                    <option value="Facebook">פייסבוק</option>
                                    <option value="Other">אחר</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>קישור למודעה</label>
                                <input
                                    type="url"
                                    value={externalLink}
                                    onChange={e => setExternalLink(e.target.value)}
                                    placeholder="https://..."
                                    className={inputCls}
                                    dir="ltr"
                                />
                            </div>
                        </div>

                        {/* Collaboration Section */}
                        <div className="pt-4 border-t border-slate-100 space-y-4">
                            <div>
                                <label className={labelCls}>שיתוף פעולה (MLS) {listingType !== 'exclusive' && <span className="text-red-500 font-normal ml-1">- זמין רק לנכסים בבלעדיות</span>}</label>
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            setCollaborationStatus('private');
                                            setCollaborationTerms('');
                                        }}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${collaborationStatus === 'private' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}
                                    >
                                        פרטי (רק למשרד)
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if (listingType === 'exclusive') {
                                                setCollaborationStatus('collaborative');
                                                if (!collaborationTerms) {
                                                    setCollaborationTerms(transactionType === 'rent' ? 'עמלה: 1000 ש"ח' : 'עמלה: 5000 ש"ח');
                                                }
                                            } else {
                                                toast.error('רק דירות בבלעדיות יכולות להופיע במרקט פלייס');
                                            }
                                        }}
                                        disabled={listingType !== 'exclusive'}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${collaborationStatus === 'collaborative' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'} ${listingType !== 'exclusive' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        שיתופי (פתוח ל-MLS)
                                    </button>
                                </div>
                            </div>
                            
                            {collaborationStatus === 'collaborative' && (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <label className={labelCls}>תנאי שיתוף עמלה (ניתן לעריכה)</label>
                                    <textarea 
                                        value={collaborationTerms} 
                                        onChange={e => setCollaborationTerms(e.target.value)} 
                                        placeholder='לדוגמה: עמלה 5000 ש"ח' 
                                        className={inputCls}
                                        rows={2}
                                    />
                                    <p className="text-xs text-slate-500 mt-1">* ברירת מחדל: 5000 ש"ח למכירה, 1000 ש"ח לשכירות</p>
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        <div>
                            <label className={labelCls}>תיאור הנכס</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="תאר את הנכס בקצרה..." className={inputCls} />
                        </div>

                        {/* Public images privacy toggle */}
                        <div className="pt-3 border-t border-slate-100">
                            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={hideImagesFromPublic}
                                    onChange={e => setHideImagesFromPublic(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                                />
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-slate-700">הסתר תמונות מהקטלוג הציבורי</div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        תמונות הנכס לא יופיעו במאגר הציבורי, בקטלוגים ללקוחות ובמרקטפלייס. ניתן יהיה לראות את התמונות רק בתוך המערכת.
                                    </div>
                                </div>
                            </label>
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
