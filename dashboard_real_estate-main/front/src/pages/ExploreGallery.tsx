import { useState, useEffect, useCallback, useRef } from 'react';
import {
    MapPin, Bed, MessageCircle, Home, ChevronLeft, ChevronRight,
    Maximize, Maximize2, Layers, Phone, X, Search, Sparkles, Bell,
    Loader2, Video, SlidersHorizontal, ArrowUpDown, ChevronDown, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import CatalogPropertyModal from './CatalogPropertyModal';
import {
    searchPublicProperties,
    createSearchAlert,
    ExploreFilters,
    SortBy,
    SearchResult,
} from '../services/publicPropertyService';

// ─── Normalise nested Property → flat shape ───────────────────────────────────
function normalise(p: any) {
    const images: string[] = [
        ...(p.media?.mainImage ? [p.media.mainImage] : p.mainImage ? [p.mainImage] : []),
        ...(p.media?.images || p.images || []),
    ].filter(Boolean);

    return {
        id: p.id,
        agencyId: p.agencyId,
        address: p.address?.fullAddress || (typeof p.address === 'string' ? p.address : '') || '',
        city: p.address?.city || p.city || '',
        price: p.financials?.price ?? p.price ?? 0,
        rooms: p.rooms ?? null,
        squareMeters: p.squareMeters ?? null,
        floor: p.floor ?? null,
        totalFloors: p.totalFloors ?? null,
        transactionType: p.transactionType ?? 'forsale',
        propertyType: p.propertyType || p.type || '',
        images,
        videoUrl: p.media?.videoTourUrl || p.videoTourUrl || null,
        description: p.management?.descriptions || p.description || '',
        hasElevator: p.features?.hasElevator ?? p.hasElevator ?? false,
        hasParking: p.features?.hasParking ?? p.hasParking ?? false,
        hasBalcony: p.features?.hasBalcony ?? p.hasBalcony ?? false,
        hasMamad: p.features?.hasMamad ?? p.hasMamad ?? false,
        isRenovated: p.features?.isRenovated ?? p.isRenovated ?? false,
        isFurnished: p.features?.isFurnished ?? p.isFurnished ?? false,
        hasAirConditioning: p.features?.hasAirConditioning ?? p.hasAirConditioning ?? false,
        hasStorage: p.features?.hasStorage ?? p.hasStorage ?? false,
        createdAt: p.createdAt,
        status: p.status,
        agentPhone: null as string | null,
        agencyName: null as string | null,
        agencyLogoUrl: null as string | null,
    };
}
type FlatProperty = ReturnType<typeof normalise>;

// ─── Agency cache ─────────────────────────────────────────────────────────────
const agencyCache = new Map<string, { name: string; logoUrl: string; phone: string }>();
async function fetchAgency(agencyId: string) {
    if (agencyCache.has(agencyId)) return agencyCache.get(agencyId)!;
    try {
        const snap = await getDoc(doc(db, 'agencies', agencyId));
        if (!snap.exists()) return null;
        const d = snap.data();
        const info = {
            name: d.agencyName || d.name || '',
            logoUrl: d.settings?.logoUrl || d.logoUrl || '',
            phone: (d.officePhone || '').replace(/\D/g, '').replace(/^0/, '972'),
        };
        agencyCache.set(agencyId, info);
        return info;
    } catch { return null; }
}

function tsToMs(ts: any): number {
    if (!ts) return 0;
    return ts?.toDate ? ts.toDate().getTime() : ts?.seconds ? ts.seconds * 1000 : 0;
}

function formatDate(ts: any): string {
    const ms = tsToMs(ts);
    if (!ms) return '';
    return new Date(ms).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isNewToday(p: { publicAt?: any; createdAt?: any }): boolean {
    const ms = tsToMs(p.publicAt || p.createdAt);
    if (!ms) return false;
    const d = new Date(ms);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isNewWeek(p: { publicAt?: any; createdAt?: any }): boolean {
    const ms = tsToMs(p.publicAt || p.createdAt);
    return ms > 0 && (Date.now() - ms) / 86_400_000 <= 7;
}

// ─── Image Carousel ───────────────────────────────────────────────────────────
function ImageCarousel({ images, videos = [], alt, onZoom }: {
    images: string[]; videos?: string[]; alt: string; onZoom?: (url: string) => void;
}) {
    const [current, setCurrent] = useState(0);
    const [vid, setVid] = useState(0);
    const imgs = images.slice(0, 5);

    if (imgs.length === 0) {
        if (videos.length > 0) {
            return (
                <div className="relative h-52 bg-black overflow-hidden rounded-t-2xl group">
                    <video key={videos[vid]} src={videos[vid]} controls playsInline className="w-full h-full object-contain" onClick={e => e.stopPropagation()} />
                    {videos.length > 1 && (
                        <>
                            <button onClick={e => { e.stopPropagation(); setVid(i => (i - 1 + videos.length) % videos.length); }} className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-colors"><ChevronLeft size={14} /></button>
                            <button onClick={e => { e.stopPropagation(); setVid(i => (i + 1) % videos.length); }} className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-colors"><ChevronRight size={14} /></button>
                            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex gap-1 pointer-events-none">{videos.map((_, i) => <div key={i} className={`h-1 rounded-full transition-all ${i === vid ? 'bg-white w-5' : 'bg-white/50 w-1.5'}`} />)}</div>
                        </>
                    )}
                    <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-black/50 text-white text-xs font-semibold px-2 py-0.5 rounded-lg pointer-events-none"><Video size={10} /><span>{vid + 1}/{videos.length}</span></div>
                </div>
            );
        }
        return <div className="h-52 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-300 rounded-t-2xl"><Home size={36} /></div>;
    }

    return (
        <div className="relative h-52 bg-slate-100 overflow-hidden select-none rounded-t-2xl">
            {imgs.map((src, i) => (
                <img key={i} src={src} alt={alt} onClick={e => { e.stopPropagation(); onZoom?.(imgs[current]); }}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 cursor-zoom-in ${i === current ? 'opacity-100' : 'opacity-0'}`} />
            ))}
            {onZoom && <button onClick={e => { e.stopPropagation(); onZoom(imgs[current]); }} className="absolute bottom-10 right-2 z-20 w-8 h-8 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors" title="הגדל"><Maximize2 size={13} /></button>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none z-10" />
            {imgs.length > 1 && (
                <>
                    <button onClick={e => { e.stopPropagation(); setCurrent(i => (i - 1 + imgs.length) % imgs.length); }} className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"><ChevronLeft size={14} /></button>
                    <button onClick={e => { e.stopPropagation(); setCurrent(i => (i + 1) % imgs.length); }} className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"><ChevronRight size={14} /></button>
                    <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex gap-1">
                        {imgs.map((_, i) => <button key={i} onClick={e => { e.stopPropagation(); setCurrent(i); }} className={`h-1 rounded-full transition-all ${i === current ? 'bg-white w-5' : 'bg-white/50 w-1.5'}`} />)}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Smart Alert Banner ───────────────────────────────────────────────────────
function SmartAlertBanner({ filters }: { filters: SearchResult['parsedFilters'] }) {
    const [phone, setPhone] = useState('');
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        try {
            await createSearchAlert(phone.trim(), filters);
            setSent(true);
            toast.success('נרשמת! נעדכן אותך ברגע שנכס מתאים יתפרסם.');
        } catch { toast.error('שגיאה — נסה שוב.'); }
        finally { setBusy(false); }
    }
    if (sent) return <div className="text-center py-10"><span className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-5 py-3 rounded-2xl text-sm font-bold"><Bell size={15} />קיבלנו! נחזור אליך בקרוב</span></div>;
    return (
        <div className="max-w-lg mx-auto my-10 bg-white rounded-2xl border border-blue-100 shadow-sm p-6 text-right" dir="rtl">
            <div className="flex items-center gap-2 mb-1.5"><Bell size={17} className="text-blue-500 shrink-0" /><h3 className="font-black text-slate-800">לא מצאת מה שחיפשת?</h3></div>
            <p className="text-sm text-slate-500 mb-4">השאר מספר טלפון ונעדכן אותך ברגע שנכס מתאים יתפרסם.</p>
            <form onSubmit={submit} className="flex gap-2">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="05X-XXXXXXX" dir="ltr" required className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <button type="submit" disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}עדכן אותי
                </button>
            </form>
        </div>
    );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────
const ROOMS_OPTIONS = [
    { label: 'הכל', value: undefined },
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
    { label: '5+', value: 5 },
];

const SORT_OPTIONS: { label: string; value: SortBy }[] = [
    { label: 'הכי חדש', value: 'newest' },
    { label: 'הכי ישן', value: 'oldest' },
    { label: 'מחיר: נמוך לגבוה', value: 'price_asc' },
    { label: 'מחיר: גבוה לנמוך', value: 'price_desc' },
];

interface FilterPanelProps {
    filters: ExploreFilters;
    sortBy: SortBy;
    onChange: (f: ExploreFilters) => void;
    onSortChange: (s: SortBy) => void;
    onApply: () => void;
    onClear: () => void;
    activeCount: number;
}

function FilterPanel({ filters, sortBy, onChange, onSortChange, onApply, onClear, activeCount }: FilterPanelProps) {
    const [open, setOpen] = useState(false);

    const set = (key: keyof ExploreFilters, val: any) =>
        onChange({ ...filters, [key]: val === '' || val === undefined ? undefined : val });

    // Count active filters for badge
    const count = Object.values(filters).filter(v => v != null && v !== '').length;

    return (
        <div className="max-w-5xl mx-auto px-4 mt-4 mb-2" dir="rtl">
            {/* Toggle bar */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setOpen(o => !o)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${open ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}
                >
                    <SlidersHorizontal size={14} />
                    סינון
                    {count > 0 && (
                        <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center">
                            {count}
                        </span>
                    )}
                </button>

                {/* Sort — always visible */}
                <div className="relative">
                    <select
                        value={sortBy}
                        onChange={e => { onSortChange(e.target.value as SortBy); onApply(); }}
                        className="appearance-none flex items-center gap-2 pl-8 pr-4 py-2 rounded-xl text-sm font-bold border border-slate-200 bg-white text-slate-700 hover:border-slate-400 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                {/* Active count */}
                {activeCount > 0 && (
                    <span className="text-xs text-slate-400 font-medium">
                        {activeCount.toLocaleString()} נכסים
                    </span>
                )}

                {count > 0 && (
                    <button onClick={() => { onClear(); }} className="text-xs text-slate-400 hover:text-red-500 font-semibold underline transition-colors mr-auto">
                        נקה הכל
                    </button>
                )}
            </div>

            {/* Filter panel body */}
            {open && (
                <div className="mt-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                        {/* City */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5">עיר / אזור</label>
                            <div className="relative">
                                <MapPin size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                <input
                                    type="text"
                                    value={filters.city || ''}
                                    onChange={e => set('city', e.target.value)}
                                    placeholder="תל אביב, חיפה..."
                                    className="w-full border border-slate-200 rounded-xl pr-8 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                />
                            </div>
                        </div>

                        {/* Transaction type */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5">סוג עסקה</label>
                            <div className="flex gap-2">
                                {(['all', 'forsale', 'rent'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => set('transactionType', t === 'all' ? undefined : t)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                                            (filters.transactionType ?? 'all') === t
                                                ? 'bg-slate-900 text-white border-slate-900'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'
                                        }`}
                                    >
                                        {t === 'all' ? 'הכל' : t === 'forsale' ? 'מכירה' : 'השכרה'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Rooms */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5">חדרים</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {ROOMS_OPTIONS.map(opt => {
                                    const active = opt.value == null
                                        ? filters.minRooms == null && filters.maxRooms == null
                                        : filters.minRooms === opt.value && (opt.value === 5 ? filters.maxRooms == null : filters.maxRooms === opt.value);
                                    return (
                                        <button
                                            key={opt.label}
                                            onClick={() => {
                                                if (opt.value == null) {
                                                    onChange({ ...filters, minRooms: undefined, maxRooms: undefined });
                                                } else if (opt.value === 5) {
                                                    onChange({ ...filters, minRooms: 5, maxRooms: undefined });
                                                } else {
                                                    onChange({ ...filters, minRooms: opt.value, maxRooms: opt.value });
                                                }
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Price range */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5">טווח מחיר (₪)</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="number"
                                    value={filters.minPrice ?? ''}
                                    onChange={e => set('minPrice', e.target.value ? Number(e.target.value) : undefined)}
                                    placeholder="מינ'"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 [appearance:textfield]"
                                />
                                <span className="text-slate-300 text-xs shrink-0">—</span>
                                <input
                                    type="number"
                                    value={filters.maxPrice ?? ''}
                                    onChange={e => set('maxPrice', e.target.value ? Number(e.target.value) : undefined)}
                                    placeholder="מקס'"
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 [appearance:textfield]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Apply button */}
                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={() => { onApply(); setOpen(false); }}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors"
                        >
                            <Search size={14} />
                            הצג תוצאות
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExploreGallery() {
    const [inputValue, setInputValue] = useState('');
    const [activeQuery, setActiveQuery] = useState('');
    const [filters, setFilters] = useState<ExploreFilters>({});
    const [sortBy, setSortBy] = useState<SortBy>('newest');

    const [properties, setProperties] = useState<FlatProperty[]>([]);
    const [page, setPage] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [parsedFilters, setParsedFilters] = useState<SearchResult['parsedFilters']>({});
    const [loading, setLoading] = useState(false);
    const [initialLoaded, setInitialLoaded] = useState(false);

    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [selectedProperty, setSelectedProperty] = useState<FlatProperty | null>(null);

    const busyRef = useRef(false);

    // ── Fetch & normalise ─────────────────────────────────────────────────────
    const doSearch = useCallback(async (
        query: string,
        f: ExploreFilters,
        sort: SortBy,
        pageNum: number,
        append = false
    ) => {
        if (busyRef.current && !append) return;
        busyRef.current = true;
        setLoading(true);
        try {
            const result = await searchPublicProperties(query, f, sort, pageNum, 12);
            const normalised = result.properties.map(normalise);

            // Enrich with agency info async
            const uniqueIds = [...new Set(normalised.map(p => p.agencyId).filter(Boolean))];
            Promise.all(uniqueIds.map(id => fetchAgency(id))).then(() => {
                setProperties(prev => {
                    const list = append ? [...prev, ...normalised] : normalised;
                    return list.map(p => {
                        const ag = agencyCache.get(p.agencyId);
                        return ag ? { ...p, agencyName: ag.name, agencyLogoUrl: ag.logoUrl, agentPhone: ag.phone } : p;
                    });
                });
            });

            setProperties(prev => append ? [...prev, ...normalised] : normalised);
            setTotalCount(result.totalCount);
            setParsedFilters(result.parsedFilters);
            setPage(pageNum);
        } catch (err: any) {
            toast.error(err.message || 'שגיאה בחיפוש.');
        } finally {
            setLoading(false);
            setInitialLoaded(true);
            busyRef.current = false;
        }
    }, []);

    useEffect(() => { doSearch('', {}, 'newest', 0); }, []);

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        setActiveQuery(inputValue);
        doSearch(inputValue, filters, sortBy, 0);
    }

    function handleApplyFilters() {
        doSearch(activeQuery, filters, sortBy, 0);
    }

    function handleClearFilters() {
        setFilters({});
        doSearch(activeQuery, {}, sortBy, 0);
    }

    const hasMore = properties.length < totalCount;
    const isEmpty = initialLoaded && !loading && properties.length === 0;

    return (
        <div className="min-h-screen bg-[#f5f6fa] pb-36" dir="rtl">

            {/* ── Image Lightbox ─────────────────────────────────────────── */}
            {zoomedImage && (
                <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}>
                    <button className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center z-[201] transition-colors" onClick={() => setZoomedImage(null)}><X size={20} /></button>
                    <img src={zoomedImage} alt="" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
                </div>
            )}

            {/* ── Property Detail Modal ──────────────────────────────────── */}
            <CatalogPropertyModal
                property={selectedProperty}
                agencyPhone={selectedProperty?.agentPhone || ''}
                onClose={() => setSelectedProperty(null)}
            />

            {/* ── Header ─────────────────────────────────────────────────── */}
            <header className="bg-gradient-to-br from-[#0f1729] via-[#0f2052] to-[#0f1729] text-white shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                    <div className="absolute bottom-0 left-0 w-56 h-56 bg-indigo-600/25 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_50%,rgba(59,130,246,0.08),transparent_70%)]" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto px-6 pt-10 pb-8 flex flex-col items-center text-center">
                    <p className="text-blue-300 text-xs font-bold tracking-[0.2em] uppercase mb-4 opacity-80 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10">
                        hOMER — גלריית נכסים
                    </p>
                    <h1 className="text-3xl font-black mb-2 leading-tight">מצא את הנכס שלך</h1>
                    <p className="text-blue-200/80 text-sm mb-6">
                        חפש בשפה חופשית • כל הנכסים הציבוריים במקום אחד
                    </p>

                    {/* Search bar */}
                    <form onSubmit={handleSearch} className="w-full max-w-xl">
                        <div className="relative flex items-center">
                            <Sparkles size={15} className="absolute right-4 text-blue-300 pointer-events-none z-10" />
                            <input
                                type="text"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                placeholder='דוגמה: "4 חדרים בתל אביב עד 3 מיליון"'
                                className="w-full bg-white/10 backdrop-blur-sm text-white placeholder-blue-300/60 border border-white/20 rounded-2xl pr-10 pl-28 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white/15 transition-all"
                            />
                            <button type="submit" disabled={loading} className="absolute left-2 bg-blue-500 hover:bg-blue-400 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-60">
                                {loading && properties.length === 0 ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                                חפש
                            </button>
                        </div>
                    </form>

                    {initialLoaded && totalCount > 0 && (
                        <p className="text-blue-200/60 text-xs mt-4">
                            {totalCount.toLocaleString()} נכסים{parsedFilters.city ? ` ב${parsedFilters.city}` : ''}
                        </p>
                    )}
                </div>
            </header>

            {/* ── Filter Bar ─────────────────────────────────────────────── */}
            <FilterPanel
                filters={filters}
                sortBy={sortBy}
                onChange={setFilters}
                onSortChange={setSortBy}
                onApply={handleApplyFilters}
                onClear={handleClearFilters}
                activeCount={totalCount}
            />

            {/* ── Property Grid ──────────────────────────────────────────── */}
            <div className="max-w-5xl mx-auto px-4 pt-3 pb-6">

                {/* Skeleton */}
                {loading && properties.length === 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100/80 animate-pulse">
                                <div className="h-52 bg-slate-200" />
                                <div className="p-4 space-y-3">
                                    <div className="h-3 bg-slate-200 rounded w-2/3" />
                                    <div className="h-7 bg-slate-200 rounded w-1/2" />
                                    <div className="flex gap-2"><div className="h-6 w-16 bg-slate-100 rounded-lg" /><div className="h-6 w-16 bg-slate-100 rounded-lg" /></div>
                                    <div className="h-10 bg-green-100 rounded-xl" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Cards */}
                {properties.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {properties.map((property, idx) => {
                            const propId = property.id || String(idx);
                            const displayLocation = [property.address, property.city].filter(Boolean).join(', ');
                            const todayBadge = isNewToday(property);
                            const recentBadge = !todayBadge && isNewWeek(property);
                            const waMsg = encodeURIComponent(`היי, אני מתעניין/ת בנכס ב${displayLocation} (מזהה: ${propId}). אפשר לקבל פרטים?`);
                            const waLink = property.agentPhone ? `https://wa.me/${property.agentPhone}?text=${waMsg}` : null;
                            const callPhone = property.agentPhone ? `0${property.agentPhone.replace(/^972/, '')}` : null;

                            const tags: string[] = [];
                            if (property.hasMamad) tags.push('ממ"ד');
                            if (property.hasParking) tags.push('חנייה');
                            if (property.hasBalcony) tags.push('מרפסת');
                            if (property.hasElevator) tags.push('מעלית');
                            if (property.isRenovated) tags.push('משופץ');
                            if (property.isFurnished) tags.push('מרוהט');

                            return (
                                <div key={propId} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100/80 transition-all hover:shadow-lg hover:-translate-y-1 duration-300 flex flex-col">
                                    <div className="relative">
                                        <ImageCarousel images={property.images} videos={property.videoUrl ? [property.videoUrl] : []} alt={displayLocation} onZoom={setZoomedImage} />
                                        <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1.5 items-end pointer-events-none">
                                            {todayBadge && <div className="bg-green-500/90 backdrop-blur-sm px-2.5 py-1 rounded-lg shadow-md"><span className="text-[10px] font-black text-white">🔥 חדש היום</span></div>}
                                            {recentBadge && <div className="bg-blue-500/90 backdrop-blur-sm px-2.5 py-1 rounded-lg shadow-md"><span className="text-[10px] font-black text-white">✨ חדש</span></div>}
                                        </div>
                                        <div className="absolute bottom-2.5 left-2.5 z-20">
                                            <span className={`px-2.5 py-1 text-[10px] font-black rounded-lg shadow backdrop-blur-sm ${property.transactionType === 'rent' ? 'bg-emerald-500/90 text-white' : 'bg-blue-600/90 text-white'}`}>
                                                {property.transactionType === 'rent' ? 'להשכרה' : 'למכירה'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-4 flex flex-col flex-1 text-right cursor-pointer" onClick={() => setSelectedProperty(property)}>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                                            <MapPin size={11} className="text-slate-300 shrink-0" />
                                            <span className="truncate font-medium">{displayLocation || 'מיקום לא צוין'}</span>
                                        </div>

                                        {property.createdAt && (
                                            <div className="flex items-center gap-1 text-[10px] text-slate-300 mb-2">
                                                <Calendar size={9} />
                                                <span>נכנס: {formatDate(property.createdAt)}</span>
                                            </div>
                                        )}

                                        <div className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                                            ₪{(property.price || 0).toLocaleString()}
                                            {property.transactionType === 'rent' && <span className="text-sm font-medium text-slate-400 mr-1">/חודש</span>}
                                        </div>

                                        <div className="flex items-center flex-wrap gap-1.5 mb-3">
                                            {property.rooms != null && <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg"><Bed size={11} className="text-slate-400" />{property.rooms} חד'</span>}
                                            {property.squareMeters != null && <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg"><Maximize size={11} className="text-slate-400" />{property.squareMeters} מ"ר</span>}
                                            {property.floor != null && <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg"><Layers size={11} className="text-slate-400" />קומה {property.floor}</span>}
                                        </div>

                                        {tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                {tags.map(t => <span key={t} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{t}</span>)}
                                            </div>
                                        )}

                                        {property.description && (
                                            <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-50 pt-3 line-clamp-2 mb-3">{property.description}</p>
                                        )}

                                        <div className="flex-1" />

                                        {(property.agencyLogoUrl || property.agencyName) && (
                                            <div className="flex items-center gap-2 mb-3 pt-2 border-t border-slate-50">
                                                {property.agencyLogoUrl && <img src={property.agencyLogoUrl} alt="" className="h-5 w-auto max-w-[70px] object-contain shrink-0" />}
                                                <span className="text-xs text-slate-400 font-medium truncate">{!property.agencyLogoUrl && 'מוצג ע"י '}{property.agencyName}</span>
                                            </div>
                                        )}

                                        <div className="flex gap-2 mt-1" onClick={e => e.stopPropagation()}>
                                            {callPhone && <a href={`tel:${callPhone}`} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors"><Phone size={13} />התקשר</a>}
                                            {waLink
                                                ? <a href={waLink} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#1fbc5a] text-white transition-colors"><MessageCircle size={13} />וואטסאפ</a>
                                                : <button onClick={() => setSelectedProperty(property)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"><MessageCircle size={13} />פרטים נוספים</button>
                                            }
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Load more */}
                {hasMore && !loading && (
                    <div className="flex justify-center mt-8">
                        <button onClick={() => doSearch(activeQuery, filters, sortBy, page + 1, true)} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 hover:border-slate-400 text-slate-700 font-semibold rounded-2xl text-sm transition-all shadow-sm hover:shadow">
                            <ChevronDown size={15} />טען עוד נכסים
                        </button>
                    </div>
                )}

                {loading && properties.length > 0 && <div className="flex justify-center mt-8"><Loader2 size={22} className="animate-spin text-slate-400" /></div>}

                {isEmpty && (
                    <>
                        <div className="text-center py-16">
                            <Home size={48} className="mx-auto mb-4 text-slate-200" />
                            <p className="font-black text-slate-500 text-lg mb-1">לא נמצאו נכסים</p>
                            <p className="text-slate-400 text-sm">נסה לשנות את הסינון או את החיפוש</p>
                        </div>
                        <SmartAlertBanner filters={{ ...parsedFilters, rawQuery: activeQuery }} />
                    </>
                )}
            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <footer className="max-w-5xl mx-auto px-4">
                <div className="flex flex-col items-center text-center gap-6 py-12 border-t border-slate-200/60">
                    <a href="https://homer.management" target="_blank" rel="noopener noreferrer" className="block hover:scale-110 transition-all drop-shadow-xl">
                        <img src="/homer-logo-dark.png" alt="Homer CRM" className="h-16 w-auto object-contain" />
                    </a>
                    <div>
                        <span className="text-[10px] font-black tracking-[0.2em] text-blue-500 uppercase">Powered by</span>
                        <p className="text-xl font-black text-slate-900 tracking-tight mt-1">hOMER <span className="text-blue-600">OS</span></p>
                        <p className="text-slate-500 text-sm font-medium mt-0.5">הבית של המתווכים</p>
                    </div>
                </div>
            </footer>

            {/* ── Floating WhatsApp CTA ────────────────────────────────────── */}
            <div className="fixed bottom-0 left-0 right-0 max-w-5xl mx-auto px-4 pb-6 pt-10 bg-gradient-to-t from-[#f5f6fa] via-[#f5f6fa]/90 to-transparent z-50 pointer-events-none">
                <a
                    href={`https://wa.me/?text=${encodeURIComponent('היי, ראיתי נכסים בגלריית hOMER ואשמח לקבל עזרה')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full bg-[#25D366] hover:bg-[#1fbc5a] text-white flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base shadow-xl shadow-[#25D366]/30 transition-all active:scale-95 pointer-events-auto"
                >
                    <MessageCircle size={22} />
                    <span>דבר עם סוכן בוואטסאפ</span>
                </a>
            </div>
        </div>
    );
}
