import { Property } from '../../types';
import { X, Building2, MapPin, Tag, Fullscreen, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

interface PropertyDetailsModalProps {
    property: Property;
    onClose: () => void;
}

export default function PropertyDetailsModal({ property, onClose }: PropertyDetailsModalProps) {
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);

    const hasImages = property.imageUrls && property.imageUrls.length > 0;
    const images = hasImages ? property.imageUrls! : [];

    const isRent = property.type === 'rent';
    const typeLabel = isRent ? 'להשכרה' : 'למכירה';
    const typeColor = isRent ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100';

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-white z-10">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${typeColor} border`}>
                                <Building2 size={20} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 leading-tight">
                                    {property.address}
                                </h2>
                                <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                                    <MapPin size={14} />
                                    {property.city || 'עיר לא מוזנת'}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6">
                        {/* Selected Image Banner */}
                        {hasImages ? (
                            <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 group bg-slate-100 border border-slate-200">
                                <img
                                    src={images[activeImageIndex]}
                                    alt="Property Main"
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-4">
                                    <button
                                        onClick={() => setIsImageFullscreen(true)}
                                        className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white p-2 rounded-lg transition-colors"
                                    >
                                        <Fullscreen size={18} />
                                    </button>
                                </div>
                                {property.isExclusive && (
                                    <div className="absolute top-4 right-4 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                                        <Tag size={12} fill="currentColor" />
                                        בלעדיות
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="w-full aspect-video rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 mb-6">
                                <ImageIcon size={48} className="mb-3 opacity-50" />
                                <p className="text-sm font-medium">אין תמונות לנכס זה</p>
                                {property.isExclusive && (
                                    <div className="mt-4 bg-amber-50 text-amber-600 text-xs font-bold px-3 py-1.5 rounded-full border border-amber-100 flex items-center gap-1">
                                        <Tag size={12} fill="currentColor" />
                                        בבלעדיות חברה
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Thumbnail Gallery */}
                        {hasImages && images.length > 1 && (
                            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
                                {images.map((img, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setActiveImageIndex(idx)}
                                        className={`relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${activeImageIndex === idx ? 'border-blue-500 ring-4 ring-blue-500/20' : 'border-transparent hover:opacity-80'}`}
                                    >
                                        <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Property Details Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="text-xs font-semibold text-slate-500 mb-1">מחיר</div>
                                <div className="text-lg font-bold text-slate-900">₪{property.price.toLocaleString()}</div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="text-xs font-semibold text-slate-500 mb-1">סוג עסקה</div>
                                <div className="text-sm font-bold text-slate-900 mt-1">
                                    <span className={`px-2.5 py-1 rounded-md border ${typeColor}`}>
                                        {typeLabel}
                                    </span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="text-xs font-semibold text-slate-500 mb-1">סוג נכס</div>
                                <div className="text-base font-bold text-slate-900">{property.kind || '-'}</div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="text-xs font-semibold text-slate-500 mb-1">חדרים</div>
                                <div className="text-base font-bold text-slate-900">{property.rooms || '-'}</div>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                תיאור הנכס
                            </h3>
                            {property.description ? (
                                <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl">
                                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                                        {property.description}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 italic bg-slate-50 p-4 rounded-xl">לא הוזן תיאור מילולי לנכס זה.</p>
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                            <div>פורסם על ידי מזהה סוכן: <span className="font-mono">{property.agentId?.slice(0, 8)}</span></div>
                            {property.daysOnMarket !== undefined && (
                                <div>בשוק: {property.daysOnMarket} ימים</div>
                            )}
                        </div>

                    </div>
                </div>
            </div>

            {/* Fullscreen Image Lightbox */}
            {isImageFullscreen && hasImages && (
                <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col" dir="ltr">
                    <div className="flex justify-end p-4">
                        <button onClick={() => setIsImageFullscreen(false)} className="text-white/70 hover:text-white p-2 transition-colors">
                            <X size={32} />
                        </button>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-4">
                        <img
                            src={images[activeImageIndex]}
                            alt="Fullscreen"
                            className="max-w-full max-h-full object-contain rounded-lg"
                        />
                    </div>
                    {images.length > 1 && (
                        <div className="p-4 flex justify-center gap-2 overflow-x-auto">
                            {images.map((img, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveImageIndex(idx)}
                                    className={`w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activeImageIndex === idx ? 'border-white' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                >
                                    <img src={img} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
