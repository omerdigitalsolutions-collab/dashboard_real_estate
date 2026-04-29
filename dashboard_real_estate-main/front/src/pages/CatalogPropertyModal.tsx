import { X, MapPin, Bed, Maximize, Layers, Car, Wind, Shield, ArrowUpRight, ChevronLeft, ChevronRight, Fullscreen, Image as ImageIcon, Video, Phone, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface CatalogPropertyModalProps {
    property: any | null;
    agencyPhone?: string;
    agencyLogoUrl?: string;
    onClose: () => void;
}

const AMENITY_ICONS: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: 'hasElevator', label: 'מעלית', icon: <ArrowUpRight size={13} /> },
    { key: 'hasParking', label: 'חניה', icon: <Car size={13} /> },
    { key: 'hasBalcony', label: 'מרפסת', icon: <Wind size={13} /> },
    { key: 'hasSafeRoom', label: 'ממ"ד', icon: <Shield size={13} /> },
];

export default function CatalogPropertyModal({ property, agencyPhone, agencyLogoUrl, onClose }: CatalogPropertyModalProps) {
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [activeVideoIndex, setActiveVideoIndex] = useState(0);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);

    const images = property?.images || [];
    const hasImages = images.length > 0;
    const videos: string[] = property?.videoUrls || (property?.videoUrl ? [property.videoUrl] : []);
    const hasVideos = videos.length > 0;

    // Keyboard navigation — must be before early return to satisfy Rules of Hooks
    useEffect(() => {
        if (!property) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isImageFullscreen) {
                if (e.key === 'ArrowRight') {
                    setActiveImageIndex(prev => (prev - 1 + images.length) % images.length);
                } else if (e.key === 'ArrowLeft') {
                    setActiveImageIndex(prev => (prev + 1) % images.length);
                } else if (e.key === 'Escape') {
                    setIsImageFullscreen(false);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isImageFullscreen, images.length, property]);

    if (!property) return null;

    const nextImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setActiveImageIndex(prev => (prev + 1) % images.length);
    };

    const prevImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setActiveImageIndex(prev => (prev - 1 + images.length) % images.length);
    };

    const displayAddress = [property.address, property.city].filter(Boolean).join(', ') || 'מיקום לא צוין';

    const contactPhone = property.listingType === 'exclusive' && property.agentPhone
        ? property.agentPhone
        : (property.assignedAgentPhone || agencyPhone || '');
    const contactPhoneWa = contactPhone.replace(/\D/g, '').replace(/^0/, '972');
    const activeAmenities = AMENITY_ICONS.filter(a => {
        const mamadKey = a.key === 'hasSafeRoom' ? 'hasMamad' : a.key;
        return property[a.key] || property.features?.[a.key] || property.features?.[mamadKey];
    });

    return (
        <div
            className="fixed inset-0 z-[150] bg-black/60 flex items-end sm:items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
                dir="rtl"
            >
                {/* Drag handle (mobile) */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1 bg-slate-200 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-slate-100">
                    <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                            <MapPin size={11} className="shrink-0" />
                            <span className="truncate font-medium">{displayAddress}</span>
                        </div>
                        <span className={`inline-block px-2.5 py-0.5 text-[10px] font-black rounded-lg ${property.transactionType === 'rent' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {property.transactionType === 'rent' ? 'להשכרה' : 'למכירה'}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0"
                    >
                        <X size={15} className="text-slate-600" />
                    </button>
                </div>

                {/* Hero media / Carousel */}
                {hasImages ? (
                    <div className="relative h-64 overflow-hidden group bg-slate-100">
                        <img
                            src={images[activeImageIndex]}
                            alt={displayAddress}
                            className="w-full h-full object-cover transition-all duration-500"
                        />

                        {/* Overlay Controls */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3">
                            <button
                                onClick={() => setIsImageFullscreen(true)}
                                className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white p-2 rounded-lg transition-colors"
                            >
                                <Fullscreen size={18} />
                            </button>
                        </div>

                        {images.length > 1 && (
                            <>
                                <button
                                    onClick={prevImage}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <button
                                    onClick={nextImage}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <ChevronRight size={20} />
                                </button>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
                                    {images.map((_: string, i: number) => (
                                        <div
                                            key={i}
                                            className={`h-1.5 rounded-full transition-all ${i === activeImageIndex ? 'bg-white w-5' : 'bg-white/40 w-1.5'}`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                ) : hasVideos ? (
                    <div className="relative bg-black overflow-hidden group">
                        <video
                            key={videos[activeVideoIndex]}
                            src={videos[activeVideoIndex]}
                            controls
                            playsInline
                            className="w-full max-h-72 object-contain"
                        />
                        {videos.length > 1 && (
                            <>
                                <button
                                    onClick={e => { e.stopPropagation(); setActiveVideoIndex(i => (i - 1 + videos.length) % videos.length); }}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <button
                                    onClick={e => { e.stopPropagation(); setActiveVideoIndex(i => (i + 1) % videos.length); }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <ChevronRight size={20} />
                                </button>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 pointer-events-none">
                                    {videos.map((_, i) => (
                                        <div key={i} className={`h-1.5 rounded-full transition-all ${i === activeVideoIndex ? 'bg-white w-5' : 'bg-white/40 w-1.5'}`} />
                                    ))}
                                </div>
                            </>
                        )}
                        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-black/50 text-white text-xs font-semibold px-2 py-1 rounded-lg pointer-events-none">
                            <Video size={11} />
                            <span>סרטון {activeVideoIndex + 1}/{videos.length}</span>
                        </div>
                    </div>
                ) : (
                    <div className="h-48 bg-slate-50 flex flex-col items-center justify-center text-slate-300 gap-2 border-b border-slate-100">
                        <ImageIcon size={40} />
                        <span className="text-xs font-medium">אין תמונות להצגה</span>
                    </div>
                )}

                <div className="px-5 py-4 space-y-4">
                    {/* Price */}
                    <div>
                        <p className="text-3xl font-black text-slate-900 tracking-tight">
                            ₪{(property.price || 0).toLocaleString()}
                            {property.transactionType === 'rent' && (
                                <span className="text-sm font-medium text-slate-400 mr-1">/חודש</span>
                            )}
                        </p>
                    </div>

                    {/* Specs */}
                    <div className="flex flex-wrap gap-2">
                        {property.rooms && (
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                                <Bed size={13} className="text-slate-400" />
                                {property.rooms} חדרים
                            </span>
                        )}
                        {(property.squareMeters || property.sqm) && (
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                                <Maximize size={13} className="text-slate-400" />
                                {property.squareMeters || property.sqm} מ"ר
                            </span>
                        )}
                        {property.floor !== undefined && property.floor !== null && (
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                                <Layers size={13} className="text-slate-400" />
                                קומה {property.floor}
                            </span>
                        )}
                    </div>

                    {/* Amenities */}
                    {activeAmenities.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">מאפיינים</p>
                            <div className="flex flex-wrap gap-2">
                                {activeAmenities.map(a => (
                                    <span
                                        key={a.key}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-xl"
                                    >
                                        {a.icon}
                                        {a.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    {property.description && (
                        <div className="border-t border-slate-100 pt-4">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">תיאור</p>
                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                                {property.description}
                            </p>
                        </div>
                    )}

                    {/* Videos section — only when images exist (otherwise shown as hero) */}
                    {hasImages && hasVideos && (
                        <div className="border-t border-slate-100 pt-4">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Video size={12} />
                                סרטוני נכס ({videos.length}/3)
                            </p>
                            <div className="space-y-3">
                                {videos.map((url, i) => (
                                    <div key={i}>
                                        <p className="text-xs text-slate-400 mb-1">סרטון {i + 1}</p>
                                        <video
                                            src={url}
                                            controls
                                            playsInline
                                            className="w-full rounded-xl bg-black"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Agent / Agency branding */}
                    <div className="border-t border-slate-100 pt-4 flex items-center gap-3">
                        {property.agentPhotoUrl ? (
                            <img
                                src={property.agentPhotoUrl}
                                alt={property.agentName || ''}
                                className="w-10 h-10 rounded-full object-cover border border-slate-100 shadow-sm"
                            />
                        ) : (property.agencyLogoUrl || property.logoUrl || agencyLogoUrl) ? (
                            <img
                                src={property.agencyLogoUrl || property.logoUrl || agencyLogoUrl}
                                alt="Agency Logo"
                                className="h-8 w-auto max-w-[100px] object-contain"
                            />
                        ) : (property.agentName) ? (
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-black text-blue-600">
                                    {property.agentName.charAt(0)}
                                </span>
                            </div>
                        ) : null}
                        <div>
                            {property.agentName && <p className="text-sm font-bold text-slate-900">{property.agentName}</p>}
                            <p className="text-xs text-slate-500">נציג שירות הלקוחות שלנו</p>
                        </div>
                    </div>

                    {/* Contact buttons */}
                    {contactPhone && (
                        <div className="border-t border-slate-100 pt-4 flex gap-3">
                            <a
                                href={`tel:${contactPhone}`}
                                className="flex-1 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3 rounded-2xl transition-colors"
                            >
                                <Phone size={16} />
                                התקשר
                            </a>
                            <a
                                href={`https://wa.me/${contactPhoneWa}?text=${encodeURIComponent(`היי, אני מתעניין/ת בנכס ב${property.address || ''}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fbc5a] text-white font-bold text-sm py-3 rounded-2xl transition-colors"
                            >
                                <MessageCircle size={16} />
                                וואצאפ
                            </a>
                        </div>
                    )}

                    {/* Bottom spacing for mobile safe area */}
                    <div className="h-2" />
                </div>
            </div>

            {/* Fullscreen Image Lightbox */}
            {isImageFullscreen && hasImages && (
                <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col" dir="ltr">
                    <div className="flex justify-end p-4">
                        <button onClick={() => setIsImageFullscreen(false)} className="text-white/70 hover:text-white p-2 transition-colors">
                            <X size={32} />
                        </button>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-4">
                        <img
                            src={images[activeImageIndex]}
                            alt="Fullscreen"
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-all duration-300"
                        />

                        {/* Fullscreen Navigation */}
                        {images.length > 1 && (
                            <>
                                <button
                                    onClick={prevImage}
                                    className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-16 sm:h-16 bg-white/5 hover:bg-white/10 text-white rounded-full flex items-center justify-center transition-all group"
                                >
                                    <ChevronLeft size={32} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                                </button>
                                <button
                                    onClick={nextImage}
                                    className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 w-12 h-12 sm:w-16 sm:h-16 bg-white/5 hover:bg-white/10 text-white rounded-full flex items-center justify-center transition-all group"
                                >
                                    <ChevronRight size={32} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                                </button>
                                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-full px-4 scrollbar-hide">
                                    {images.map((img: string, i: number) => (
                                        <button
                                            key={i}
                                            onClick={() => setActiveImageIndex(i)}
                                            className={`w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${i === activeImageIndex ? 'border-white' : 'border-transparent opacity-40 hover:opacity-100'}`}
                                        >
                                            <img src={img} alt={`Thumb ${i}`} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
