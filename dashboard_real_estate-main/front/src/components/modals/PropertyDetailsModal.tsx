import { Property, AppUser, Lead } from '../../types';
import { X, Building2, MapPin, Tag, Fullscreen, Image as ImageIcon, Loader2, Plus, Handshake, Trash2, GripVertical } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { updateProperty, uploadPropertyImages } from '../../services/propertyService';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    TouchSensor,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PropertyDetailsModalProps {
    property: Property;
    agents: AppUser[];
    leads: Lead[];
    onClose: () => void;
    onCreateDeal?: (property: Property) => void;
}

interface SortableThumbnailProps {
    url: string;
    index: number;
    isActive: boolean;
    onSelect: (index: number) => void;
    onDelete: (index: number) => void;
}

function SortableThumbnail({ url, index, isActive, onSelect, onDelete }: SortableThumbnailProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: url });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative group w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${isActive ? 'border-blue-500 ring-4 ring-blue-500/20' : 'border-transparent'}`}
        >
            <img 
                src={url} 
                alt={`Thumbnail ${index + 1}`} 
                className="w-full h-full object-cover cursor-pointer" 
                onClick={() => onSelect(index)}
            />
            
            {/* Overlay controls */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1">
                <div className="flex justify-between items-start">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(index);
                        }}
                        className="p-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                    >
                        <Trash2 size={12} />
                    </button>
                    <div 
                        {...attributes} 
                        {...listeners}
                        className="p-1 bg-white/20 text-white rounded-md cursor-grab active:cursor-grabbing"
                    >
                        <GripVertical size={12} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PropertyDetailsModal({ property, agents, leads, onClose, onCreateDeal }: PropertyDetailsModalProps) {
    const { userData } = useAuth();
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [imageUrls, setImageUrls] = useState<string[]>(property.imageUrls || []);

    // Description Edit State
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedDescription, setEditedDescription] = useState(property.description || '');
    const [isSavingDescription, setIsSavingDescription] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync state when property prop changes
    useEffect(() => {
        setEditedDescription(property.description || '');
        if (property.imageUrls) {
            setImageUrls(property.imageUrls);
        }
    }, [property]);

    const hasImages = imageUrls.length > 0;
    const images = imageUrls;

    const isRent = property.type === 'rent';
    const typeLabel = isRent ? 'להשכרה' : 'למכירה';
    const typeColor = isRent ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100';

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleUploadClick = () => {
        if (images.length >= 10) { // Increased limit slightly for better utility, matching general expectations but keeping it reasonable
            toast.error('לא ניתן להוסיף מעל 10 תמונות לנכס.');
            return;
        }
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        if (images.length + files.length > 10) {
            toast.error(`ניתן להעלות עד 10 תמונות סך הכל. נותרו לך ${10 - images.length} תמונות להעלאה.`);
            return;
        }

        if (!userData?.agencyId) return;

        try {
            setIsUploading(true);
            const newUrls = await uploadPropertyImages(userData.agencyId, property.id, files);
            const combinedUrls = [...imageUrls, ...newUrls];
            setImageUrls(combinedUrls);
            await updateProperty(property.id, { imageUrls: combinedUrls });
            toast.success('התמונות הועלו בהצלחה ✓');
        } catch (error) {
            console.error('Error uploading images:', error);
            toast.error('אירעה שגיאה בהעלאת התמונות.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteImage = async (index: number) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק תמונה זו?')) return;

        try {
            const newImages = imageUrls.filter((_, i) => i !== index);
            setImageUrls(newImages);
            await updateProperty(property.id, { imageUrls: newImages });
            
            // Adjust active index if needed
            if (activeImageIndex >= newImages.length) {
                setActiveImageIndex(Math.max(0, newImages.length - 1));
            }
            
            toast.success('התמונה נמחקה בהצלחה');
        } catch (error) {
            console.error('Error deleting image:', error);
            toast.error('שגיאה במחיקת התמונה');
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = imageUrls.indexOf(active.id as string);
        const newIndex = imageUrls.indexOf(over.id as string);

        if (oldIndex === -1 || newIndex === -1) return;

        const newImages = arrayMove(imageUrls, oldIndex, newIndex);
        
        // Immediate UI Update
        setImageUrls(newImages);
        
        try {
            await updateProperty(property.id, { imageUrls: newImages });
            // Sync active index to the moved image
            if (activeImageIndex === oldIndex) {
                setActiveImageIndex(newIndex);
            } else if (activeImageIndex > oldIndex && activeImageIndex <= newIndex) {
                setActiveImageIndex(activeImageIndex - 1);
            } else if (activeImageIndex < oldIndex && activeImageIndex >= newIndex) {
                setActiveImageIndex(activeImageIndex + 1);
            }
        } catch (error) {
            console.error('Error reordering images:', error);
            toast.error('שגיאה בשינוי סדר התמונות');
        }
    };

    const handleAgentChange = async (newAgentId: string) => {
        try {
            await updateProperty(property.id, { agentId: newAgentId });
            toast.success('סוכן מוקצה עודכן בהצלחה ✓');
        } catch (err) {
            console.error('Error updating agent:', err);
            toast.error('שגיאה בשיוך סוכן.');
        }
    };

    const handleLeadChange = async (newLeadId: string) => {
        try {
            await updateProperty(property.id, { leadId: newLeadId });
            toast.success('שיוך ליד עודכן בהצלחה ✓');
        } catch (err) {
            console.error('Error updating lead:', err);
            toast.error('שגיאה בשיוך ליד.');
        }
    };

    const handleSaveDescription = async () => {
        try {
            setIsSavingDescription(true);
            await updateProperty(property.id, { description: editedDescription });
            toast.success('תיאור הנכס שומר בהצלחה ✓');
            setIsEditingDescription(false);
        } catch (err) {
            console.error('Error updating description:', err);
            toast.error('שגיאה בשמירת תיאור הנכס.');
        } finally {
            setIsSavingDescription(false);
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
                        <div className="flex items-center gap-2">
                            {onCreateDeal && (
                                <button
                                    onClick={() => onCreateDeal(property)}
                                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded-lg transition-colors text-sm"
                                >
                                    <Handshake size={16} />
                                    <span className="hidden sm:inline">צור עסקה</span>
                                </button>
                            )}
                            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 pretty-scroll">
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
                                {property.listingType === 'exclusive' || property.isExclusive ? (
                                    <div className="absolute top-4 right-4 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                                        <Tag size={12} fill="currentColor" />
                                        👑 בלעדיות
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <div className="w-full aspect-video rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 mb-6 relative">
                                <ImageIcon size={48} className="mb-3 opacity-50" />
                                <p className="text-sm font-medium">אין תמונות לנכס זה</p>
                                {property.listingType === 'exclusive' || property.isExclusive ? (
                                    <div className="absolute top-4 right-4 bg-amber-50 text-amber-600 text-xs font-bold px-3 py-1.5 rounded-full border border-amber-100 flex items-center gap-1">
                                        <Tag size={12} fill="currentColor" />
                                        👑 בלעדיות חברה
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {hasImages && (
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">ניהול תמונות (גרור לשינוי סדר)</span>
                                    <span className="text-xs font-medium text-slate-400">{images.length}/10</span>
                                </div>
                                <DndContext 
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar items-center">
                                        <SortableContext 
                                            items={images}
                                            strategy={horizontalListSortingStrategy}
                                        >
                                            {images.map((img, idx) => (
                                                <SortableThumbnail 
                                                    key={img}
                                                    url={img}
                                                    index={idx}
                                                    isActive={activeImageIndex === idx}
                                                    onSelect={setActiveImageIndex}
                                                    onDelete={handleDeleteImage}
                                                />
                                            ))}
                                        </SortableContext>
                                        
                                        {images.length < 10 && (
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
                                </DndContext>
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
                                    הוסף תמונות ({images.length}/10)
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
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    תיאור הנכס
                                </h3>
                                {!isEditingDescription ? (
                                    <button
                                        onClick={() => setIsEditingDescription(true)}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors"
                                    >
                                        ערוך
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setIsEditingDescription(false);
                                                setEditedDescription(property.description || '');
                                            }}
                                            disabled={isSavingDescription}
                                            className="text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            ביטול
                                        </button>
                                        <button
                                            onClick={handleSaveDescription}
                                            disabled={isSavingDescription}
                                            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            {isSavingDescription && <Loader2 size={12} className="animate-spin" />}
                                            שמור שינויים
                                        </button>
                                    </div>
                                )}
                            </div>

                            {isEditingDescription ? (
                                <textarea
                                    className="w-full bg-white border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 rounded-xl p-4 text-sm text-slate-700 leading-relaxed min-h-[120px] resize-y transition-all outline-none custom-scrollbar"
                                    value={editedDescription}
                                    onChange={(e) => setEditedDescription(e.target.value)}
                                    placeholder="הזן תיאור מילולי של הנכס..."
                                    dir="rtl"
                                    autoFocus
                                />
                            ) : (
                                property.description ? (
                                    <div
                                        className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors group relative"
                                        onClick={() => setIsEditingDescription(true)}
                                    >
                                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                                            {property.description}
                                        </p>
                                        <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-sm border border-slate-200 rounded p-1.5 text-slate-400 pointer-events-none">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="text-sm text-slate-400 italic bg-slate-50 p-4 rounded-xl cursor-pointer hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all flex items-center justify-between group"
                                        onClick={() => setIsEditingDescription(true)}
                                    >
                                        <span>לא הוזן תיאור מילולי לנכס זה. לחץ להוספה...</span>
                                        <Plus size={16} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                                    </div>
                                )
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
