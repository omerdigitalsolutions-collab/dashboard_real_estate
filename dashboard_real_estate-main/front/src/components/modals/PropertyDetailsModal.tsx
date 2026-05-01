import { Property, AppUser, Lead, Agency } from '../../types';
import { X, Building2, MapPin, Tag, Fullscreen, Image as ImageIcon, Loader2, Plus, Handshake, Trash2, GripVertical, Calendar, ExternalLink, ArrowUpLeft, Video, VideoOff, Phone, MessageCircle, ChevronLeft, ChevronRight, User, Building } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { updateProperty, uploadPropertyImages, uploadPropertyVideo } from '../../services/propertyService';
import { useAuth } from '../../context/AuthContext';
import { useSuperAdmin } from '../../hooks/useSuperAdmin';
import toast from 'react-hot-toast';
import { AddMeetingModal } from './AddMeetingModal';
import { translatePropertyKind } from '../../utils/formatters';

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
    agency?: Agency;
    onClose: () => void;
    onCreateDeal?: (property: Property) => void;
}

interface SortableThumbnailProps {
    url: string;
    index: number;
    isActive: boolean;
    onSelect: (index: number) => void;
    onDelete: (index: number) => void;
    isReadOnly?: boolean;
}

function SortableThumbnail({ url, index, isActive, onSelect, onDelete, isReadOnly }: SortableThumbnailProps) {
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
            {!isReadOnly && (
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
            )}
        </div>
    );
}

