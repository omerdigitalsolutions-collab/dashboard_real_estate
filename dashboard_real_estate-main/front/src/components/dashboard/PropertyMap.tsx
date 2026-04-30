import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindow } from '@react-google-maps/api';
import { Property } from '../../types';
import { Maximize2, Minimize2, X, MapPin, Target, Loader2 } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { useAuth } from '../../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { httpsCallable, getFunctions } from 'firebase/functions';

// ─── Google Maps Config ────────────────────────────────────────────────────────
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
    console.error("VITE_GOOGLE_MAPS_API_KEY is missing in the local environment!");
} else {
    console.log("Google Maps API Key loaded (length):", GOOGLE_MAPS_API_KEY.length);
}

// ─── Israel fallback center ────────────────────────────────────────────────────
const ISRAEL_CENTER = { lat: 31.7683, lng: 35.2137 };

// ─── Custom SVG marker factory ────────────────────────────────────────────────
function getGoogleMarkerIcon(listingType: 'sale' | 'rent', kind?: string): google.maps.Icon | string {
    const isCommercial = kind === 'מסחרי';
    const isRent = listingType === 'rent';

    let bg = '#06b6d4';     // cyan → for sale
    let shadow = '#0891b2';

    if (isCommercial) {
        bg = '#f97316';     // orange → commercial
        shadow = '#ea580c';
    } else if (isRent) {
        bg = '#10b981';     // emerald → rent
        shadow = '#059669';
    }

    const innerIcon = isCommercial
        ? `<path d="M2,2 L14,2 L14,16 L2,16 Z M5,5 h2 v2 h-2 z M9,5 h2 v2 h-2 z M5,9 h2 v2 h-2 z M9,9 h2 v2 h-2 z" fill="white" transform="translate(10,8)"/>`
        : `<polygon points="9,2 0,9 2,9 2,16 7,16 7,11 11,11 11,16 16,16 16,9 18,9" fill="white" transform="translate(9,8)"/>`;

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <ellipse cx="18" cy="42" rx="8" ry="3" fill="rgba(0,0,0,0.2)"/>
      <path d="M18 0 C8.06 0 0 8.06 0 18 C0 29 18 44 18 44 C18 44 36 29 36 18 C36 8.06 27.94 0 18 0Z"
            fill="${bg}" stroke="${shadow}" stroke-width="1.5"/>
      ${innerIcon}
    </svg>`;

    return {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new google.maps.Size(36, 44),
        anchor: new google.maps.Point(18, 44)
    };
}

// ─── Popup Content (Internal Component) ────────────────────────────────────────
function PropertyPopup({ p, onClose }: { p: Property; onClose: () => void }) {
    const isRent = p.transactionType === 'rent';
    const color = isRent
        ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
        : 'text-cyan-600 bg-cyan-50 border-cyan-100';
    const label = isRent ? 'להשכרה' : 'למכירה';
    const price = p.financials?.price ?? 0;
    const priceFormatted = isRent
        ? `₪${price.toLocaleString()}/חודש`
        : `₪${(price / 1_000_000).toFixed(2)}M`;
    const coords = p.address?.coords;

    return (
        <InfoWindow position={{ lat: coords?.lat ?? 0, lng: coords?.lng ?? 0 }} onCloseClick={onClose}>
            <div className="text-right p-1 min-w-[200px]" dir="rtl">
                <p className="font-bold text-slate-800 text-sm leading-snug mb-1">{p.address?.fullAddress}</p>
                {p.address?.city && <p className="text-xs text-slate-500 mb-2">{p.address.city}</p>}
                <div className="flex items-center justify-between gap-2 mt-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${color}`}>{label}</span>
                    <span className="text-sm font-bold text-slate-900">{priceFormatted}</span>
                </div>
                {p.rooms && (
                    <p className="text-xs text-slate-500 mt-1">{p.rooms} חדרים • {p.squareMeters || '?'} מ"ר</p>
                )}
            </div>
        </InfoWindow>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface PropertyMapProps {
    height?: string;
}

