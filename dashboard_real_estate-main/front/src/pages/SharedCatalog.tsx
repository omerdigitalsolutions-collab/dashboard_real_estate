import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getCatalogWithQueries, getLiveCatalogProperties, saveCatalogLikes, SharedCatalog } from '../services/catalogService';
import { MapPin, Bed, MessageCircle, Home, Heart, ChevronLeft, ChevronRight, Layers, Maximize, Maximize2, Phone, X, CheckCircle2, DollarSign, Zap, Car, Wind, Shield, Clock } from 'lucide-react';
import CatalogPropertyModal from './CatalogPropertyModal';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../config/firebase';

// ─── Address privacy helper ────────────────────────────────────────────────────
function toStreetOnly(address: string): string {
    return address.trim();
}

// ─── Urgency label helper ─────────────────────────────────────────────────────
function urgencyLabel(val?: string) {
    const map: Record<string, string> = {
        immediate: '⚡ מיידי',
        '1-3_months': '1–3 חודשים',
        '3-6_months': '3–6 חודשים',
        flexible: 'גמיש',
    };
    return val ? (map[val] || val) : null;
}

function conditionLabel(val?: string) {
    const map: Record<string, string> = {
        new: '⭐ חדש מקבלן',
        renovated: '✨ משופץ',
        needs_renovation: '🔨 דורש שיפוץ',
        any: 'לא משנה',
    };
    return val ? (map[val] || val) : null;
}

