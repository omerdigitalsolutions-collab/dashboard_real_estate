import { useState } from 'react';
import {
    MapPin, BedDouble, Maximize2, Layers, MessageCircle,
    ChevronLeft, ChevronRight, Home,
} from 'lucide-react';
import { Property } from '../../types';

// ─── Vibe Tags ────────────────────────────────────────────────────────────────
function getVibeTags(features: Property['features']): string[] {
    if (!features) return [];
    const tags: string[] = [];
    if (features.hasMamad) tags.push('ממ"ד');
    if (features.hasParking) tags.push('חנייה');
    if (features.hasBalcony) tags.push('מרפסת');
    if (features.hasElevator) tags.push('מעלית');
    if (features.isRenovated) tags.push('משופץ');
    if (features.isFurnished) tags.push('מרוהט');
    if (features.hasAirConditioning) tags.push('מיזוג');
    if (features.hasStorage) tags.push('מחסן');
    return tags;
}

// ─── Mini Image Carousel ──────────────────────────────────────────────────────
function CardCarousel({ images, alt }: { images: string[]; alt: string }) {
    const [current, setCurrent] = useState(0);
    const imgs = images.slice(0, 5);

    if (imgs.length === 0) {
        return (
            <div className="h-56 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-300 rounded-t-2xl">
                <Home size={40} />
            </div>
        );
    }

    return (
        <div className="relative h-56 bg-slate-100 overflow-hidden select-none rounded-t-2xl group">
            {imgs.map((src, i) => (
                <img
                    key={i}
                    src={src}
                    alt={alt}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${i === current ? 'opacity-100' : 'opacity-0'}`}
                />
            ))}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none z-10" />

            {imgs.length > 1 && (
                <>
                    <button
                        onClick={e => { e.stopPropagation(); setCurrent(i => (i - 1 + imgs.length) % imgs.length); }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); setCurrent(i => (i + 1) % imgs.length); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <ChevronRight size={14} />
                    </button>
                    {/* Dot indicators */}
                    <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex gap-1 pointer-events-none">
                        {imgs.map((_, i) => (
                            <div key={i} className={`h-1 rounded-full transition-all ${i === current ? 'bg-white w-5' : 'bg-white/50 w-1.5'}`} />
                        ))}
                    </div>
                </>
            )}

            {/* Image count */}
            {imgs.length > 1 && (
                <div className="absolute top-2.5 left-2.5 z-20 bg-black/50 text-white text-[10px] font-semibold px-2 py-0.5 rounded-lg pointer-events-none">
                    {current + 1}/{imgs.length}
                </div>
            )}
        </div>
    );
}

// ─── Agency Branding ──────────────────────────────────────────────────────────
interface AgencyInfo {
    name?: string;
    logoUrl?: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface PublicPropertyCardProps {
    property: Property;
    agency?: AgencyInfo;
    webotPhone?: string; // Agency WeBot WhatsApp number
}

export function PublicPropertyCard({ property, agency, webotPhone }: PublicPropertyCardProps) {
    const images: string[] = [
        ...(property.media?.mainImage ? [property.media.mainImage] : []),
        ...(property.media?.images || []),
    ].filter(Boolean);

    const address = property.address?.fullAddress || property.address?.city || '';
    const price = property.financials?.price ?? (property as any).price ?? 0;
    const rooms = property.rooms ?? (property as any).rooms ?? null;
    const sqm = property.squareMeters ?? (property as any).squareMeters ?? null;
    const floor = property.floor ?? (property as any).floor ?? null;
    const transactionType = property.transactionType ?? (property as any).transactionType ?? 'forsale';
    const tags = getVibeTags(property.features || {});

    const waMsg = `שלום, אני מעוניין/ת בנכס ב${address} (מזהה: ${property.id}). אפשר לקבל פרטים?`;
    const waLink = webotPhone
        ? `https://wa.me/${webotPhone.replace(/\D/g, '')}?text=${encodeURIComponent(waMsg)}`
        : null;

    return (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100/80 transition-all hover:shadow-xl hover:-translate-y-1 duration-300 flex flex-col">
            {/* Image carousel */}
            <div className="relative">
                <CardCarousel images={images} alt={address} />

                {/* Transaction type badge — bottom-left over image */}
                <div className="absolute bottom-2.5 right-2.5 z-20">
                    <span className={`px-2.5 py-1 text-[10px] font-black rounded-lg shadow backdrop-blur-sm ${transactionType === 'rent' ? 'bg-emerald-500/90 text-white' : 'bg-blue-600/90 text-white'}`}>
                        {transactionType === 'rent' ? 'להשכרה' : 'למכירה'}
                    </span>
                </div>
            </div>

            {/* Card body */}
            <div className="p-4 flex flex-col flex-1 text-right" dir="rtl">
                {/* Location */}
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
                    <MapPin size={11} className="text-slate-300 shrink-0" />
                    <span className="truncate font-medium">{address || 'מיקום לא צוין'}</span>
                </div>

                {/* Price — prominent */}
                <div className="text-2xl font-black text-slate-900 mb-3 tracking-tight leading-none">
                    ₪{price.toLocaleString()}
                    {transactionType === 'rent' && <span className="text-sm font-medium text-slate-400 mr-1">/חודש</span>}
                </div>

                {/* Specs row */}
                <div className="flex items-center flex-wrap gap-1.5 mb-3">
                    {rooms != null && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                            <BedDouble size={11} className="text-slate-400" />
                            {rooms} חד'
                        </span>
                    )}
                    {sqm != null && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                            <Maximize2 size={11} className="text-slate-400" />
                            {sqm} מ"ר
                        </span>
                    )}
                    {floor != null && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
                            <Layers size={11} className="text-slate-400" />
                            קומה {floor}
                        </span>
                    )}
                </div>

                {/* Vibe Tags */}
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {tags.map(tag => (
                            <span key={tag} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Description snippet */}
                {(property.management?.descriptions || (property as any).description) && (
                    <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-50 pt-3 line-clamp-2 mb-3">
                        {property.management?.descriptions || (property as any).description}
                    </p>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Agency branding */}
                {agency && (agency.name || agency.logoUrl) && (
                    <div className="flex items-center gap-2 mb-3 pt-2 border-t border-slate-50">
                        {agency.logoUrl ? (
                            <img src={agency.logoUrl} alt={agency.name || ''} className="h-5 w-auto max-w-[70px] object-contain shrink-0" />
                        ) : null}
                        <span className="text-xs text-slate-400 font-medium truncate">
                            {agency.logoUrl ? '' : 'מוצג ע"י '}
                            {agency.name}
                        </span>
                    </div>
                )}

                {/* WhatsApp CTA */}
                {waLink && (
                    <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1fbc5a] text-white transition-colors shadow-sm shadow-green-200"
                    >
                        <MessageCircle size={15} />
                        <span>צור קשר בוואטסאפ</span>
                    </a>
                )}
            </div>
        </div>
    );
}
