import { useState } from 'react';
import { X, Combine, Loader2, Info } from 'lucide-react';
import { Property } from '../../types';
import { mergeProperties } from '../../services/propertyService';

interface DuplicateGroup {
    signature: string;
    properties: Property[];
}

interface MergePropertiesModalProps {
    isOpen: boolean;
    onClose: () => void;
    groups: DuplicateGroup[];
    onMerged: () => void;
}

export default function MergePropertiesModal({ isOpen, onClose, groups, onMerged }: MergePropertiesModalProps) {
    const [loadingGroupIndex, setLoadingGroupIndex] = useState<number | null>(null);
    const [error, setError] = useState('');

    if (!isOpen || groups.length === 0) return null;

    const handleMerge = async (groupIndex: number, group: DuplicateGroup) => {
        setError('');
        setLoadingGroupIndex(groupIndex);

        try {
            const props = group.properties;

            // 1. Determine primary. We'll pick the oldest one (smallest createdAt timestamp, or fallback to first)
            // Or prioritize active > exclusive > oldest.
            // For simplicity, let's keep the user's requested 'oldest' as primary, or the one with images.
            const sorted = [...props].sort((a, b) => {
                const aImages = a.media?.images?.length || 0;
                const bImages = b.media?.images?.length || 0;
                if (aImages !== bImages) return bImages - aImages;
                return (a.financials?.price ?? 0) - (b.financials?.price ?? 0);
            });

            const primary = sorted[0];
            const duplicates = sorted.slice(1);

            // 2. Merge data
            // Collect all unique images
            const allImages = new Set<string>();
            props.forEach(p => {
                p.media?.images?.forEach((url: string) => allImages.add(url));
            });

            const mergedData: Partial<Property> = {
                media: { images: Array.from(allImages) },
            };

            // Keep the best description
            if (!primary.management?.descriptions) {
                const bestDesc = props.find(p => p.management?.descriptions)?.management?.descriptions;
                if (bestDesc) mergedData.management = { ...mergedData.management, descriptions: bestDesc };
            }

            // Exclusivity fallback
            if (props.some(p => p.listingType === 'exclusive')) {
                mergedData.listingType = 'exclusive';
                mergedData.isExclusive = true;
            }

            const duplicateIds = duplicates.map(d => d.id);
            await mergeProperties(primary.agencyId, primary.id, duplicateIds, mergedData);

            onMerged();
        } catch (err: any) {
            console.error('Merge failed:', err);
            setError('אירעה שגיאה בעת מיזוג הנכסים');
        } finally {
            setLoadingGroupIndex(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
                            <Combine size={18} className="text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">מיזוג נכסים כפולים</h2>
                            <p className="text-xs text-slate-400">המערכת עושה סדר במלאי ומאחדת נכסים זהים</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-semibold border border-red-100 mb-4">
                            {error}
                        </div>
                    )}

                    <div className="flex bg-blue-50 text-blue-800 p-3 rounded-xl gap-3 text-sm border border-blue-100">
                        <Info size={20} className="flex-shrink-0 text-blue-600" />
                        <p>
                            כל קבוצה להלן מכילה נכסים בעלי נתונים זהים (אותה עיר, אותה כתובת הדירה, מספר חדרים ומחיר).
                            לחץ על "מזג" בכל קבוצה כדי לאחד אותם לנכס אחד עם כל התמונות וההיסטוריה.
                        </p>
                    </div>

                    {groups.map((group, index) => {
                        const firstProp = group.properties[0];
                        return (
                            <div key={group.signature} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-slate-800">{firstProp.address?.fullAddress}, {firstProp.address?.city}</h3>
                                        <div className="text-xs text-slate-500 font-medium mt-0.5">
                                            {firstProp.rooms} חדרים {firstProp.squareMeters ? ` • ${firstProp.squareMeters} מ"ר` : ''} • {group.properties.length} כפילויות תועדו
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleMerge(index, group)}
                                        disabled={loadingGroupIndex !== null}
                                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        {loadingGroupIndex === index ? <Loader2 size={16} className="animate-spin" /> : <Combine size={16} />}
                                        מזג פריטים לקבוצה
                                    </button>
                                </div>
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/50">
                                    {group.properties.map(p => (
                                        <div key={p.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2 relative">
                                            {p.media?.images && p.media.images.length > 0 ? (
                                                <div className="relative h-24 rounded-lg overflow-hidden bg-slate-100">
                                                    <img src={p.media.images[0]} alt="Prop" className="w-full h-full object-cover" />
                                                    <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm backdrop-blur-md ${p.status === 'draft' ? 'bg-amber-500/90 text-white' : p.propertyType === 'מסחרי' ? 'bg-orange-600/90 text-white' : p.transactionType === 'forsale' ? 'bg-blue-600/90 text-white' : 'bg-emerald-600/90 text-white'}`}>
                                                            {p.status === 'draft' ? 'טיוטה' : p.propertyType === 'מסחרי' ? 'מסחרי' : p.transactionType === 'forsale' ? 'למכירה' : 'להשכרה'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="relative h-24 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                                                    אין תמונה
                                                    <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm backdrop-blur-md ${p.status === 'draft' ? 'bg-amber-500/90 text-white' : p.propertyType === 'מסחרי' ? 'bg-orange-600/90 text-white' : p.transactionType === 'forsale' ? 'bg-blue-600/90 text-white' : 'bg-emerald-600/90 text-white'}`}>
                                                            {p.status === 'draft' ? 'טיוטה' : p.propertyType === 'מסחרי' ? 'מסחרי' : p.transactionType === 'forsale' ? 'למכירה' : 'להשכרה'}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-bold text-slate-800">₪{p.financials?.price?.toLocaleString()}</div>
                                                <div className="text-[10px] text-slate-400 mt-1">
                                                    סוכן: {p.management?.assignedAgentId || 'לא משויך'}
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                    מצב: {p.status} {p.listingType ? `(${p.listingType})` : ''}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                        סגור חלונית
                    </button>
                </div>
            </div>
        </div>
    );
}