// ─── Image Carousel ───────────────────────────────────────────────────────────
function ImageCarousel({ images, alt, onZoom }: { images: string[]; alt: string; onZoom?: (url: string) => void }) {
    const [current, setCurrent] = useState(0);
    const imgs = images.slice(0, 5);

    if (imgs.length === 0) {
        return (
            <div className="h-52 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-300 rounded-t-2xl">
                <Home size={36} />
            </div>
        );
    }

    const prev = () => setCurrent(i => (i - 1 + imgs.length) % imgs.length);
    const next = () => setCurrent(i => (i + 1) % imgs.length);

    return (
        <div className="relative h-52 bg-slate-100 overflow-hidden select-none rounded-t-2xl">
            {imgs.map((src, i) => (
                <img
                    key={i}
                    src={src}
                    alt={alt}
                    onClick={e => { e.stopPropagation(); onZoom?.(imgs[current]); }}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 cursor-zoom-in ${i === current ? 'opacity-100' : 'opacity-0'}`}
                />
            ))}
            {/* Zoom button */}
            {onZoom && (
                <button
                    onClick={e => { e.stopPropagation(); onZoom(imgs[current]); }}
                    className="absolute bottom-10 right-2 z-20 w-8 h-8 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
                    title="הגדל תמונה"
                >
                    <Maximize2 size={13} />
                </button>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none z-10" />
            {imgs.length > 1 && (
                <>
                    <button
                        onClick={e => { e.stopPropagation(); prev(); }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); next(); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors backdrop-blur-sm"
                    >
                        <ChevronRight size={14} />
                    </button>
                    <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex gap-1">
                        {imgs.map((_, i) => (
                            <button
                                key={i}
                                onClick={e => { e.stopPropagation(); setCurrent(i); }}
                                className={`h-1 rounded-full transition-all ${i === current ? 'bg-white w-5' : 'bg-white/50 w-1.5'}`}
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
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-white border border-rose-200 shadow-xl rounded-2xl px-5 py-4 max-w-xs w-full" dir="rtl">
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

// ─── Lead Requirements Panel ──────────────────────────────────────────────────
function LeadRequirementsPanel({ req, leadName }: { req: SharedCatalog['leadRequirements']; leadName?: string }) {
    if (!req) return null;

    const chips: { icon: React.ReactNode; label: string; highlight?: boolean }[] = [];

    if (req.desiredCity && req.desiredCity.length > 0) {
        chips.push({ icon: <MapPin size={12} />, label: req.desiredCity.join(', '), highlight: true });
    }
    if (req.maxBudget) {
        chips.push({ icon: <DollarSign size={12} />, label: `עד ₪${req.maxBudget.toLocaleString()}`, highlight: true });
    }
    if (req.minRooms || req.maxRooms) {
        const label = req.minRooms && req.maxRooms
            ? `${req.minRooms}–${req.maxRooms} חדרים`
            : req.minRooms ? `מ-${req.minRooms} חדרים`
                : `עד ${req.maxRooms} חדרים`;
        chips.push({ icon: <Bed size={12} />, label });
    }
    if (req.minSizeSqf) {
        chips.push({ icon: <Maximize size={12} />, label: `מ-${req.minSizeSqf} מ"ר` });
    }
    if (req.floorMin !== undefined && req.floorMin !== null) {
        const label = req.floorMax != null ? `קומה ${req.floorMin}–${req.floorMax}` : `מקומה ${req.floorMin}`;
        chips.push({ icon: <Layers size={12} />, label });
    }
    if (req.mustHaveElevator) chips.push({ icon: <CheckCircle2 size={12} />, label: 'מעלית' });
    if (req.mustHaveParking) chips.push({ icon: <Car size={12} />, label: 'חניה' });
    if (req.mustHaveBalcony) chips.push({ icon: <Wind size={12} />, label: 'מרפסת' });
    if (req.mustHaveSafeRoom) chips.push({ icon: <Shield size={12} />, label: 'ממ"ד' });
    if (req.urgency && req.urgency !== 'flexible') chips.push({ icon: <Clock size={12} />, label: urgencyLabel(req.urgency) || '' });
    if (req.condition && req.condition !== 'any') chips.push({ icon: <Zap size={12} />, label: conditionLabel(req.condition) || '' });

    if (chips.length === 0) return null;

    return (
        <div className="max-w-5xl mx-auto px-4 mb-5">
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4" dir="rtl">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    הקריטריונים של {leadName || 'הלקוח'}
                </p>
                <div className="flex flex-wrap gap-2">
                    {chips.map((chip, i) => (
                        <div
                            key={i}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${chip.highlight
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                        >
                            {chip.icon}
                            {chip.label}
                        </div>
                    ))}
                </div>
            </div>
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
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [selectedProperty, setSelectedProperty] = useState<any | null>(null);
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
            try {
                if (!auth.currentUser) await signInAnonymously(auth);
            } catch (authErr) {
                console.warn('[catalog] Anonymous auth failed, continuing anyway:', authErr);
            }

            try {
                const data = await getCatalogWithQueries(token);
                if (!data) { setError('הקטלוג המבוקש לא נמצא או שפג תוקפו.'); setLoading(false); return; }
                setCatalog(data);

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
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
                <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
                <p className="text-slate-500 font-medium text-sm">טוען נכסים...</p>
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

    const { leadName, agencyName, agencyLogoUrl, leadRequirements } = catalog;
    const rawAgencyPhone = catalog.agencyPhone || '';
    const agencyPhone = rawAgencyPhone.replace(/\D/g, '').replace(/^0/, '972');

    const getContactPhone = (property: any): string => {
        if (property.listingType === 'exclusive' && property.agentPhone) {
            return property.agentPhone;
        }
        return rawAgencyPhone;
    };
    const waMessage = encodeURIComponent(`היי, עברתי על קטלוג הנכסים שנשלח אלי ואשמח לפרטים נוספים.`);
    const waLink = agencyPhone ? `https://wa.me/${agencyPhone}?text=${waMessage}` : '#';
    const likedCount = likedIds.size;

    return (
        <div className="min-h-screen bg-[#f5f6fa] pb-36" dir="rtl">
            {/* Like Toast */}
            {showToast && <LikeToast name={leadName || ''} onClose={() => setShowToast(false)} />}

            {/* Image Lightbox */}
            {zoomedImage && (
                <div
                    className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setZoomedImage(null)}
                >
                    <button
                        className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center z-[201] transition-colors"
                        onClick={() => setZoomedImage(null)}
                    >
                        <X size={20} />
                    </button>
                    <img
                        src={zoomedImage}
                        alt="תמונה מוגדלת"
                        className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}

            {/* Property Profile Modal */}
            <CatalogPropertyModal
                property={selectedProperty}
                agencyPhone={rawAgencyPhone}
                onClose={() => setSelectedProperty(null)}
            />

            {/* ── Header ──────────────────────────────────────────────────── */}
            <header className="bg-gradient-to-br from-[#0f1729] via-[#0f2052] to-[#0f1729] text-white shadow-2xl relative overflow-hidden">
                {/* Floating orbs */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                    <div className="absolute bottom-0 left-0 w-56 h-56 bg-indigo-600/25 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_50%,rgba(59,130,246,0.08),transparent_70%)]" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto px-6 pt-10 pb-8 flex flex-col items-center text-center">
                    {agencyName && (
                        <p className="text-blue-300 text-xs font-bold tracking-[0.2em] uppercase mb-4 opacity-80 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10">
                            {agencyName}
                        </p>
                    )}

                    <h1 className="text-3xl font-black mb-2 leading-tight">
                        {leadName ? `הנכסים שנבחרו עבור ${leadName}` : 'קטלוג נכסים אישי'}
                    </h1>
                    <p className="text-blue-200/80 text-sm mb-5">
                        מצאנו <span className="font-bold text-white">{sortedProperties.length}</span> נכסים שיכולים להתאים לך
                    </p>

                    {likedCount > 0 && (
                        <div className="inline-flex items-center gap-2 bg-rose-500/20 text-rose-200 text-xs font-bold px-4 py-2 rounded-full border border-rose-400/30 backdrop-blur-sm shadow-rose-500/20 shadow-lg">
                            <Heart size={13} className="fill-rose-300 text-rose-300" />
                            אהבת {likedCount} נכס{likedCount > 1 ? 'ים' : ''}
                        </div>
                    )}

                    {/* Phone quick access */}
                    {rawAgencyPhone && (
                        <a
                            href={`tel:${rawAgencyPhone}`}
                            className="mt-5 flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white/90 text-sm font-medium px-5 py-2.5 rounded-xl border border-white/15 transition-all"
                        >
                            <Phone size={14} />
                            <span dir="ltr">{rawAgencyPhone}</span>
                        </a>
                    )}
                </div>
            </header>

            {/* ── Lead Criteria ───────────────────────────────────────────── */}
            <div className="max-w-5xl mx-auto px-4 mt-6">
                <LeadRequirementsPanel req={leadRequirements} leadName={leadName} />
            </div>

            {/* ── Property Grid ────────────────────────────────────────────── */}
            <div className="max-w-5xl mx-auto px-4 pb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {sortedProperties.map((property, index) => {
                        const propId = property.id || String(index);
                        const isLiked = likedIds.has(propId);
                        const streetName = toStreetOnly(property.address || '');
                        const displayLocation = [streetName, property.city].filter(Boolean).join(', ');
                        const isNew = isPropertyNew(property.createdAt);

                        return (
                            <div
                                key={propId}
                                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100/80 transition-all hover:shadow-lg hover:-translate-y-1 duration-300 flex flex-col"
                            >
                                {/* Image */}
                                <div className="relative">
                                    <ImageCarousel images={property.images || []} alt={streetName} onZoom={setZoomedImage} />

                                    {/* Top badges */}
                                    <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1.5 items-end pointer-events-none">
                                        {isNew && (
                                            <div className="bg-blue-500/90 backdrop-blur-sm px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1">
                                                <span className="text-[10px] font-black text-white">✨ חדש</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Type badge bottom-left */}
                                    <div className="absolute bottom-2.5 left-2.5 z-20">
                                        <span className={`px-2.5 py-1 text-[10px] font-black rounded-lg shadow backdrop-blur-sm ${property.type === 'rent' ? 'bg-emerald-500/90 text-white' : 'bg-blue-600/90 text-white'}`}>
                                            {property.type === 'rent' ? 'להשכרה' : 'למכירה'}
                                        </span>
                                    </div>

                                    {/* Like button */}
                                    <button
                                        onClick={() => toggleLike(propId, property, !isLiked)}
                                        className={`absolute top-2.5 left-2.5 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${isLiked ? 'bg-rose-500 text-white shadow-rose-400/40' : 'bg-white/85 backdrop-blur-sm text-slate-500 hover:text-rose-500 hover:bg-white'}`}
                                        title={isLiked ? 'הסר לייק' : 'אהבתי'}
                                    >
                                        <Heart size={15} className={isLiked ? 'fill-white' : ''} />
                                    </button>
                                </div>

                                {/* Details — clicking opens Property Profile modal */}
                                <div
                                    className="p-4 flex flex-col flex-1 text-right cursor-pointer"
                                    onClick={() => setSelectedProperty(property)}
                                >
                                    {/* Location */}
                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
                                        <MapPin size={11} className="text-slate-300 shrink-0" />
                                        <span className="truncate font-medium">{displayLocation || 'מיקום לא צוין'}</span>
                                    </div>

                                    {/* Price */}
                                    <div className="text-2xl font-black text-slate-900 mb-3 tracking-tight">
                                        ₪{(property.price || 0).toLocaleString()}
                                        {property.type === 'rent' && <span className="text-sm font-medium text-slate-400 mr-1">/חודש</span>}
                                    </div>

                                    {/* Specs */}
                                    <div className="flex items-center flex-wrap gap-1.5 mb-3">
                                        {property.rooms && (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                                                <Bed size={11} className="text-slate-400" />
                                                {property.rooms} חד'
                                            </span>
                                        )}
                                        {property.sqm && (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                                                <Maximize size={11} className="text-slate-400" />
                                                {property.sqm} מ"ר
                                            </span>
                                        )}
                                        {property.floor !== undefined && property.floor !== null && (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                                                <Layers size={11} className="text-slate-400" />
                                                קומה {property.floor}
                                            </span>
                                        )}
                                    </div>

                                    {/* Description */}
                                    {property.description && (
                                        <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-50 pt-3 mt-auto line-clamp-2">
                                            {property.description}
                                        </p>
                                    )}

                                    {/* Contact button */}
                                    {getContactPhone(property) && (
                                        <a
                                            href={`tel:${getContactPhone(property)}`}
                                            onClick={e => e.stopPropagation()}
                                            className={`mt-3 flex items-center justify-center gap-2 text-xs font-bold px-3 py-2 rounded-xl transition-colors ${
                                                property.listingType === 'exclusive' && property.agentPhone
                                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                                            }`}
                                        >
                                            <Phone size={13} />
                                            <span dir="ltr">{getContactPhone(property)}</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {sortedProperties.length === 0 && (
                    <div className="text-center py-24 text-slate-400">
                        <Home size={44} className="mx-auto mb-4 opacity-40" />
                        <p className="font-semibold text-slate-500">אין נכסים להצגה כרגע</p>
                        <p className="text-sm mt-1">הסוכן שלך יעדכן בקרוב</p>
                    </div>
                )}
            </div>

            {/* ── Agency Branding Footer ────────────────────────────────────── */}
            <footer className="max-w-5xl mx-auto px-4 pt-4 pb-6">
                {/* Agency card */}
                {(rawAgencyPhone || agencyName) && (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-right mb-5">
                        {agencyLogoUrl && (
                            <img
                                src={agencyLogoUrl}
                                alt={agencyName || ''}
                                className="h-20 w-auto object-contain shrink-0 drop-shadow-sm"
                            />
                        )}
                        <div className="flex-1">
                            {agencyName && <p className="font-black text-slate-900 text-lg mb-0.5">{agencyName}</p>}
                            <p className="text-sm text-slate-500">רוצה לשמוע עוד? צוות הסוכנים שלנו זמין לך</p>
                        </div>
                        {rawAgencyPhone && (
                            <a
                                href={`tel:${rawAgencyPhone}`}
                                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors shrink-0 shadow-sm"
                            >
                                <Phone size={15} />
                                {rawAgencyPhone}
                            </a>
                        )}
                    </div>
                )}

                {/* Homer branding */}
                <div className="flex flex-col items-center text-center gap-6 py-12 border-t border-slate-200/60 mt-8">
                    <a href="https://homer.management" target="_blank" rel="noopener noreferrer" className="block hover:scale-110 active:scale-95 transition-all duration-300 transform drop-shadow-xl">
                        <img src="/homer-logo-dark.png" alt="Homer CRM" className="h-24 w-auto object-contain" />
                    </a>

                    <div className="space-y-4">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black tracking-[0.2em] text-blue-500 uppercase mb-1">Powered by</span>
                            <a href="https://homer.management" target="_blank" rel="noopener noreferrer" className="text-xl font-black text-slate-900 hover:text-blue-600 transition-colors tracking-tight">
                                hOMER <span className="text-blue-600">OS</span>
                            </a>
                            <p className="text-slate-500 text-sm font-medium mt-1">הבית של המתווכים</p>
                        </div>

                        <div className="h-px w-12 bg-slate-200 mx-auto"></div>

                        <p className="text-slate-400 text-[11px] font-medium tracking-wide">
                            מבית{' '}
                            <a href="https://www.instagram.com/omer.digital.solutions" target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-blue-500 font-bold transition-colors">
                                עומר פתרונות דיגיטלים
                            </a>
                        </p>
                    </div>
                </div>
            </footer>

            {/* ── Floating WhatsApp CTA ─────────────────────────────────────── */}
            <div className="fixed bottom-0 left-0 right-0 max-w-5xl mx-auto px-4 pb-6 pt-10 bg-gradient-to-t from-[#f5f6fa] via-[#f5f6fa]/90 to-transparent z-50 pointer-events-none">
                <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[#25D366] hover:bg-[#1fbc5a] text-white flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base shadow-xl shadow-[#25D366]/30 transition-all active:scale-95 pointer-events-auto"
                >
                    <MessageCircle size={22} />
                    <span>דבר איתנו בוואטסאפ</span>
                </a>
            </div>
        </div>
    );
}
