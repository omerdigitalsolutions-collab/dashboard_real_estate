import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCatalogWithQueries, SharedCatalog } from '../services/catalogService';
import { MapPin, BedDouble, MessageCircle, Home } from 'lucide-react';

export default function SharedCatalogPage() {
    const { token } = useParams<{ token: string }>();
    const [catalog, setCatalog] = useState<SharedCatalog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchCatalog() {
            if (!token) return;
            try {
                const data = await getCatalogWithQueries(token);
                if (!data) {
                    setError('הקטלוג המבוקש לא נמצא או שפג תוקפו.');
                } else {
                    setCatalog(data);
                }
            } catch (err) {
                console.error(err);
                setError('אירעה שגיאה בטעינת הקטלוג.');
            } finally {
                setLoading(false);
            }
        }
        fetchCatalog();
    }, [token]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-medium">טוען נכסים...</p>
            </div>
        );
    }

    if (error || !catalog) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-6">
                    <Home size={32} />
                </div>
                <h1 className="text-2xl font-bold text-slate-800 mb-2">אופס!</h1>
                <p className="text-slate-600 mb-8 max-w-sm">{error || 'הקישור פג תוקף. ניתן ליצור קשר עם הסוכן לקבלת קטלוג מעודכן.'}</p>
            </div>
        );
    }

    const { leadName, properties = [] } = catalog;
    // Format the WhatsApp message for the lead to contact the agent back
    // In a real app we'd fetch the agent's phone from `catalog.agencyId` and `users` collection.
    // For the demo, we use a placeholder or generic agency number.
    const agencyPhone = "972501234567"; // Placeholder
    const waMessage = encodeURIComponent(`היי, הסתכלתי על הקטלוג נכסים ששלחת (${window.location.href}) ואשמח לפרטים נוספים.`);
    const waLink = `https://wa.me/${agencyPhone}?text=${waMessage}`;

    return (
        <div className="max-w-md mx-auto min-h-screen bg-white shadow-xl relative pb-24">
            {/* Header */}
            <header className="bg-slate-900 text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 border border-white/20">
                        <Home size={28} className="text-blue-300" />
                    </div>
                    <h1 className="text-2xl font-bold mb-1">
                        {leadName ? `הנכסים שנבחרו עבור ${leadName}` : 'קטלוג נכסים אישי'}
                    </h1>
                    <p className="text-blue-200 text-sm">
                        מצאנו {properties.length} נכסים שיכולים להתאים לך
                    </p>
                </div>
            </header>

            <div className="p-4 space-y-6 mt-6">
                {properties.map((property: SharedCatalog['properties'][0], index: number) => (
                    <div key={property.id || index} className="bg-white border text-right border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        {/* Image Placeholder or Actual Image */}
                        <div className="h-48 bg-slate-100 relative">
                            {('images' in property && property.images && property.images.length > 0) ? (
                                <img src={property.images[0]} alt={property.address} className="absolute inset-0 w-full h-full object-cover" />
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10" />
                            <div className="absolute bottom-4 right-4 z-20">
                                <span className={`px-2.5 py-1 text-xs font-bold rounded-lg shadow-sm backdrop-blur-sm ${property.type === 'rent' ? 'bg-emerald-500/90 text-white' : 'bg-blue-600/90 text-white'
                                    }`}>
                                    {property.type === 'rent' ? 'להשכרה' : 'למכירה'}
                                </span>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="p-5">
                            <h2 className="text-xl font-bold text-slate-800 mb-2 leading-tight">
                                {property.address}
                            </h2>
                            <div className="text-2xl font-black text-blue-600 mb-4">
                                ₪{property.price.toLocaleString()}
                            </div>

                            <div className="flex items-center gap-4 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-2xl">
                                {/* Note: snapshotted property might not have city if it wasn't saved, so we gracefully hide it or use robust check */}
                                {('city' in property && property.city) && (
                                    <div className="flex items-center gap-1.5">
                                        <MapPin size={16} className="text-slate-400" />
                                        <span>{property.city as string}</span>
                                    </div>
                                )}
                                {property.rooms && (
                                    <div className="flex items-center gap-1.5">
                                        <BedDouble size={16} className="text-slate-400" />
                                        <span>{property.rooms} חדרים</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating Action CTA */}
            <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-white via-white to-transparent pb-6 pt-12 z-50 pointer-events-none">
                <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-[#25D366]/30 transition-transform active:scale-95 pointer-events-auto"
                >
                    <MessageCircle size={24} />
                    <span>דבר איתנו בוואטסאפ</span>
                </a>
            </div>
        </div>
    );
}
