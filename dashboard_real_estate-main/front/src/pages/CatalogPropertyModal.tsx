import { X, MapPin, Bed, Maximize, Layers, Car, Wind, Shield, ArrowUpRight } from 'lucide-react';

interface CatalogPropertyModalProps {
    property: any | null;
    agencyPhone?: string;
    onClose: () => void;
}

const AMENITY_ICONS: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: 'hasElevator', label: 'מעלית', icon: <ArrowUpRight size={13} /> },
    { key: 'hasParking', label: 'חניה', icon: <Car size={13} /> },
    { key: 'hasBalcony', label: 'מרפסת', icon: <Wind size={13} /> },
    { key: 'hasSafeRoom', label: 'ממ"ד', icon: <Shield size={13} /> },
];

export default function CatalogPropertyModal({ property, agencyPhone, onClose }: CatalogPropertyModalProps) {
    if (!property) return null;

    const displayAddress = [property.address, property.city].filter(Boolean).join(', ') || 'מיקום לא צוין';
    const activeAmenities = AMENITY_ICONS.filter(a => property[a.key]);

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
                        <span className={`inline-block px-2.5 py-0.5 text-[10px] font-black rounded-lg ${property.type === 'rent' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {property.type === 'rent' ? 'להשכרה' : 'למכירה'}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0"
                    >
                        <X size={15} className="text-slate-600" />
                    </button>
                </div>

                {/* Hero image */}
                {property.images && property.images.length > 0 && (
                    <div className="h-52 overflow-hidden">
                        <img
                            src={property.images[0]}
                            alt={displayAddress}
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}

                <div className="px-5 py-4 space-y-4">
                    {/* Price */}
                    <div>
                        <p className="text-3xl font-black text-slate-900 tracking-tight">
                            ₪{(property.price || 0).toLocaleString()}
                            {property.type === 'rent' && (
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
                        {property.sqm && (
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                                <Maximize size={13} className="text-slate-400" />
                                {property.sqm} מ"ר
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

                    {/* Bottom spacing for mobile safe area */}
                    <div className="h-2" />
                </div>
            </div>
        </div>
    );
}