function PropertyMapComponent({ height = '360px' }: PropertyMapProps) {
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
        language: 'he',
        region: 'IL'
    });

    const { properties } = useLiveDashboardData();
    const { userData } = useAuth();
    
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

    // Smart map center
    const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(ISRAEL_CENTER);
    const [mapZoom, setMapZoom] = useState(9);
    const [centerLabel, setCenterLabel] = useState('');

    const onLoad = useCallback((_m: google.maps.Map) => {
        // Map instance ready
    }, []);

    const onUnmount = useCallback(() => {
        // Map cleaning
    }, []);

    const recenterMap = async () => {
        if (!userData?.agencyId) return;

        try {
            const agencySnap = await getDoc(doc(db, 'agencies', userData.agencyId));
            const agencyData = agencySnap.data() as { mainServiceArea?: string } | undefined;
            const area = agencyData?.mainServiceArea;

            if (area) {
                const fns = getFunctions(undefined, 'europe-west1');
                const getCoords = httpsCallable(fns, 'properties-getCoordinates');
                const geoRes = await getCoords({ address: area });
                const coords = geoRes.data as { lat: number, lng: number } | null;
                if (coords) {
                    setMapCenter({ lat: coords.lat, lng: coords.lng });
                    setMapZoom(13);
                    setCenterLabel(area);
                    return;
                }
            }
        } catch { /* ignore */ }

        const propertyWithCoords = properties.find(p => p.address?.coords?.lat && p.address?.coords?.lng);
        if (propertyWithCoords) {
            const c = propertyWithCoords.address!.coords!;
            setMapCenter({ lat: c.lat, lng: c.lng });
            setMapZoom(13);
            setCenterLabel(propertyWithCoords.address?.city || propertyWithCoords.address?.fullAddress || '');
        } else {
            setMapCenter(ISRAEL_CENTER);
            setMapZoom(9);
            setCenterLabel('');
        }
    };

    useEffect(() => {
        recenterMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userData?.agencyId, properties.length]);

    const geoProps = useMemo(() => properties.filter(p => p.address?.coords?.lat && p.address?.coords?.lng), [properties]);
    const saleCount = geoProps.filter(p => p.transactionType === 'forsale').length;
    const rentCount = geoProps.filter(p => p.transactionType === 'rent').length;

    const mapContent = (fullscreen: boolean) => (
        <div className={`flex flex-col ${fullscreen ? 'h-full' : ''}`} style={fullscreen ? {} : { height }}>
            {/* Legend + controls */}
            <div className="flex items-center justify-between mb-2 flex-shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                    {centerLabel && (
                        <span className="flex items-center gap-1 text-slate-500">
                            <MapPin size={11} />
                            {centerLabel}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-cyan-500 flex-shrink-0 shadow-[0_0_5px_currentColor]" />
                        <span className="text-xs text-slate-300">למכירה ({saleCount})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0 shadow-[0_0_5px_currentColor]" />
                        <span className="text-xs text-slate-300">להשכרה ({rentCount})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0 shadow-[0_0_5px_currentColor]" />
                        <span className="text-xs text-slate-300">מסחרי</span>
                    </div>

                    <div className="flex items-center gap-1 mr-2 bg-slate-900/80 rounded-lg p-1 text-slate-400 border border-slate-800">
                        <button
                            onClick={() => setIsFullscreen(v => !v)}
                            className="p-1 rounded-md hover:bg-slate-800 hover:text-cyan-400 transition-all flex items-center gap-1.5 px-2"
                            title={fullscreen ? 'צמצם' : 'הרחב מסך'}
                        >
                            <span className="text-xs font-medium">{fullscreen ? 'צמצם מסך' : 'הרחב מסך'}</span>
                            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div
                className="flex-1 rounded-xl overflow-hidden border border-slate-800 shadow-xl relative isolate bg-slate-900"
                style={{
                    height: fullscreen ? '100%' : `calc(${height} - 32px)`,
                    minHeight: fullscreen ? 'auto' : '300px'
                }}
            >
                {/* Floating Centering Button */}
                <div className="absolute top-3 right-3 z-[10]">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            recenterMap();
                        }}
                        className="bg-white/90 backdrop-blur-sm border border-slate-200 p-2 rounded-lg shadow-md text-slate-700 hover:text-blue-600 hover:bg-white transition-all flex items-center gap-2 group cursor-pointer"
                        title="מרכז מפה"
                    >
                        <Target size={16} className="group-hover:scale-110 transition-transform text-blue-600" />
                        <span className="text-xs font-bold pr-1">מיקוד מפה</span>
                    </button>
                </div>

                {!isLoaded ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="animate-spin text-blue-500" size={32} />
                    </div>
                ) : (
                    <GoogleMap
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        center={mapCenter}
                        zoom={mapZoom}
                        onLoad={onLoad}
                        onUnmount={onUnmount}
                        options={{
                            disableDefaultUI: false,
                            streetViewControl: false,
                            mapTypeControl: true,
                            styles: [] // Regular map style
                        }}
                    >
                        {geoProps.map(p => (
                            <MarkerF
                                key={p.id}
                                position={{ lat: p.address!.coords!.lat, lng: p.address!.coords!.lng }}
                                icon={getGoogleMarkerIcon(p.transactionType === 'rent' ? 'rent' : 'sale', p.propertyType)}
                                onClick={() => setSelectedProperty(p)}
                            />
                        ))}

                        {selectedProperty && (
                            <PropertyPopup p={selectedProperty} onClose={() => setSelectedProperty(null)} />
                        )}
                    </GoogleMap>
                )}

                {/* No coords fallback */}
                {isLoaded && geoProps.length === 0 && properties.length > 0 && (
                    <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center bg-[#0f172a]/70 backdrop-blur-sm pointer-events-none">
                        <MapPin size={32} className="opacity-40 text-slate-400 mb-2" />
                        <p className="text-sm font-semibold text-slate-300">לא נמצאו נכסים עם כתובת ניתנת למיקום.</p>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <>
            <div style={{ display: isFullscreen ? 'none' : 'block', height: '100%' }}>
                {mapContent(false)}
            </div>

            {isFullscreen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" dir="rtl">
                    <div className="bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col p-5 relative">
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="absolute top-4 left-4 z-10 p-2 rounded-xl bg-slate-900 border border-slate-800 shadow-md hover:bg-slate-800 text-slate-300 transition-colors"
                        >
                            <X size={18} />
                        </button>
                        <h3 className="text-base font-bold text-white mb-4 text-right pr-2">
                            🗺 מפת נכסים
                        </h3>
                        <div className="flex-1 min-h-0 bg-[#0f172a] rounded-xl overflow-hidden border border-slate-800 shadow-xl relative isolate">
                            {mapContent(true)}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

export default memo(PropertyMapComponent);