export default function PropertyDetailsModal({ property, agents, leads, agency, onClose, onCreateDeal }: PropertyDetailsModalProps) {
    const { userData } = useAuth();
    const { isSuperAdmin } = useSuperAdmin();
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const [imageUrls, setImageUrls] = useState<string[]>(property.media?.images || []);
    const [videoUrl, setVideoUrl] = useState<string | undefined>(property.media?.videoTourUrl ?? undefined);
    const initVideoUrls = (): string[] => {
        if (property.media?.videoTourUrl) return [property.media.videoTourUrl];
        return [];
    };
    const [videoUrls, setVideoUrls] = useState<string[]>(initVideoUrls);

    // Description Edit State
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedDescription, setEditedDescription] = useState(property.management?.descriptions || property.rawDescription || '');
    const [isSavingDescription, setIsSavingDescription] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [showAddMeetingModal, setShowAddMeetingModal] = useState(false);
    const [isSharingToMarketplace, setIsSharingToMarketplace] = useState(false);

    const handleToggleMarketplace = async () => {
        if (!property.id) return;

        setIsSharingToMarketplace(true);
        try {
            const newStatus = property.collaborationStatus === 'collaborative' ? 'private' : 'collaborative';
            await updateProperty(property.id, {
                collaborationStatus: newStatus
            }, property.isGlobalCityProperty ? property.address?.city : undefined);
            
            toast.success(newStatus === 'collaborative' ? 'הנכס שותף במרקטפלייס בהצלחה' : 'הנכס הוסר מהמרקטפלייס');
        } catch (error) {
            console.error('Error toggling marketplace status:', error);
            toast.error('שגיאה בעדכון סטטוס שיתוף');
        } finally {
            setIsSharingToMarketplace(false);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    // Debug: log description fields for global city properties to diagnose Jerusalem issue
    useEffect(() => {
        if (property.isGlobalCityProperty) {
            console.log('[PropertyDetails] description debug', {
                id: property.id,
                city: property.address?.city,
                description: property.management?.descriptions?.substring(0, 120),
                rawDescription: property.rawDescription?.substring(0, 120),
                descriptionTruthy: !!property.management?.descriptions,
                rawDescriptionTruthy: !!property.rawDescription,
                descriptionTrimmed: property.management?.descriptions?.trim()?.substring(0, 120),
            });
        }
    }, [property]);

    // Sync state when property prop changes
    useEffect(() => {
        setEditedDescription(property.management?.descriptions || property.rawDescription || '');
        if (property.media?.images) {
            setImageUrls(property.media.images);
        }
        setVideoUrl(property.media?.videoTourUrl ?? undefined);
        if (property.media?.videoTourUrl) {
            setVideoUrls([property.media.videoTourUrl]);
        } else {
            setVideoUrls([]);
        }
    }, [property]);
    // Add keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isImageFullscreen || (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
                if (e.key === 'ArrowRight') {
                    setActiveImageIndex(prev => (prev - 1 + imageUrls.length) % imageUrls.length);
                } else if (e.key === 'ArrowLeft') {
                    setActiveImageIndex(prev => (prev + 1) % imageUrls.length);
                } else if (e.key === 'Escape' && isImageFullscreen) {
                    setIsImageFullscreen(false);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isImageFullscreen, imageUrls.length]);

    const nextImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setActiveImageIndex(prev => (prev + 1) % images.length);
    };

    const prevImage = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setActiveImageIndex(prev => (prev - 1 + images.length) % images.length);
    };

    const hasImages = imageUrls.length > 0;
    const hasVideos = videoUrls.length > 0;
    const images = imageUrls;
    // For primary media: images take priority, then first video acts as primary
    const primaryVideoAsCover = !hasImages && hasVideos;

    const externalUrl = property.yad2Link || property.externalLink;
    const isYad2Link = !!externalUrl?.startsWith('https://www.yad2.co.il/');
    const externalButtonText = isYad2Link ? 'לינק למודעה ביד 2' : 'מדלן';
    const displayDescription = property.management?.descriptions?.trim() || property.rawDescription?.trim();

    const isRent = property.transactionType === 'rent';
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
            const newUrls = await uploadPropertyImages(
                userData.agencyId,
                property.id,
                files,
                property.isGlobalCityProperty,
                isSuperAdmin
            );
            const combinedUrls = [...imageUrls, ...newUrls];
            setImageUrls(combinedUrls);
            await updateProperty(property.id, { media: { images: combinedUrls } }, property.isGlobalCityProperty ? property.address?.city : undefined);
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
            await updateProperty(property.id, { media: { images: newImages } }, property.isGlobalCityProperty ? property.address?.city : undefined);
            
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
            await updateProperty(property.id, { media: { images: newImages } }, property.isGlobalCityProperty ? property.address?.city : undefined);
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
            await updateProperty(property.id, { management: { assignedAgentId: newAgentId } }, property.isGlobalCityProperty ? property.address?.city : undefined);
            toast.success('סוכן מוקצה עודכן בהצלחה ✓');
        } catch (err) {
            console.error('Error updating agent:', err);
            toast.error('שגיאה בשיוך סוכן.');
        }
    };

    const handleLeadChange = async (newLeadId: string) => {
        if (property.isGlobalCityProperty) {
            toast.error('עליך לייבא את הנכס למלאי הפרטי שלך לפני שיוך לקוח.');
            return;
        }
        try {
            await updateProperty(property.id, { leadId: newLeadId });
            toast.success('שיוך ליד עודכן בהצלחה ✓');
        } catch (err) {
            console.error('Error updating lead:', err);
            toast.error('שגיאה בשיוך ליד.');
        }
    };

    const handleImportToMyProperties = async () => {
        try {
            setIsImporting(true);
            const newId = await updateProperty(property.id, {}, property.address?.city);
            if (newId !== property.id) {
                toast.success('הנכס נוסף למלאי שלך בהצלחה! ✓');
                onClose();
            }
        } catch (err) {
            console.error('Error importing property:', err);
            toast.error('אירעה שגיאה בייבוא הנכס למלאי שלך.');
        } finally {
            setIsImporting(false);
        }
    };

    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userData?.agencyId) return;

        if (videoUrls.length >= 3) {
            toast.error('ניתן להוסיף עד 3 סרטונים לנכס.');
            return;
        }

        if (file.size > 200 * 1024 * 1024) {
            toast.error('הסרטון גדול מדי. מקסימום 200MB.');
            return;
        }

        if (property.isGlobalCityProperty && !isSuperAdmin) {
            toast.error('עליך לייבא את הנכס למלאי הפרטי שלך לפני הוספת סרטון.');
            return;
        }

        try {
            setIsUploadingVideo(true);
            const url = await uploadPropertyVideo(
                userData.agencyId,
                property.id,
                file,
                property.isGlobalCityProperty,
                isSuperAdmin
            );
            const newVideoUrls = [...videoUrls, url];
            setVideoUrls(newVideoUrls);
            setVideoUrl(newVideoUrls[0]); // keep legacy field in sync
            await updateProperty(property.id, { media: { images: imageUrls, videoTourUrl: newVideoUrls[0] || null } }, property.isGlobalCityProperty ? property.address?.city : undefined);
            toast.success('הסרטון הועלה בהצלחה ✓');
        } catch (error) {
            console.error('Error uploading video:', error);
            toast.error('אירעה שגיאה בהעלאת הסרטון.');
        } finally {
            setIsUploadingVideo(false);
            if (videoInputRef.current) videoInputRef.current.value = '';
        }
    };

    const handleDeleteVideo = async (index: number) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק את הסרטון?')) return;
        try {
            const newVideoUrls = videoUrls.filter((_, i) => i !== index);
            setVideoUrls(newVideoUrls);
            setVideoUrl(newVideoUrls[0]);
            await updateProperty(property.id, { media: { images: imageUrls, videoTourUrl: newVideoUrls[0] || null } }, property.isGlobalCityProperty ? property.address?.city : undefined);
            toast.success('הסרטון נמחק בהצלחה');
        } catch (error) {
            console.error('Error deleting video:', error);
            toast.error('שגיאה במחיקת הסרטון');
        }
    };

    const formatPhoneForWhatsApp = (phone?: string) => {
        if (!phone) return null;
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) return `972${cleaned.substring(1)}`;
        if (cleaned.startsWith('972')) return cleaned;
        return `972${cleaned}`;
    };

    const handleSaveDescription = async () => {
        try {
            setIsSavingDescription(true);
            const newId = await updateProperty(property.id, { management: { descriptions: editedDescription } }, property.isGlobalCityProperty ? property.address?.city : undefined);
            
            if (newId !== property.id) {
                toast.success('הנכס נוסף למלאי הפרטי שלך! ✓');
                onClose();
            } else {
                toast.success('תיאור הנכס שומר בהצלחה ✓');
                setIsEditingDescription(false);
            }
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
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center ${property.isGlobalCityProperty ? 'bg-cyan-50 text-cyan-600 border-cyan-100' : typeColor} border shrink-0 shadow-sm`}>
                                {property.isGlobalCityProperty ? (
                                    (agency?.logoUrl || agency?.settings?.logoUrl) ? (
                                        <img src={agency.logoUrl || agency.settings?.logoUrl} alt="Office" className="w-full h-full object-contain" />
                                    ) : (
                                        <Building2 size={24} />
                                    )
                                ) : (
                                    (() => {
                                        const agent = agents.find(a => a.uid === property.management?.assignedAgentId || a.id === property.management?.assignedAgentId);
                                        return agent?.photoURL ? (
                                            <img src={agent.photoURL} alt={agent.name} className="w-full h-full object-cover" />
                                        ) : (
                                            agent?.name ? (
                                                <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 font-bold text-lg">
                                                    {agent.name.charAt(0)}
                                                </div>
                                            ) : (
                                                <User size={24} />
                                            )
                                        );
                                    })()
                                )}
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 leading-tight">
                                    {property.address?.fullAddress}
                                </h2>
                                <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                                    <MapPin size={14} />
                                    {property.address?.city || 'עיר לא מוזנת'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {onCreateDeal && (
                                <button
                                    onClick={() => {
                                        if (property.isGlobalCityProperty) {
                                            toast.error('עליך לייבא את הנכס למלאי הפרטי שלך לפני יצירת עסקה.');
                                            return;
                                        }
                                        onCreateDeal?.(property);
                                    }}
                                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded-lg transition-colors text-sm"
                                >
                                    <Handshake size={16} />
                                    <span className="hidden sm:inline">צור עסקה</span>
                                </button>
                            )}
                            {property.isGlobalCityProperty && (
                                <button
                                    onClick={handleImportToMyProperties}
                                    disabled={isImporting}
                                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg transition-colors text-sm shadow-sm"
                                >
                                    {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                    <span>הוסף למלאי שלי</span>
                                </button>
                            )}
                            <button
                                onClick={() => setShowAddMeetingModal(true)}
                                className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg transition-colors text-sm"
                            >
                                <Calendar size={16} />
                                <span className="hidden sm:inline">קבע פגישה</span>
                            </button>
                            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 pretty-scroll">
                        {/* Selected Image Banner OR First Video as cover */}
                        {hasImages ? (
                            <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 group bg-slate-100 border border-slate-200">
                                <img
                                    src={images[activeImageIndex]}
                                    alt="Property Main"
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-4">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsImageFullscreen(true)}
                                            className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white p-2 rounded-lg transition-colors"
                                        >
                                            <Fullscreen size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Navigation Arrows */}
                                {images.length > 1 && (
                                    <>
                                        <button
                                            onClick={prevImage}
                                            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <ChevronLeft size={24} />
                                        </button>
                                        <button
                                            onClick={nextImage}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <ChevronRight size={24} />
                                        </button>
                                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
                                            {images.map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`h-1.5 rounded-full transition-all ${i === activeImageIndex ? 'bg-white w-6' : 'bg-white/40 w-1.5'}`}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                                {property.listingType === 'exclusive' || property.isExclusive ? (
                                    <div className="absolute top-4 right-4 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                                        <Tag size={12} fill="currentColor" />
                                        👑 בלעדיות
                                    </div>
                                ) : null}
                            </div>
                        ) : primaryVideoAsCover ? (
                            // No images — show first video as cover
                            <div className="relative w-full aspect-video rounded-2xl overflow-hidden mb-6 bg-black border border-slate-200">
                                <video
                                    src={videoUrls[0]}
                                    controls
                                    playsInline
                                    className="w-full h-full object-contain"
                                    preload="metadata"
                                />
                            </div>
                        ) : (
                            // No images, no videos
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
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        {property.isGlobalCityProperty ? 'תמונות הנכס' : 'ניהול תמונות (גרור לשינוי סדר)'}
                                    </span>
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
                                                    isReadOnly={property.isGlobalCityProperty && !isSuperAdmin}
                                                />
                                            ))}
                                        </SortableContext>
                                        
                                        {images.length < 10 && (!property.isGlobalCityProperty || isSuperAdmin) && (
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

                        {!hasImages && (!property.isGlobalCityProperty || isSuperAdmin) && (
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
                        <input
                            type="file"
                            accept="video/*"
                            ref={videoInputRef}
                            className="hidden"
                            onChange={handleVideoUpload}
                        />

                        {/* Video Section — up to 3 videos */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">סרטוני נכס ({videoUrls.length}/3)</span>
                                {(!property.isGlobalCityProperty || isSuperAdmin) && videoUrls.length < 3 && (
                                    <button
                                        onClick={() => videoInputRef.current?.click()}
                                        disabled={isUploadingVideo}
                                        className="text-xs font-semibold text-blue-600 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {isUploadingVideo ? <Loader2 size={12} className="animate-spin" /> : <Video size={12} />}
                                        {isUploadingVideo ? 'מעלה סרטון...' : 'הוסף סרטון'}
                                    </button>
                                )}
                            </div>
                            {videoUrls.length > 0 ? (
                                <div className="flex flex-col gap-3">
                                    {videoUrls.map((vUrl, vIdx) => (
                                        <div key={vIdx} className="relative w-full rounded-2xl overflow-hidden bg-black border border-slate-200 group">
                                            <video
                                                src={vUrl}
                                                controls
                                                className="w-full max-h-72 object-contain"
                                                preload="metadata"
                                            />
                                            {(!property.isGlobalCityProperty || isSuperAdmin) && (
                                                <button
                                                    onClick={() => handleDeleteVideo(vIdx)}
                                                    className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs font-semibold flex items-center gap-1"
                                                >
                                                    <Trash2 size={12} />
                                                    מחק
                                                </button>
                                            )}
                                            <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full pointer-events-none">
                                                סרטון {vIdx + 1}
                                            </div>
                                        </div>
                                    ))}
                                    {/* Add more slot */}
                                    {(!property.isGlobalCityProperty || isSuperAdmin) && videoUrls.length < 3 && (
                                        <div
                                            onClick={() => { if (!isUploadingVideo) videoInputRef.current?.click(); }}
                                            className="w-full h-16 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center gap-2 text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-blue-300 hover:text-blue-500 transition-all"
                                        >
                                            {isUploadingVideo ? <Loader2 size={18} className="animate-spin" /> : <Video size={18} />}
                                            <span className="text-xs font-medium">{isUploadingVideo ? 'מעלה סרטון...' : `הוסף סרטון נוסף (${videoUrls.length}/3)`}</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div
                                    onClick={() => {
                                        if (property.isGlobalCityProperty && !isSuperAdmin) {
                                            toast.error('נכס מהמאגר הציבורי הוא לקריאה בלבד.');
                                            return;
                                        }
                                        if (!isUploadingVideo) videoInputRef.current?.click();
                                    }}
                                    className="w-full h-24 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-blue-300 hover:text-blue-500 transition-all"
                                >
                                    {isUploadingVideo ? (
                                        <Loader2 size={24} className="animate-spin mb-1" />
                                    ) : (
                                        <VideoOff size={24} className="mb-1 opacity-50" />
                                    )}
                                    <p className="text-xs font-medium">{isUploadingVideo ? 'מעלה סרטון...' : 'לחץ להעלאת סרטון (עד 200MB, מקסימום 3)'}</p>
                                </div>
                            )}
                        </div>

                        {/* Property Details Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="text-xs font-semibold text-slate-500 mb-1">מחיר</div>
                                <div className="text-lg font-bold text-slate-900">₪{property.financials?.price?.toLocaleString()}</div>
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
                                <div className="text-base font-bold text-slate-900">{translatePropertyKind(property.propertyType)}</div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="text-xs font-semibold text-slate-500 mb-1">חדרים</div>
                                <div className="text-base font-bold text-slate-900">{property.rooms || '-'}</div>
                            </div>
                            {property.features?.parkingSpots != null && (
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <div className="text-xs font-semibold text-slate-500 mb-1">חניות</div>
                                    <div className="text-base font-bold text-slate-900">{property.features?.parkingSpots}</div>
                                </div>
                            )}
                        </div>

                        {property.isGlobalCityProperty && (
                            <div className="mb-8 p-5 bg-cyan-50/30 rounded-2xl border border-cyan-100/50">
                                <h3 className="text-xs font-bold text-cyan-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Tag size={14} />
                                    פרטים מהמאגר הציבורי (Full Public Data)
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {property.address?.street && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">כתובת מדויקת (Street)</span>
                                            <span className="text-sm font-semibold text-slate-700">{property.address.street}</span>
                                        </div>
                                    )}
                                    {property.address?.neighborhood && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">שכונה</span>
                                            <span className="text-sm font-semibold text-slate-700">{property.address.neighborhood}</span>
                                        </div>
                                    )}
                                    {property.propertyType && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">תת-סוג נכס</span>
                                            <span className="text-sm font-semibold text-slate-700">{property.propertyType}</span>
                                        </div>
                                    )}
                                    {property.ingestedAt && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">נקלט במערכת</span>
                                            <span className="text-sm font-semibold text-slate-700">
                                                {property.ingestedAt.toDate ? property.ingestedAt.toDate().toLocaleDateString('he-IL') : new Date(property.ingestedAt).toLocaleDateString('he-IL')}
                                            </span>
                                        </div>
                                    )}

                                    {property.squareMeters && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">שטח (מ"ר)</span>
                                            <span className="text-sm font-semibold text-slate-700">{property.squareMeters}</span>
                                        </div>
                                    )}
                                    {property.contactName ? (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">שם איש קשר</span>
                                            <span className="text-sm font-semibold text-slate-700">{property.contactName}</span>
                                        </div>
                                    ) : (property.yad2Link || property.externalLink) ? (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">לינק למודעה</span>
                                            <a href={property.yad2Link || property.externalLink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:underline">
                                                {isYad2Link ? 'צפה ביד 2' : 'צפה במודעה'}
                                            </a>
                                        </div>
                                    ) : null}
                                    {property.contactPhone && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">טלפון איש קשר</span>
                                            <span className="text-sm font-semibold text-slate-700">{property.contactPhone}</span>
                                        </div>
                                    )}
                                    {property.features?.parkingSpots !== undefined && (
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">חניות</span>
                                            <span className="text-sm font-semibold text-slate-700">{property.features.parkingSpots}</span>
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">מרפסת</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${property.features?.hasBalcony ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{property.features?.hasBalcony ? 'כן' : 'לא'}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">מעלית</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${property.features?.hasElevator ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{property.features?.hasElevator ? 'כן' : 'לא'}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">ממ"ד</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${property.features?.hasMamad ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{property.features?.hasMamad ? 'כן' : 'לא'}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">יש תיווך</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${property.hasAgent ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{property.hasAgent ? 'כן' : 'לא'}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Property Contact Section */}
                        {(property.isGlobalCityProperty || property.management?.assignedAgentId || property.contactPhone) && (
                            <div className="mb-8 p-5 bg-blue-50/50 rounded-2xl border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="text-right">
                                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
                                        <User size={16} className="text-blue-600" />
                                        {property.isGlobalCityProperty ? 'צור קשר עם המשרד' : 'צור קשר לתיאום'}
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        {property.isGlobalCityProperty 
                                            ? 'לתיאום פגישה או בירור פרטים נוספים על הנכס'
                                            : `פנה ל${agents.find(a => a.uid === property.management?.assignedAgentId || a.id === property.management?.assignedAgentId)?.name || 'הסוכן'} למידע נוסף`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    {(() => {
                                        const phone = property.isGlobalCityProperty
                                            ? (agency?.officePhone || agency?.billing?.ownerPhone)
                                            : (agents.find(a => a.uid === property.management?.assignedAgentId || a.id === property.management?.assignedAgentId)?.phone || property.contactPhone);
                                        
                                        if (!phone) return null;

                                        return (
                                            <>
                                                <a
                                                    href={`tel:${phone}`}
                                                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm"
                                                >
                                                    <Phone size={18} />
                                                    שיחה
                                                </a>
                                                <a
                                                    href={`https://wa.me/${formatPhoneForWhatsApp(phone)}?text=${encodeURIComponent(`היי, ראיתי את הנכס שפרסמת ב${property.address?.fullAddress}${property.address?.city ? `, ${property.address.city}` : ''}. אשמח לקבל פרטים נוספים.`)}`}
                                                    target="_blank" rel="noreferrer"
                                                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-200"
                                                >
                                                    <MessageCircle size={18} />
                                                    ווטסאפ
                                                </a>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}


                        {/* Description */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    תיאור הנכס
                                </h3>
                                {!isEditingDescription ? (
                                    <button
                                        onClick={() => {
                                            if (property.isGlobalCityProperty && !isSuperAdmin) {
                                                toast.error('נכס מהמאגר הציבורי הוא לקריאה בלבד. לייבוא ועריכה לחץ על "הוסף למלאי שלי" למעלה.');
                                                return;
                                            }
                                            setIsEditingDescription(true);
                                        }}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors"
                                    >
                                        ערוך
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setIsEditingDescription(false);
                                                setEditedDescription(property.management?.descriptions || property.rawDescription || '');
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
                                displayDescription ? (
                                    <div
                                        className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors group relative"
                                        onClick={() => {
                                            if (property.isGlobalCityProperty && !isSuperAdmin) {
                                                toast.error('נכס מהמאגר הציבורי הוא לקריאה בלבד.');
                                                return;
                                            }
                                            setIsEditingDescription(true);
                                        }}
                                    >
                                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                                            {displayDescription}
                                        </p>
                                        <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-sm border border-slate-200 rounded p-1.5 text-slate-400 pointer-events-none">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="text-sm text-slate-400 italic bg-slate-50 p-4 rounded-xl cursor-pointer hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all flex items-center justify-between group"
                                        onClick={() => {
                                            if (property.isGlobalCityProperty && !isSuperAdmin) {
                                                toast.error('נכס מהמאגר הציבורי הוא לקריאה בלבד.');
                                                return;
                                            }
                                            setIsEditingDescription(true);
                                        }}
                                    >
                                        <span>לא הוזן תיאור מילולי לנכס זה. לחץ להוספה...</span>
                                        <Plus size={16} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                                    </div>
                                )
                            )}
                        </div>

                        {/* External Link */}
                        {(property.externalLink || property.yad2Link) && (
                            <div className="mb-8 p-4 bg-orange-50/50 rounded-2xl border border-orange-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                                        <ExternalLink size={20} />
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-900">
                                            {isYad2Link ? 'צפה במודעה ביד 2' : 'צפה במודעה במקור'}
                                        </div>
                                    </div>
                                </div>
                                <a
                                    href={externalUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shadow-orange-200"
                                >
                                    {externalButtonText}
                                    <ArrowUpLeft size={16} />
                                </a>
                            </div>
                        )}

                        {/* Marketplace Sharing Section */}
                        {!property.isGlobalCityProperty && (
                            <div className="mb-8 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="text-right">
                                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
                                        <Handshake size={16} className="text-indigo-600" />
                                        {property.collaborationStatus === 'collaborative' ? 'הנכס מופיע במרקטפלייס' : 'שתף במרקטפלייס (MLS)'}
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        {property.collaborationStatus === 'collaborative' 
                                            ? 'הנכס חשוף לסוכנויות אחרות לשיתוף פעולה'
                                            : 'חשוף את הנכס לסוכנויות אחרות כדי למצוא קונה/שוכר במהירות'}
                                    </p>
                                </div>
                                <button
                                    onClick={handleToggleMarketplace}
                                    disabled={isSharingToMarketplace}
                                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm ${
                                        property.collaborationStatus === 'collaborative'
                                            ? 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                                    }`}
                                >
                                    {isSharingToMarketplace ? <Loader2 size={18} className="animate-spin" /> : <Handshake size={18} />}
                                    {property.collaborationStatus === 'collaborative' ? 'הסר מהמרקטפלייס' : 'שתף עכשיו'}
                                </button>
                            </div>
                        )}

                        {/* Footer Info / Associations */}
                        <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col sm:flex-row gap-6 text-sm">
                            <div className="flex-1 space-y-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    שיוך סוכן מטפל
                                </label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    value={property.management?.assignedAgentId || ""}
                                    disabled={property.isGlobalCityProperty}
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
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    value={property.leadId || ""}
                                    disabled={property.isGlobalCityProperty}
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
                            {property.createdAt && (
                                <div>נוסף: {(property.createdAt as any).toDate?.().toLocaleDateString('he-IL') ?? ''}</div>
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
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-all duration-300"
                        />

                        {/* Fullscreen Navigation */}
                        {images.length > 1 && (
                            <>
                                <button
                                    onClick={prevImage}
                                    className="absolute left-8 top-1/2 -translate-y-1/2 w-16 h-16 bg-white/5 hover:bg-white/10 text-white rounded-full flex items-center justify-center transition-all group"
                                >
                                    <ChevronLeft size={48} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                                </button>
                                <button
                                    onClick={nextImage}
                                    className="absolute right-8 top-1/2 -translate-y-1/2 w-16 h-16 bg-white/5 hover:bg-white/10 text-white rounded-full flex items-center justify-center transition-all group"
                                >
                                    <ChevronRight size={48} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                                </button>
                                <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex gap-3">
                                    {images.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setActiveImageIndex(i)}
                                            className={`h-1.5 rounded-full transition-all ${i === activeImageIndex ? 'bg-blue-500 w-8' : 'bg-white/20 w-2 hover:bg-white/40'}`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
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

            {showAddMeetingModal && (
                <AddMeetingModal
                    isOpen={showAddMeetingModal}
                    onClose={() => setShowAddMeetingModal(false)}
                    initialData={{
                        summary: `פגישה בנכס: ${property.address?.fullAddress}`,
                        location: property.address?.fullAddress,
                        description: `פגישה לסיור בנכס: ${property.address?.fullAddress}\nמחיר: ₪${property.financials?.price?.toLocaleString()}\nעיר: ${property.address?.city}`,
                        relatedEntityType: 'property',
                        relatedEntityId: property.id,
                        relatedEntityName: property.address?.fullAddress
                    }}
                />
            )}
        </>
    );
}
