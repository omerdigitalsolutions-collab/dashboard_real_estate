import { Property } from '../../types';
import { X, Building2, MapPin, Tag, Fullscreen, Image as ImageIcon, Loader2, Plus } from 'lucide-react';
import { useState, useRef } from 'react';
import { useAgents, useLeads } from '../../hooks/useFirestoreData';
import { updateProperty, uploadPropertyImages } from '../../services/propertyService';
import { useAuth } from '../../context/AuthContext';

interface PropertyDetailsModalProps {
    property: Property;
    onClose: () => void;
}

export default function PropertyDetailsModal({ property, onClose }: PropertyDetailsModalProps) {
    const { userData } = useAuth();
    const { data: agents = [] } = useAgents();
    const { data: leads = [] } = useLeads();

    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasImages = property.imageUrls && property.imageUrls.length > 0;
    const images = hasImages ? property.imageUrls! : [];

    const isRent = property.type === 'rent';
    const typeLabel = isRent ? 'להשכרה' : 'למכירה';
    const typeColor = isRent ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100';

    const handleUploadClick = () => {
        if (images.length >= 5) {
            alert('לא ניתן להוסיף מעל השניה 5 תמונות לנכס.');
            return;
        }
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        if (images.length + files.length > 5) {
            alert(`ניתן להעלות עד 5 תמונות סך הכל. נותרו לך ${5 - images.length} תמונות.`);
            return;
        }

        if (!userData?.agencyId) return;

        try {
            setIsUploading(true);
            const newUrls = await uploadPropertyImages(userData.agencyId, property.id, files);
            const combinedUrls = [...images, ...newUrls];
            await updateProperty(property.id, { imageUrls: combinedUrls });
            // Let the real-time listener update the local property obj eventually, or we could optimistic update.
            // But since this receives `property` from parent which has `useProperties` real-time, it will update automatically.
        } catch (error) {
            console.error('Error uploading images:', error);
            alert('אירעה שגיאה בהעלאת התמונות.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleAgentChange = async (newAgentId: string) => {
        try {
            await updateProperty(property.id, { agentId: newAgentId });
        } catch (err) {
            console.error('Error updating agent:', err);
            alert('שגיאה בשיוך סוכן.');
        }
    };

    const handleLeadChange = async (newLeadId: string) => {
        try {
            await updateProperty(property.id, { leadId: newLeadId });
        } catch (err) {
            console.error('Error updating lead:', err);
            alert('שגיאה בשיוך ליד.');
        }
    };

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

                        {hasImages && (
                            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar items-center">
                                {images.map((img, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setActiveImageIndex(idx)}
                                        className={`relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${activeImageIndex === idx ? 'border-blue-500 ring-4 ring-blue-500/20' : 'border-transparent hover:opacity-80'}`}
                                    >
                                        <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                                {images.length < 5 && (
                                    <button
                                        onClick={handleUploadClick}
                                        disabled={isUploading}
                                        className="w-20 h-20 flex-shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                                    >
                                        {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
                                        <span className="text-[10px] font-medium leading-tight">
                                            {isUploading ? 'מעלה...' : 'הוסף תמונה'}
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}

                        {!hasImages && (
                            <div className="flex justify-center mb-6">
                                <button
                                    onClick={handleUploadClick}
                                    disabled={isUploading}
                                    className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                                    הוסף תמונות ({images.length}/5)
                                </button>
                            </div>
                        )}
                        <input
                            type="file"
                            multiple
                            accept="image/*"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                        />

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

                        {/* Footer Info / Associations */}
                        <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col sm:flex-row gap-6 text-sm">
                            <div className="flex-1 space-y-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    שיוך סוכן מטפל
                                </label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
                                    value={property.agentId || ""}
                                    onChange={(e) => handleAgentChange(e.target.value)}
                                >
                                    <option value="" disabled>בחר סוכן...</option>
                                    {agents.map(a => (
                                        <option key={a.id} value={a.uid || a.id || ""}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1 space-y-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    שיוך ליד פוטנציאלי
                                </label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
                                    value={property.leadId || ""}
                                    onChange={(e) => handleLeadChange(e.target.value)}
                                >
                                    <option value="">ללא שיוך</option>
                                    {leads.map(l => (
                                        <option key={l.id} value={l.id}>{l.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                            <div>מזהה נכס: <span className="font-mono">{property.id?.slice(0, 8)}</span></div>
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
