import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Property } from '../../types';
import { Maximize2, Minimize2, X, MapPin, Target } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { useAuth } from '../../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';


// ─── Fix Leaflet's default marker icon path issue in Vite ─────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Israel fallback center ────────────────────────────────────────────────────
const ISRAEL_CENTER: [number, number] = [31.7683, 35.2137];

// ─── Custom HTML marker icon factory ──────────────────────────────────────────
function createHouseIcon(listingType: 'sale' | 'rent', kind?: string) {
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
        ? `<g transform="translate(10,8)" fill="white"><path d="M2,2 L14,2 L14,16 L2,16 Z M5,5 h2 v2 h-2 z M9,5 h2 v2 h-2 z M5,9 h2 v2 h-2 z M9,9 h2 v2 h-2 z" opacity="0.95"/></g>`
        : `<g transform="translate(9,8)" fill="white"><polygon points="9,2 0,9 2,9 2,16 7,16 7,11 11,11 11,16 16,16 16,9 18,9" opacity="0.95"/></g>`;

    return L.divIcon({
        html: `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
          <ellipse cx="18" cy="42" rx="8" ry="3" fill="rgba(0,0,0,0.2)"/>
          <path d="M18 0 C8.06 0 0 8.06 0 18 C0 29 18 44 18 44 C18 44 36 29 36 18 C36 8.06 27.94 0 18 0Z"
                fill="${bg}" stroke="${shadow}" stroke-width="1.5"/>
          ${innerIcon}
        </svg>`,
        className: '',
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -46],
    });
}

// ─── Auto-recenter when center changes ────────────────────────────────────────
function MapAutoCenter({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap();
    const prevCenter = useRef<[number, number] | null>(null);
    useEffect(() => {
        if (
            prevCenter.current === null ||
            prevCenter.current[0] !== center[0] ||
            prevCenter.current[1] !== center[1]
        ) {
            map.setView(center, zoom, { animate: true });
            prevCenter.current = center;
        }
        // Re-render tiles when container size changes
        setTimeout(() => map.invalidateSize(), 100);
    }, [map, center, zoom]);
    return null;
}

// ─── Popup content ─────────────────────────────────────────────────────────────
function PropertyPopupContent({ p }: { p: Property }) {
    const isRent = p.type === 'rent';
    const color = isRent
        ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30'
        : 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30';
    const label = isRent ? 'להשכרה' : 'למכירה';
    const price = isRent
        ? `₪${p.price.toLocaleString()}/חודש`
        : `₪${(p.price / 1_000_000).toFixed(2)}M`;

    return (
        <div className="text-right min-w-[180px]" dir="rtl">
            <p className="font-bold text-slate-800 text-sm leading-snug mb-1">{p.address}</p>
            {p.city && <p className="text-xs text-slate-500 mb-2">{p.city}</p>}
            <div className="flex items-center justify-between gap-2 mt-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>{label}</span>
                <span className="text-sm font-bold text-slate-900">{price}</span>
            </div>
            {p.rooms && (
                <p className="text-xs text-slate-500 mt-1">{p.rooms} חדרים</p>
            )}
            {p.exclusivityEndDate && (
                <p className="text-[10px] text-amber-600 mt-1 font-medium">
                    בלעדיות עד: {p.exclusivityEndDate.toDate().toLocaleDateString('he-IL')}
                </p>
            )}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface PropertyMapProps {
    height?: string;
}

export default function PropertyMap({ height = '360px' }: PropertyMapProps) {
    const { properties } = useLiveDashboardData();
    const { userData } = useAuth();
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Smart map center: agency service area > first property > Israel
    const [mapCenter, setMapCenter] = useState<[number, number]>(ISRAEL_CENTER);
    const [mapZoom, setMapZoom] = useState(9);
    const [centerLabel, setCenterLabel] = useState('');

    const recenterMap = async () => {
        if (!userData?.agencyId) return;

        try {
            // Try agency's mainServiceArea first
            const agencySnap = await getDoc(doc(db, 'agencies', userData.agencyId));
            const agencyData = agencySnap.data() as { mainServiceArea?: string } | undefined;
            const area = agencyData?.mainServiceArea;

            if (area) {
                const getCoords = httpsCallable(functions, 'properties-getCoordinates');
                const geoRes = await getCoords({ address: area });
                const coords = geoRes.data as { lat: number, lng: number } | null;
                if (coords) {
                    setMapCenter([coords.lat, coords.lng]);
                    setMapZoom(13);
                    setCenterLabel(area);
                    return;
                }
            }
        } catch { /* ignore */ }

        // Fallback: first property with coords
        const propertyWithCoords = properties.find(p => p.lat && p.lng);
        if (propertyWithCoords) {
            setMapCenter([propertyWithCoords.lat!, propertyWithCoords.lng!]);
            setMapZoom(13);
            setCenterLabel(propertyWithCoords.city || propertyWithCoords.address || '');
        } else {
            setMapCenter(ISRAEL_CENTER);
            setMapZoom(9);
            setCenterLabel('');
        }
    };

    // ── Step 2: Smart center — agency service area → first property → Israel ──
    useEffect(() => {
        recenterMap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userData?.agencyId, properties.length]);

    const geoProps = properties.filter(p => p.lat && p.lng);
    const saleCount = geoProps.filter(p => p.type === 'sale').length;
    const rentCount = geoProps.filter(p => p.type === 'rent').length;

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

            {/* Map */}
            <div
                className="flex-1 rounded-xl overflow-hidden border border-slate-800 shadow-xl relative isolate"
                style={{
                    height: fullscreen ? '100%' : `calc(${height} - 32px)`,
                    minHeight: fullscreen ? 'auto' : '300px',
                    zIndex: 0 // Creates local stacking context to prevent leaflet from bleeding into z-50 modals
                }}
            >
                {/* Floating Centering Button */}
                <div className="absolute top-3 right-3 z-[400]">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            recenterMap();
                        }}
                        className="bg-white/90 backdrop-blur-sm border border-slate-200 p-2 rounded-lg shadow-md text-slate-700 hover:text-blue-600 hover:bg-white transition-all flex items-center gap-2 group cursor-pointer"
                        title="מרכז מפה לאזור השירות או לנכס הקרוב"
                    >
                        <Target size={16} className="group-hover:scale-110 transition-transform text-blue-600" />
                        <span className="text-xs font-bold pr-1">מיקוד מפה</span>
                    </button>
                </div>
                {/* No coords fallback message inside map container */}
                {geoProps.length === 0 && properties.length > 0 && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f172a]/70 backdrop-blur-sm">
                        <MapPin size={32} className="opacity-40 text-slate-400 mb-2" />
                        <p className="text-sm font-semibold text-slate-300">לא נמצאו נכסים עם כתובת ניתנת למיקום.</p>
                    </div>
                )}
                <MapContainer
                    center={ISRAEL_CENTER}
                    zoom={9}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%', backgroundColor: '#f8fafc' }}
                >
                    <MapAutoCenter center={mapCenter} zoom={mapZoom} />
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {geoProps.map(p => (
                        <Marker
                            key={p.id}
                            position={[p.lat!, p.lng!]}
                            icon={createHouseIcon(p.type as 'sale' | 'rent', p.kind)}
                        >
                            <Popup>
                                <PropertyPopupContent p={p} />
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );

    return (
        <>
            {mapContent(false)}

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
