import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getCatalogWithQueries, getLiveCatalogProperties, saveCatalogLikes, SharedCatalog } from '../services/catalogService';
import { MapPin, BedDouble, MessageCircle, Home, Heart, ChevronLeft, ChevronRight, Layers, Maximize } from 'lucide-react';

// ─── Address privacy helper ────────────────────────────────────────────────────
// Strips house number from the end of an address (e.g. "הרצל 14" → "הרצל")
function toStreetOnly(address: string): string {
    return address.replace(/\s+\d+[א-תA-Za-z]?\s*$/, '').trim();
}

// ─── Image Carousel ───────────────────────────────────────────────────────────
function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
    const [current, setCurrent] = useState(0);

    // Limit to max 5 images
    const imgs = images.slice(0, 5);

    if (imgs.length === 0) {
        return (
            <div className="h-56 bg-slate-100 flex items-center justify-center text-slate-300">
                <Home size={40} />
            </div>
        );
    }

    const prev = () => setCurrent(i => (i - 1 + imgs.length) % imgs.length);
    const next = () => setCurrent(i => (i + 1) % imgs.length);

    return (
        <div className="relative h-56 bg-slate-100 overflow-hidden select-none">
            {imgs.map((src, i) => (
                <img
                    key={i}
                    src={src}
                    alt={alt}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${i === current ? 'opacity-100' : 'opacity-0'}`}
                />
            ))}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none z-10" />

            {/* Prev / Next arrows (only if multiple images) */}
            {imgs.length > 1 && (
                <>
                    <button
                        onClick={e => { e.stopPropagation(); prev(); }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); next(); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                    {/* Dot indicators */}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
                        {imgs.map((_, i) => (
                            <button
                                key={i}
                                onClick={e => { e.stopPropagation(); setCurrent(i); }}
                                className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-white w-4' : 'bg-white/50'}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SharedCatalogPage() {
    const { token } = useParams<{ token: string }>();
    const [catalog, setCatalog] = useState<SharedCatalog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Liked state — initialized from Firestore, synced back on change
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [liveProperties, setLiveProperties] = useState<any[]>([]);
    const [loadingProperties, setLoadingProperties] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounced save to Firestore
    const persistLikes = useCallback((ids: Set<string>, catalogToken: string) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                await saveCatalogLikes(catalogToken, Array.from(ids));
            } catch (e) {
                console.warn('[catalog] Could not save likes to Firestore:', e);
            }
        }, 600);
    }, []);

    // Helper to determine if property is new (created in the last 7 days)
    const isPropertyNew = useCallback((createdAt?: any) => {
        if (!createdAt) return false;

        let date: Date;
        if (createdAt.toDate) {
            date = createdAt.toDate();
        } else if (createdAt.seconds) {
            date = new Date(createdAt.seconds * 1000);
        } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
            date = new Date(createdAt);
        } else {
            return false;
        }

        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
    }, []);

    // intelligent sorting: Exclusive first, then newest first
    const sortedProperties = useMemo(() => {
        return [...liveProperties].sort((a, b) => {
            // Primary Sort: Exclusive
            if (a.listingType === 'exclusive' && b.listingType !== 'exclusive') return -1;
            if (b.listingType === 'exclusive' && a.listingType !== 'exclusive') return 1;

            // Secondary Sort: Newest First
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() :
                (a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 :
                    (new Date(a.createdAt as any)).getTime() || 0;
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() :
                (b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 :
                    (new Date(b.createdAt as any)).getTime() || 0;

            return timeB - timeA;
        });
    }, [liveProperties]);

    // Initialize liked IDs from the catalog document when it loads
    useEffect(() => {
        if (catalog?.likedPropertyIds) {
            setLikedIds(new Set(catalog.likedPropertyIds));
        }
    }, [catalog?.id]);

    useEffect(() => {
        async function fetchCatalogAndProperties() {
            if (!token) return;
            try {
                const data = await getCatalogWithQueries(token);
                if (!data) {
                    setError('הקטלוג המבוקש לא נמצא או שפג תוקפו.');
                    return;
                }
                setCatalog(data);

                // Now fetch the live properties
                if (data.propertyIds && data.propertyIds.length > 0) {
                    setLoadingProperties(true);
                    const props = await getLiveCatalogProperties(token, data.propertyIds);
                    setLiveProperties(props);
                } else {
                    // Fallback for older catalogs that still have 'properties' array directly
                    // This cast bypasses TS type safety to keep legacy compatibility during transition
                    setLiveProperties((data as any).properties || []);
                }

            } catch (err) {
                console.error(err);
                setError('אירעה שגיאה בטעינת הקטלוג.');
            } finally {
                setLoading(false);
                setLoadingProperties(false);
            }
        }
        fetchCatalogAndProperties();
    }, [token]);

    const toggleLike = (id: string) => {
        setLikedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            if (token) persistLikes(next, token);
            return next;
        });
    };

    if (loading || loadingProperties) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-white">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
                <p className="text-slate-500 font-medium">טוען נכסים...</p>
            </div>
        );
    }

    if (error || !catalog) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-white">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-6">
                    <Home size={32} />
                </div>
                <h1 className="text-2xl font-bold text-slate-800 mb-2">אופס!</h1>
                <p className="text-slate-600 mb-8 max-w-sm">{error || 'הקישור פג תוקף. ניתן ליצור קשר עם הסוכן לקבלת קטלוג מעודכן.'}</p>
            </div>
        );
    }

    const { leadName, agencyName, agencyLogoUrl } = catalog;

    const rawAgencyPhone = catalog.agencyPhone || '0501234567'; // Fallback
    const agencyPhone = rawAgencyPhone.replace(/\D/g, '').replace(/^0/, '972');

    const waMessage = encodeURIComponent(
        `היי, עברתי על קטלוג הנכסים שנשלח אלי (${window.location.href}) ואשמח לפרטים נוספים.`
    );
    const waLink = `https://wa.me/${agencyPhone}?text=${waMessage}`;

    const likedCount = likedIds.size;

    return (
        <div className="max-w-md mx-auto min-h-screen bg-[#f8f9fb] relative pb-28" dir="rtl">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-6 rounded-b-3xl shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/15 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
                </div>

                <div className="relative z-10 flex flex-col items-center text-center">
                    {/* Agency logo */}
                    {agencyLogoUrl ? (
                        <img
                            src={agencyLogoUrl}
                            alt={agencyName || 'Agency'}
                            className="h-14 w-auto object-contain mb-3 drop-shadow-sm"
                        />
                    ) : (
                        <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-3 border border-white/20 shadow-inner">
                            <Home size={28} className="text-blue-300" />
                        </div>
                    )}
                    {agencyName && (
                        <p className="text-blue-200 text-xs font-semibold tracking-widest uppercase mb-1 opacity-80">{agencyName}</p>
                    )}
                    <h1 className="text-2xl font-bold mb-1">
                        {leadName ? `הנכסים שנבחרו עבור ${leadName}` : 'קטלוג נכסים אישי'}
                    </h1>
                    <p className="text-blue-200 text-sm">
                        מצאנו {sortedProperties.length} נכסים שיכולים להתאים לך
                    </p>
                    {likedCount > 0 && (
                        <div className="mt-3 inline-flex items-center gap-2 bg-rose-500/20 text-rose-200 text-xs font-semibold px-3 py-1.5 rounded-full border border-rose-400/30">
                            <Heart size={12} className="fill-rose-300 text-rose-300" />
                            אהבת {likedCount} נכס{likedCount > 1 ? 'ים' : ''}
                        </div>
                    )}
                </div>
            </header>

            {/* ── Property Cards ─────────────────────────────────────────────── */}
            <div className="p-4 space-y-5 mt-4">
                {sortedProperties.map((property, index) => {
                    const isLiked = likedIds.has(property.id || String(index));
                    const streetName = toStreetOnly(property.address || '');
                    const displayLocation = [streetName, property.city].filter(Boolean).join(', ');
                    const isNew = isPropertyNew(property.createdAt);

                    return (
                        <div
                            key={property.id || index}
                            className={`bg-white rounded-3xl overflow-hidden shadow-sm border transition-shadow hover:shadow-md ${property.listingType === 'exclusive' ? 'border-amber-200' : 'border-slate-100'}`}
                        >
                            {/* Image Carousel */}
                            <div className="relative">
                                <ImageCarousel images={property.images || []} alt={streetName} />

                                {/* VIP Badges (Top-Right) */}
                                <div className="absolute top-3 right-3 z-20 flex flex-col gap-2 items-end pointer-events-none">
                                    {property.listingType === 'exclusive' && (
                                        <div className="bg-amber-100/95 backdrop-blur-sm px-2.5 py-1 rounded-xl shadow-md border border-amber-200/50 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2">
                                            <span className="text-base leading-none">👑</span>
                                            <span className="text-amber-800 text-xs font-bold whitespace-nowrap">בלעדיות</span>
                                        </div>
                                    )}
                                    {isNew && (
                                        <div className="bg-blue-100/95 backdrop-blur-sm px-2.5 py-1 rounded-xl shadow-md border border-blue-200/50 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2">
                                            <span className="text-base leading-none">✨</span>
                                            <span className="text-blue-700 text-xs font-bold whitespace-nowrap">חדש</span>
                                        </div>
                                    )}
                                </div>

                                {/* Type badge (bottom-left on gradient) */}
                                <div className="absolute bottom-3 left-3 z-20">
                                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg shadow-sm backdrop-blur-sm ${property.type === 'rent' ? 'bg-emerald-500/90 text-white' : 'bg-blue-600/90 text-white'}`}>
                                        {property.type === 'rent' ? 'להשכרה' : 'למכירה'}
                                    </span>
                                </div>

                                {/* Like button (top-left) */}
                                <button
                                    onClick={() => toggleLike(property.id || String(index))}
                                    className={`absolute top-3 left-3 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${isLiked ? 'bg-rose-500 text-white' : 'bg-white/80 backdrop-blur-sm text-slate-500 hover:text-rose-500'}`}
                                    title={isLiked ? 'הסר לייק' : 'אהבתי'}
                                >
                                    <Heart size={18} className={isLiked ? 'fill-white' : ''} />
                                </button>
                            </div>

                            {/* Details */}
                            <div className="p-5 text-right">
                                {/* Location (street + city only — no house number) */}
                                <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium mb-2">
                                    <MapPin size={14} className="text-slate-400 shrink-0" />
                                    <span>{displayLocation || 'מיקום לא צוין'}</span>
                                </div>

                                {/* Price */}
                                <div className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                                    ₪{property.price.toLocaleString()}
                                </div>

                                {/* Specs row */}
                                <div className="flex items-center flex-wrap gap-2 mb-3">
                                    {property.rooms && (
                                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-3 py-1 rounded-xl">
                                            <BedDouble size={14} className="text-slate-400" />
                                            {property.rooms} חדרים
                                        </span>
                                    )}
                                    {property.sqm && (
                                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-3 py-1 rounded-xl">
                                            <Maximize size={14} className="text-slate-400" />
                                            {property.sqm} מ"ר
                                        </span>
                                    )}
                                    {property.floor !== undefined && property.floor !== null && (
                                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-3 py-1 rounded-xl">
                                            <Layers size={14} className="text-slate-400" />
                                            קומה {property.floor}
                                        </span>
                                    )}
                                    {property.kind && (
                                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-3 py-1 rounded-xl">
                                            {property.kind}
                                        </span>
                                    )}
                                </div>

                                {/* Description */}
                                {property.description && (
                                    <p className="text-sm text-slate-500 leading-relaxed border-t border-slate-50 pt-3 mt-1">
                                        {property.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Floating WhatsApp CTA ──────────────────────────────────────── */}
            <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-[#f8f9fb] via-[#f8f9fb]/90 to-transparent pb-6 pt-12 z-50 pointer-events-none">
                <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[#25D366] hover:bg-[#1fbc5a] text-white flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-base shadow-lg shadow-[#25D366]/30 transition-all active:scale-95 pointer-events-auto"
                >
                    <MessageCircle size={22} />
                    <span>דבר איתנו בוואטסאפ</span>
                </a>
            </div>
        </div>
    );
}
