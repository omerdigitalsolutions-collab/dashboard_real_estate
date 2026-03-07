import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getCatalogWithQueries, getLiveCatalogProperties, saveCatalogLikes, SharedCatalog } from '../services/catalogService';
import { MapPin, Bed, MessageCircle, Home, Heart, ChevronLeft, ChevronRight, Layers, Maximize, Phone, Mail, X } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../config/firebase';

// ─── Address privacy helper ────────────────────────────────────────────────────
function toStreetOnly(address: string): string {
    return address.replace(/\s+\d+[א-תA-Za-z]?\s*$/, '').trim();
}

// ─── Image Carousel ───────────────────────────────────────────────────────────
function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
    const [current, setCurrent] = useState(0);
    const imgs = images.slice(0, 5);

    if (imgs.length === 0) {
        return (
            <div className="h-44 bg-slate-100 flex items-center justify-center text-slate-300 rounded-t-2xl">
                <Home size={32} />
            </div>
        );
    }

    const prev = () => setCurrent(i => (i - 1 + imgs.length) % imgs.length);
    const next = () => setCurrent(i => (i + 1) % imgs.length);

    return (
        <div className="relative h-44 bg-slate-100 overflow-hidden select-none rounded-t-2xl">
            {imgs.map((src, i) => (
                <img
                    key={i}
                    src={src}
                    alt={alt}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${i === current ? 'opacity-100' : 'opacity-0'}`}
                />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none z-10" />
            {imgs.length > 1 && (
                <>
                    <button
                        onClick={e => { e.stopPropagation(); prev(); }}
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                    >
                        <ChevronLeft size={13} />
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); next(); }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                    >
                        <ChevronRight size={13} />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex gap-1">
                        {imgs.map((_, i) => (
                            <button
                                key={i}
                                onClick={e => { e.stopPropagation(); setCurrent(i); }}
                                className={`h-1 rounded-full transition-all ${i === current ? 'bg-white w-4' : 'bg-white/50 w-1.5'}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Like Toast notification ─────────────────────────────────────────────────
function LikeToast({ name, onClose }: { name: string; onClose: () => void }) {
    useEffect(() => {
        const t = setTimeout(onClose, 4000);
        return () => clearTimeout(t);
    }, [onClose]);

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-white border border-rose-200 shadow-xl rounded-2xl px-5 py-4 animate-in fade-in slide-in-from-top-4 max-w-xs w-full" dir="rtl">
            <div className="w-9 h-9 bg-rose-100 rounded-full flex items-center justify-center shrink-0">
                <Heart size={16} className="text-rose-500 fill-rose-500" />
            </div>
            <div className="flex-1">
                <p className="font-bold text-slate-900 text-sm">מצוין {name || ''}! 🎉</p>
                <p className="text-xs text-slate-500 mt-0.5">ניצור איתך קשר בקרוב</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                <X size={15} />
            </button>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SharedCatalogPage() {
    const { token } = useParams<{ token: string }>();
    const [catalog, setCatalog] = useState<SharedCatalog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [liveProperties, setLiveProperties] = useState<any[]>([]);
    const [loadingProperties, setLoadingProperties] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const isPropertyNew = useCallback((createdAt?: any) => {
        if (!createdAt) return false;
        let date: Date;
        if (createdAt.toDate) date = createdAt.toDate();
        else if (createdAt.seconds) date = new Date(createdAt.seconds * 1000);
        else if (typeof createdAt === 'string' || typeof createdAt === 'number') date = new Date(createdAt);
        else return false;
        const diffDays = Math.ceil(Math.abs(Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
    }, []);

    const sortedProperties = useMemo(() => {
        return [...liveProperties].sort((a, b) => {
            if (a.listingType === 'exclusive' && b.listingType !== 'exclusive') return -1;
            if (b.listingType === 'exclusive' && a.listingType !== 'exclusive') return 1;
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ?? 0) * 1000;
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ?? 0) * 1000;
            return timeB - timeA;
        });
    }, [liveProperties]);

    useEffect(() => {
        if (catalog?.likedPropertyIds) {
            setLikedIds(new Set(catalog.likedPropertyIds));
        }
    }, [catalog?.id]);

    useEffect(() => {
        async function fetchCatalogAndProperties() {
            if (!token) return;
            // Try anonymous sign-in so Firestore rules that require isAuthed() pass
            try {
                if (!auth.currentUser) await signInAnonymously(auth);
            } catch (authErr) {
                console.warn('[catalog] Anonymous auth failed, continuing anyway:', authErr);
            }

            // Fetch the catalog document
            try {
                const data = await getCatalogWithQueries(token);
                if (!data) { setError('הקטלוג המבוקש לא נמצא או שפג תוקפו.'); setLoading(false); return; }
                setCatalog(data);

                // Fetch properties — in a separate try/catch so it never kills the page
                if (data.propertyIds && data.propertyIds.length > 0) {
                    setLoadingProperties(true);
                    try {
                        const props = await getLiveCatalogProperties(token, data.propertyIds);
                        setLiveProperties(props);
                    } catch (propErr) {
                        console.warn('[catalog] Could not load live properties:', propErr);
                        setLiveProperties((data as any).properties || []);
                    } finally {
                        setLoadingProperties(false);
                    }
                } else {
                    setLiveProperties((data as any).properties || []);
                }
            } catch (err) {
                console.error('[catalog] Failed to load catalog doc:', err);
                setError('אירעה שגיאה בטעינת הקטלוג.');
            } finally {
                setLoading(false);
            }
        }
        fetchCatalogAndProperties();
    }, [token]);

    // Send WhatsApp notification to property agent or agency owner
    const notifyAgentOfLike = useCallback(async (property: any) => {
        if (!catalog) return;

        const agentPhone: string | undefined = property.agentPhone || (catalog as any).agencyOwnerPhone;
        const recipientPhone = agentPhone || catalog.agencyPhone;
        if (!recipientPhone) return;

        const cleanPhone = recipientPhone.replace(/\D/g, '').replace(/^0/, '972');
        const leadName = catalog.leadName || 'לקוח';
        const addr = toStreetOnly(property.address || 'נכס ללא כתובת');
        const message = `🏠 *לייק מהקטלוג!*\nהלקוח ${leadName} לחץ על "אהבתי" על הנכס ב${addr}.\n\nכדאי ליצור קשר בקרוב 😊`;

        try {
            const fns = getFunctions(undefined, 'europe-west1');
            const cfSendWa = httpsCallable<{ phone: string; message: string }, { success: boolean }>(fns, 'whatsapp-sendWhatsappMessage');
            await cfSendWa({ phone: cleanPhone, message });
        } catch (e) {
            console.warn('[catalog] Failed to send like notification via WA CF:', e);
        }
    }, [catalog]);

    const toggleLike = (id: string, property: any, isAdding: boolean) => {
        setLikedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            if (token) persistLikes(next, token);
            return next;
        });

        if (isAdding) {
            setShowToast(true);
            notifyAgentOfLike(property);
        }
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
    const rawAgencyPhone = catalog.agencyPhone || '';
    const agencyPhone = rawAgencyPhone.replace(/\D/g, '').replace(/^0/, '972');
    const agencyEmail = (catalog as any).agencyEmail || '';
    const waMessage = encodeURIComponent(`היי, עברתי על קטלוג הנכסים שנשלח אלי ואשמח לפרטים נוספים.`);
    const waLink = agencyPhone ? `https://wa.me/${agencyPhone}?text=${waMessage}` : '#';
    const likedCount = likedIds.size;

    return (
        <div className="min-h-screen bg-[#f5f6fa] relative pb-32" dir="rtl">
            {/* ── Like Toast ───────────────────────────────────────────────── */}
            {showToast && (
                <LikeToast name={leadName || ''} onClose={() => setShowToast(false)} />
            )}

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/15 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                    <div className="absolute bottom-0 left-0 w-52 h-52 bg-indigo-500/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 flex flex-col items-center text-center">
                    {/* Agency logo */}
                    {agencyLogoUrl ? (
                        <img
                            src={agencyLogoUrl}
                            alt={agencyName || 'Agency'}
                            className="h-16 w-auto object-contain mb-4 drop-shadow-md"
                        />
                    ) : (
                        <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 border border-white/20">
                            <Home size={28} className="text-blue-300" />
                        </div>
                    )}

                    {agencyName && (
                        <p className="text-blue-200 text-xs font-semibold tracking-widest uppercase mb-2 opacity-80">{agencyName}</p>
                    )}
                    <h1 className="text-2xl font-bold mb-1">
                        {leadName ? `הנכסים שנבחרו עבור ${leadName}` : 'קטלוג נכסים אישי'}
                    </h1>
                    <p className="text-blue-200 text-sm mb-3">
                        מצאנו {sortedProperties.length} נכסים שיכולים להתאים לך
                    </p>
                    {likedCount > 0 && (
                        <div className="inline-flex items-center gap-2 bg-rose-500/20 text-rose-200 text-xs font-semibold px-3 py-1.5 rounded-full border border-rose-400/30">
                            <Heart size={12} className="fill-rose-300 text-rose-300" />
                            אהבת {likedCount} נכס{likedCount > 1 ? 'ים' : ''}
                        </div>
                    )}
                </div>

                {/* Agency contact bar */}
                {(rawAgencyPhone || agencyEmail) && (
                    <div className="relative z-10 bg-white/10 backdrop-blur-sm border-t border-white/10">
                        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center justify-center gap-4">
                            {rawAgencyPhone && (
                                <a
                                    href={`tel:${rawAgencyPhone}`}
                                    className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors"
                                >
                                    <Phone size={14} />
                                    <span dir="ltr">{rawAgencyPhone}</span>
                                </a>
                            )}
                            {agencyEmail && (
                                <a
                                    href={`mailto:${agencyEmail}`}
                                    className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors"
                                >
                                    <Mail size={14} />
                                    <span>{agencyEmail}</span>
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </header>

            {/* ── Property Grid ─────────────────────────────────────────────────── */}
            <div className="max-w-5xl mx-auto px-4 py-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedProperties.map((property, index) => {
                        const propId = property.id || String(index);
                        const isLiked = likedIds.has(propId);
                        const streetName = toStreetOnly(property.address || '');
                        const displayLocation = [streetName, property.city].filter(Boolean).join(', ');
                        const isNew = isPropertyNew(property.createdAt);
                        // Hide external agency names — checked inline in property display

                        return (
                            <div
                                key={propId}
                                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 transition-all hover:shadow-md hover:-translate-y-0.5 duration-200 flex flex-col"
                            >
                                {/* Image Carousel */}
                                <div className="relative">
                                    <ImageCarousel images={property.images || []} alt={streetName} />

                                    {/* Badges (top-right) */}
                                    <div className="absolute top-2 right-2 z-20 flex flex-col gap-1.5 items-end pointer-events-none">
                                        {isNew && (
                                            <div className="bg-blue-100/95 backdrop-blur-sm px-2 py-0.5 rounded-lg shadow border border-blue-200/50 flex items-center gap-1">
                                                <span className="text-sm leading-none">✨</span>
                                                <span className="text-blue-700 text-[10px] font-bold whitespace-nowrap">חדש</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Type badge (bottom-left) */}
                                    <div className="absolute bottom-2 left-2 z-20">
                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md shadow backdrop-blur-sm ${property.type === 'rent' ? 'bg-emerald-500/90 text-white' : 'bg-blue-600/90 text-white'}`}>
                                            {property.type === 'rent' ? 'להשכרה' : 'למכירה'}
                                        </span>
                                    </div>

                                    {/* Like button (top-left) */}
                                    <button
                                        onClick={() => toggleLike(propId, property, !isLiked)}
                                        className={`absolute top-2 left-2 z-20 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${isLiked ? 'bg-rose-500 text-white' : 'bg-white/85 backdrop-blur-sm text-slate-500 hover:text-rose-500'}`}
                                        title={isLiked ? 'הסר לייק' : 'אהבתי'}
                                    >
                                        <Heart size={15} className={isLiked ? 'fill-white' : ''} />
                                    </button>
                                </div>

                                {/* Details */}
                                <div className="p-3 flex flex-col flex-1 text-right">
                                    {/* Location */}
                                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-1.5">
                                        <MapPin size={11} className="text-slate-400 shrink-0" />
                                        <span className="truncate">{displayLocation || 'מיקום לא צוין'}</span>
                                    </div>

                                    {/* Price */}
                                    <div className="text-xl font-black text-slate-900 mb-2 tracking-tight">
                                        ₪{(property.price || 0).toLocaleString()}
                                    </div>

                                    {/* Specs */}
                                    <div className="flex items-center flex-wrap gap-1.5 mb-2">
                                        {property.rooms && (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-lg">
                                                <Bed size={11} className="text-slate-400" />
                                                {property.rooms} חד'
                                            </span>
                                        )}
                                        {property.sqm && (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-lg">
                                                <Maximize size={11} className="text-slate-400" />
                                                {property.sqm} מ"ר
                                            </span>
                                        )}
                                        {property.floor !== undefined && property.floor !== null && (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-lg">
                                                <Layers size={11} className="text-slate-400" />
                                                קומה {property.floor}
                                            </span>
                                        )}
                                    </div>

                                    {/* Description (truncated to 2 lines) */}
                                    {property.description && (
                                        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-50 pt-2 mt-auto line-clamp-2">
                                            {property.description}
                                        </p>
                                    )}

                                    {/* Never show external agency name */}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {sortedProperties.length === 0 && (
                    <div className="text-center py-20 text-slate-400">
                        <Home size={40} className="mx-auto mb-3 opacity-50" />
                        <p className="font-medium">אין נכסים להצגה כרגע</p>
                    </div>
                )}
            </div>

            {/* ── Agency Contact Section ────────────────────────────────────── */}
            {(rawAgencyPhone || agencyEmail || agencyName) && (
                <div className="max-w-5xl mx-auto px-4 mb-8">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-right" dir="rtl">
                        {agencyLogoUrl && (
                            <img src={agencyLogoUrl} alt={agencyName || ''} className="h-12 w-auto object-contain shrink-0" />
                        )}
                        <div className="flex-1">
                            {agencyName && <p className="font-bold text-slate-900 mb-0.5">{agencyName}</p>}
                            <p className="text-sm text-slate-500">רוצה לשמוע עוד? צוות הסוכנים שלנו זמין לך</p>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-center shrink-0">
                            {rawAgencyPhone && (
                                <a
                                    href={`tel:${rawAgencyPhone}`}
                                    className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
                                >
                                    <Phone size={15} />
                                    {rawAgencyPhone}
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Floating WhatsApp CTA ──────────────────────────────────────── */}
            <div className="fixed bottom-0 left-0 right-0 max-w-5xl mx-auto px-4 pb-6 pt-8 bg-gradient-to-t from-[#f5f6fa] via-[#f5f6fa]/90 to-transparent z-50 pointer-events-none">
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
