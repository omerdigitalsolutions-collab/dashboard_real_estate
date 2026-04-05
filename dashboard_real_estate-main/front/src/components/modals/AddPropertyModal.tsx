import { useState, useEffect, useRef } from 'react';
import { X, Building2, Wand2, Loader2, ImagePlus, Star, Trash2 } from 'lucide-react';
import UpgradeModal from '../ui/UpgradeModal';
import { addProperty } from '../../services/propertyService';
import { useAuth } from '../../context/AuthContext';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { app } from '../../config/firebase'; // ← תיקון: import של firebase app
import toast from 'react-hot-toast';

interface AddPropertyModalProps {
    isOpen: boolean;
    onClose: () => void;
    leadId?: string;
}

const PROPERTY_KINDS = ['דירה', 'בית פרטי', 'פנטהאוז', 'מסחרי'];

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function AddPropertyModal({ isOpen, onClose, leadId }: AddPropertyModalProps) {
    const { userData } = useAuth();

    const [addressQuery, setAddressQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState<{ address: string, city: string, lat: number, lng: number } | null>(null);

    const [city, setCity] = useState('');
    const [type, setType] = useState<'sale' | 'rent' | 'commercial'>('sale');
    const [kind, setKind] = useState('דירה');
    const [price, setPrice] = useState('');
    const [rooms, setRooms] = useState('');
    const [sqm, setSqm] = useState('');
    const [floor, setFloor] = useState('');
    const [description, setDescription] = useState('');
    const [importedImages, setImportedImages] = useState<string[]>([]);

    // Listing Type & Upload States
    const [listingType, setListingType] = useState<'private' | 'exclusive' | 'external'>('exclusive');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [originalSource, setOriginalSource] = useState('');
    const [externalLink, setExternalLink] = useState('');

    // AI Extraction State
    const [rawText, setRawText] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);

    const [loading, setLoading] = useState(false);

    // Feature gating
    const [userPlan, setUserPlan] = useState<string>('starter');
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [attemptedFeature, setAttemptedFeature] = useState('');

    // ← תיקון: ref לסגירת ה-dropdown בלחיצה מחוץ לאזור
    const suggestionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchPlan = async () => {
            const user = userData;
            if (user?.agencyId) {
                try {
                    const { getDoc, doc: fsDoc } = await import('firebase/firestore');
                    const { db } = await import('../../config/firebase');
                    const snap = await getDoc(fsDoc(db, 'agencies', user.agencyId));
                    if (snap.exists()) {
                        setUserPlan(snap.data()?.planId || 'starter');
                    }
                } catch (err) {
                    console.error('Error fetching plan:', err);
                }
            }
        };
        if (isOpen) {
            fetchPlan();
        }
    }, [userData, isOpen]);

    // ← תיקון: סגירת dropdown בלחיצה מחוץ לאזור
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
                setSuggestions([]);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const showToast = (message: string, isOk: boolean = true) => {
        if (isOk) toast.success(message);
        else toast.error(message);
    };

    // ← תיקון: שימוש ב-app במקום undefined + טיפול בפורמט תגובה שונה
    const fetchSuggestions = async (query: string) => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }
        setIsSearching(true);
        try {
            const fns = getFunctions(app, 'europe-west1'); // ← תיקון עיקרי
            const getSuggestions = httpsCallable(fns, 'properties-getAddressSuggestions');
            const res = await getSuggestions({ query });

            console.log('Suggestions raw response:', res.data); // ← לדיבוג, ניתן להסיר אחרי בדיקה

            const data = res.data;
            console.log(`[Autocomplete] Received response:`, data);

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
            console.error('[Autocomplete] Error fetching suggestions:', error);
            setSuggestions([]);
        } finally {
            setIsSearching(false);
        }
    };

    const searchTimeout = useRef<any>(null);
    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setAddressQuery(val);
        setSelectedAddress(null);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!val || val.length < 3) {
            setSuggestions([]);
            return;
        }
        searchTimeout.current = setTimeout(() => fetchSuggestions(val), 400); // ← הקטנו ל-400ms לתגובה מהירה יותר
    };

    // ← תיקון: סגירת suggestions מיידית + שימוש ב-app
    const handleSelectSuggestion = async (place: any) => {
        setSuggestions([]); // ← סגור מיד

        // ← תיקון: תמיכה בשדות שם שונים (display_name / description / structured_formatting)
        const displayName =
            place.display_name ||
            place.description ||
            place.structured_formatting?.main_text ||
            '';
        setAddressQuery(displayName);

        setIsSearching(true);
        try {
            const fns = getFunctions(app, 'europe-west1'); // ← תיקון עיקרי
            const getDetails = httpsCallable(fns, 'properties-getPlaceDetails');
            const res = await getDetails({ placeId: place.place_id });

            console.log('Place details response:', res.data); // ← לדיבוג, ניתן להסיר אחרי בדיקה

            const details = res.data as {
                street: string,
                houseNumber: string,
                city: string,
                lat: number,
                lng: number,
                formattedAddress: string
            } | null;

            if (details) {
                const finalAddress = `${details.street}${details.houseNumber ? ` ${details.houseNumber}` : ''}`;
                setAddressQuery(finalAddress || details.formattedAddress);
                setCity(details.city);
                setSelectedAddress({
                    address: finalAddress || details.formattedAddress,
                    city: details.city,
                    lat: details.lat,
                    lng: details.lng
                });
            } else {
                setAddressQuery(displayName);
                setCity('');
            }
        } catch (error) {
            console.error('Error fetching place details:', error);
            setAddressQuery(displayName);
        } finally {
            setIsSearching(false);
        }
    };

    if (!isOpen) return null;

    const resetForm = () => {
        setAddressQuery(''); setCity(''); setType('sale'); setKind('דירה');
        setPrice(''); setRooms(''); setSqm(''); setFloor(''); setSelectedAddress(null); setSuggestions([]);
        setDescription(''); setImportedImages([]);
        setListingType('private'); setImageFiles([]); setPreviewUrls([]);
        setOriginalSource(''); setExternalLink('');
    };

    const handleImageSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length + imageFiles.length > 10) {
            showToast('ניתן להעלות עד 10 תמונות בלבד לנכס בבלעדיות', false);
            return;
        }

        const newFiles = [...imageFiles, ...files];
        setImageFiles(newFiles);

        const newUrls = files.map(f => URL.createObjectURL(f));
        setPreviewUrls(prev => [...prev, ...newUrls]);
    };

    const removeImage = (index: number) => {
        const newFiles = [...imageFiles];
        newFiles.splice(index, 1);
        setImageFiles(newFiles);

        const newUrls = [...previewUrls];
        URL.revokeObjectURL(newUrls[index]);
        newUrls.splice(index, 1);
        setPreviewUrls(newUrls);
    };

    const handleAIExtract = async () => {
        if (userPlan === 'starter') {
            setAttemptedFeature('חילוץ אוטומטי מטקסט (AI)');
            setIsUpgradeModalOpen(true);
            return;
        }

        if (!rawText.trim()) {
            showToast('יש להזין טקסט לחילוץ', false);
            return;
        }

        setIsExtracting(true);
        try {
            const fns = getFunctions(app, 'europe-west1'); // ← תיקון
            const extractFunction = httpsCallable<{ payload: string, mode: string, entityType: string }, { success: boolean, data: any }>(fns, 'ai-extractAiData');
            const result = await extractFunction({ payload: rawText.trim(), mode: 'single', entityType: 'properties' });

            if (result.data.success && result.data.data) {
                const d = result.data.data;
                if (d.city) setCity(d.city);
                if (d.address) setAddressQuery(d.address);
                if (d.price) setPrice(d.price.toString());
                if (d.rooms) setRooms(d.rooms.toString());
                if (d.sqm) setSqm(d.sqm.toString());
                if (d.kind) setKind(d.kind);
                if (d.type) setType(d.type);
                if (d.description) setDescription(d.description);

                showToast('✅ הנתונים חולצו בהצלחה בעזרת AI');
                setRawText('');
            } else {
                showToast('לא הצלחנו לחלץ נתונים מהטקסט, נא לנסות שוב', false);
            }
        } catch (err) {
            console.error('Extraction error:', err);
            showToast('שגיאה בתקשורת מול AI. אנא נסו שוב.', false);
        } finally {
            setIsExtracting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData?.agencyId) return;

        const parsedPrice = parseFloat(price);
        if (!parsedPrice || parsedPrice <= 0) {
            showToast('המחיר חייב להיות מספר חיובי', false);
            return;
        }

        try {
            setLoading(true);

            let lat = selectedAddress?.lat;
            let lng = selectedAddress?.lng;

            if (!lat || !lng) {
                const fns = getFunctions(app, 'europe-west1'); // ← תיקון
                const getCoords = httpsCallable(fns, 'properties-getCoordinates');
                const addrToGeocode = [addressQuery, city].filter(Boolean).join(', ');
                const geoRes = await getCoords({ address: addrToGeocode });
                const coords = geoRes.data as { lat: number, lng: number } | null;
                if (coords) {
                    lat = coords.lat;
                    lng = coords.lng;
                }
            }

            await addProperty(userData.agencyId, {
                address: selectedAddress ? selectedAddress.address : addressQuery.trim(),
                city: city.trim(),
                type,
                kind,
                price: parsedPrice,
                ...(rooms ? { rooms: parseFloat(rooms) } : {}),
                ...(sqm ? { sqm: parseFloat(sqm) } : {}),
                ...(floor ? { floor: parseFloat(floor) } : {}),
                ...(lat && lng ? { lat, lng } : {}),
                ...(description ? { description: description.trim() } : {}),
                ...(importedImages.length > 0 ? { images: importedImages } : {}),
                isExclusive: listingType === 'exclusive',
                listingType,
                ...(listingType === 'exclusive' && imageFiles.length > 0 ? { imageFiles } : {}),
                ...(leadId ? { leadId } : {}),
                agentId: userData.uid || '',
                originalSource: originalSource.trim(),
                externalLink: externalLink.trim(),
            });
            showToast('הנכס נוסף בהצלחה ✓');
            resetForm();
            setTimeout(onClose, 1200);
        } catch (err: any) {
            if (err?.code === 'permission-denied') {
                showToast('אין הרשאה להוסיף נכסים', false);
            } else {
                showToast('אירעה שגיאה, נסה שנית', false);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <Building2 size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">הוסף נכס חדש</h2>
                            <p className="text-xs text-slate-400">יתווסף לרשימת הנכסים הפעילים</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-5">

                    {/* AI Text Extraction Section */}
                    <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                            <Wand2 size={64} className="text-purple-600" />
                        </div>
                        <label className="flex items-center justify-between text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2.5">
                            <span className="flex items-center gap-1.5">
                                <Wand2 size={14} />
                                חילוץ אוטומטי מטקסט פתוח (AI)
                            </span>
                        </label>
                        <div className="flex flex-col gap-2 relative z-10 text-right">
                            <textarea
                                value={rawText}
                                onChange={e => setRawText(e.target.value)}
                                placeholder="הדבק כאן הודעת פייסבוק, ווצאפ או כל טקסט אחר (למשל: למכירה בחיפה, דירת 4 חדרים, 2 מיליון שח...)"
                                className="w-full border border-indigo-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white min-h-[80px] resize-y"
                                dir="rtl"
                            />
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-indigo-600 font-medium bg-indigo-100/50 px-2 py-1 rounded-lg">
                                    Flash ✨ מערכת בינה מלאכותית
                                </span>
                                <button
                                    type="button"
                                    onClick={handleAIExtract}
                                    disabled={isExtracting || !rawText.trim()}
                                    className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
                                >
                                    {isExtracting ? <Loader2 size={16} className="animate-spin" /> : 'חלץ נתונים'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* ← תיקון: Address Autocomplete עם ref לסגירה חיצונית */}
                        <div className="relative" ref={suggestionsRef}>
                            <label className={labelCls}>כתובת <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <input
                                    value={addressQuery}
                                    onChange={handleAddressChange}
                                    required
                                    placeholder="הקלד כתובת לחיפוש..."
                                    className={inputCls}
                                    autoComplete="off"
                                />
                                {/* ← תיקון: spinner בתוך השדה */}
                                {isSearching && (
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                        <Loader2 size={14} className="animate-spin text-slate-400" />
                                    </div>
                                )}
                            </div>

                            {/* ← תיקון: dropdown עם z-index גבוה ותמיכה בפורמטי display שונים */}
                            {suggestions.length > 0 && (
                                <ul className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                    {suggestions.map((s, i) => {
                                        // ← תיקון: תמיכה בפורמטי תגובה שונים של Google Places
                                        const mainText =
                                            s.structured_formatting?.main_text ||
                                            s.display_name ||
                                            s.description ||
                                            '';
                                        const secondaryText =
                                            s.structured_formatting?.secondary_text || '';

                                        return (
                                            <li
                                                key={i}
                                                onMouseDown={(e) => {
                                                    e.preventDefault(); // ← מונע blur לפני הלחיצה
                                                    handleSelectSuggestion(s);
                                                }}
                                                className="px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors"
                                            >
                                                <div className="font-medium">{mainText}</div>
                                                {secondaryText && (
                                                    <div className="text-xs text-slate-400 mt-0.5">{secondaryText}</div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {/* City */}
                        <div>
                            <label className={labelCls}>עיר <span className="text-red-500">*</span></label>
                            <input value={city} onChange={e => setCity(e.target.value)} required placeholder="תל אביב" className={inputCls} />
                        </div>

                        {/* Type + Kind */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>סוג עסקה <span className="text-red-500">*</span></label>
                                <select value={type} onChange={e => setType(e.target.value as 'sale' | 'rent')} className={inputCls}>
                                    <option value="sale">למכירה</option>
                                    <option value="rent">להשכרה</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>סוג נכס <span className="text-red-500">*</span></label>
                                <select value={kind} onChange={e => setKind(e.target.value)} className={inputCls}>
                                    {PROPERTY_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Price */}
                        <div>
                            <label className={labelCls}>מחיר (₪) <span className="text-red-500">*</span></label>
                            <input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} required placeholder="1,500,000" className={inputCls} dir="ltr" />
                        </div>

                        {/* Rooms + Sqm + Floor */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className={labelCls}>חדרים</label>
                                <input type="number" min="0" step="0.5" value={rooms} onChange={e => setRooms(e.target.value)} placeholder="3.5" className={inputCls} dir="ltr" />
                            </div>
                            <div>
                                <label className={labelCls}>גודל במ"ר</label>
                                <input type="number" min="0" value={sqm} onChange={e => setSqm(e.target.value)} placeholder="100" className={inputCls} dir="ltr" />
                            </div>
                            <div>
                                <label className={labelCls}>קומה</label>
                                <input type="number" min="0" value={floor} onChange={e => setFloor(e.target.value)} placeholder="4" className={inputCls} dir="ltr" />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className={labelCls}>תיאור מילולי (אופציונלי)</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="תיאור הנכס כפי שיופיע באתר ובמאגר..."
                                className={inputCls + " min-h-[80px] resize-y"}
                            />
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

                        {/* Image Previews (imported) */}
                        {importedImages.length > 0 && (
                            <div>
                                <label className={labelCls}>תמונות שחולצו ({importedImages.length})</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
                                    {importedImages.map((img, i) => (
                                        <div key={i} className="w-20 h-20 flex-shrink-0 snap-start rounded-xl overflow-hidden border border-slate-200">
                                            <img src={img} alt="preview" className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Exclusivity Toggle + Image Upload */}
                        <div className="pt-2 border-t border-slate-100">
                            <label className={labelCls + " mb-2 block"}>סוג השיווק</label>
                            <div className="flex gap-4 mb-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="listingType"
                                        value="private"
                                        checked={listingType === 'private'}
                                        onChange={() => setListingType('private')}
                                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">רגיל (פרטי)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="listingType"
                                        value="exclusive"
                                        checked={listingType === 'exclusive'}
                                        onChange={() => setListingType('exclusive')}
                                        className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                        <Star size={14} className={listingType === 'exclusive' ? "text-amber-500 fill-amber-500" : "text-slate-400"} />
                                        בלעדיות
                                    </span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="listingType"
                                        value="external"
                                        checked={listingType === 'external'}
                                        onChange={() => setListingType('external')}
                                        className="w-4 h-4 text-slate-600 focus:ring-slate-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                        🤝 שת"פ
                                    </span>
                                </label>
                            </div>

                            {listingType === 'exclusive' && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <label className={labelCls}>תמונות הנכס (עד 10 תמונות)</label>

                                    {imageFiles.length < 10 && (
                                        <div className="relative">
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                onChange={handleImageSelection}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="flex flex-col items-center justify-center px-4 py-5 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/50 hover:bg-blue-50 transition-colors">
                                                <ImagePlus size={24} className="text-blue-500 mb-2" />
                                                <span className="text-sm font-semibold text-blue-700">לחץ להעלאת תמונות</span>
                                                <span className="text-xs text-blue-500/70 mt-1">
                                                    ניתן לבחור עד 10 קבצים {imageFiles.length > 0 && `(נבחרו ${imageFiles.length}/10)`}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {previewUrls.length > 0 && (
                                        <div className="grid grid-cols-5 gap-2 mt-3">
                                            {previewUrls.map((url, i) => (
                                                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                                                    <img src={url} alt="preview" className="w-full h-full object-cover" />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeImage(i)}
                                                        className="absolute inset-x-0 bottom-0 bg-red-500/90 text-white flex justify-center py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                                ביטול
                            </button>
                            <button type="submit" disabled={loading || !addressQuery || !price} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                                {loading ? (listingType === 'exclusive' && imageFiles.length > 0 ? 'מעלה תמונות ושומר...' : 'שומר...') : 'הוסף נכס'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <UpgradeModal
                isOpen={isUpgradeModalOpen}
                onClose={() => setIsUpgradeModalOpen(false)}
                featureName={attemptedFeature}
            />
        </div>
    );
}