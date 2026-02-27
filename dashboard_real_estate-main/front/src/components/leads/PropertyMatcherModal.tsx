import { useState, useMemo, useEffect } from 'react';
import { Sparkles, MapPin, BedDouble, X, CheckSquare, MessageCircle, AlertCircle, Link, Copy, Check, Send, Plus, Trash2, ExternalLink, Search, Heart } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { createCatalog, getCatalogsByLeadId } from '../../services/catalogService';
import { matchPropertiesForLead, updateLead } from '../../services/leadService';
import { Lead, Property } from '../../types';
import { sendWhatsAppWebhook } from '../../utils/webhookClient';

interface PropertyMatcherModalProps {
    lead: Lead;
    onClose: () => void;
    onSuccess?: (message: string) => void;
}

// ── Helper: property card thumbnail ──────────────────────────────────────────
function PropertyThumb({ property, selected, onToggle, onRemove }: {
    property: Property & { isLiked?: boolean };
    selected: boolean;
    onToggle: () => void;
    onRemove?: () => void;
}) {
    return (
        <div
            onClick={onToggle}
            className={`group relative bg-white border ${selected ? 'border-blue-500 ring-1 ring-blue-500 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'} rounded-2xl p-4 flex gap-4 cursor-pointer transition-all ${property.isLiked ? 'bg-rose-50/50 border-rose-200 hover:border-rose-300' : ''}`}
        >
            <div className="absolute top-4 right-4 z-10 flex flex-col items-center gap-2">
                <input
                    type="checkbox"
                    checked={selected}
                    readOnly
                    className="w-4 h-4 rounded text-blue-600 border-slate-300"
                />
                {property.isLiked && (
                    <Heart size={16} className="text-rose-500 fill-rose-500" />
                )}
            </div>

            {/* Remove button (only in edit panel) */}
            {onRemove && selected && (
                <button
                    onClick={e => { e.stopPropagation(); onRemove(); }}
                    className="absolute top-4 left-4 z-10 w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center transition-colors"
                    title="הסר מהקטלוג"
                >
                    <Trash2 size={12} />
                </button>
            )}

            <div className="w-20 h-20 bg-slate-100 rounded-xl flex-shrink-0 overflow-hidden relative border border-slate-100">
                {(property.imageUrls && property.imageUrls.length > 0) || (property.images && property.images.length > 0) ? (
                    <img
                        src={(property.imageUrls && property.imageUrls.length > 0) ? property.imageUrls[0] : (property.images && property.images[0])}
                        alt={property.address}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-100" />
                )}
            </div>

            <div className="flex-1 flex flex-col justify-center">
                <h3 className="font-bold text-slate-800 leading-tight mb-1 pr-6 text-sm">
                    {property.address.replace(/\s+\d+[א-ת]?\s*$/, '').trim()}{property.city ? `, ${property.city}` : ''}
                </h3>
                <p className="text-sm font-semibold text-blue-600 mb-2">₪{property.price.toLocaleString()}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                    {property.rooms && (
                        <span className="flex items-center gap-1">
                            <BedDouble size={12} className="text-slate-400" />
                            {property.rooms} חד׳
                        </span>
                    )}
                    {property.type === 'rent' ? (
                        <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">להשכרה</span>
                    ) : (
                        <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">למכירה</span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PropertyMatcherModal({ lead, onClose, onSuccess }: PropertyMatcherModalProps) {
    const { properties: allProperties = [], loading } = useLiveDashboardData();

    const matchedProperties = matchPropertiesForLead(lead.requirements, allProperties);
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());

    // Liked properties
    const [likedPropertyIds, setLikedPropertyIds] = useState<Set<string>>(new Set());
    const [loadingLikes, setLoadingLikes] = useState(false);

    // Fetch catalogs to find liked properties
    useEffect(() => {
        if (!lead.id || !lead.agencyId) return;
        setLoadingLikes(true);
        getCatalogsByLeadId(lead.id, lead.agencyId)
            .then(catalogs => {
                const liked = new Set<string>();
                for (const catalog of catalogs) {
                    if (catalog.likedPropertyIds) {
                        catalog.likedPropertyIds.forEach(id => liked.add(id));
                    }
                }
                setLikedPropertyIds(liked);
            })
            .catch(err => console.warn('Could not load liked properties:', err))
            .finally(() => setLoadingLikes(false));
    }, [lead.id, lead.agencyId]);

    // Attach `isLiked` flag to properties
    const matchedPropertiesWithLikes = useMemo(() => {
        return matchedProperties.map(p => ({
            ...p,
            isLiked: likedPropertyIds.has(p.id)
        }));
    }, [matchedProperties, likedPropertyIds]);

    const allPropertiesWithLikes = useMemo(() => {
        return allProperties.map(p => ({
            ...p,
            isLiked: likedPropertyIds.has(p.id)
        }));
    }, [allProperties, likedPropertyIds]);

    const [panel, setPanel] = useState<'match' | 'edit'>('match');
    const [searchQuery, setSearchQuery] = useState('');

    const [isGenerating, setIsGenerating] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [catalogUrl, setCatalogUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // In the 'edit' panel, show all agency properties with a search filter
    const filteredAllProperties = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return allProperties.filter(p =>
            !q ||
            p.address.toLowerCase().includes(q) ||
            (p.city ?? '').toLowerCase().includes(q)
        );
    }, [allProperties, searchQuery]);

    const handleToggle = (id: string) => {
        setSelectedPropertyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setSelectedPropertyIds(new Set(matchedPropertiesWithLikes.map(p => p.id)));
        else setSelectedPropertyIds(new Set());
    };

    // Generate catalog and optionally open in new tab
    const handleGenerateCatalog = async (openTab = false) => {
        if (selectedPropertyIds.size === 0) return;
        setIsGenerating(true);
        try {
            const token = await createCatalog(
                lead.agencyId,
                lead.id,
                lead.name,
                Array.from(selectedPropertyIds)
            );
            const url = `${window.location.origin}/catalog/${token}`;
            setCatalogUrl(url);

            // Save to lead document replacing the old one
            await updateLead(lead.id, {
                catalogId: token,
                catalogUrl: url
            } as any);

            if (openTab) window.open(url, '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('Failed to generate catalog', error);
            alert('שגיאה ביצירת הקטלוג.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopyLink = async () => {
        if (!catalogUrl) return;
        try {
            await navigator.clipboard.writeText(catalogUrl);
        } catch {
            const input = document.createElement('input');
            input.value = catalogUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSendWhatsApp = async () => {
        if (!catalogUrl) return;
        setIsSending(true);
        try {
            const success = await sendWhatsAppWebhook({
                action: 'send_catalog',
                message: `שלום ${lead.name}, הכנתי עבורך קטלוג נכסים אישי: ${catalogUrl}`,
                leads: [{ phone: lead.phone, name: lead.name }],
            });
            if (success) {
                onSuccess?.('הקטלוג נוצר ונשלח ללקוח בהצלחה');
                onClose();
            } else {
                alert('הקטלוג נוצר, אך שגיאה אירעה בשליחת הווב-הוק.');
                onClose();
            }
        } catch (error) {
            console.error('Failed to send WhatsApp', error);
            alert('שגיאה בשליחת הקטלוג בוואטסאפ.');
        } finally {
            setIsSending(false);
        }
    };

    // The selected properties (full objects)
    const selectedProperties = allPropertiesWithLikes.filter(p => selectedPropertyIds.has(p.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
            <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-8 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between p-6 pl-8 border-b border-slate-100 shrink-0 bg-white">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                            <Sparkles size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">התאמות עבור: {lead.name}</h2>
                            <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500">
                                {lead.requirements?.desiredCity && lead.requirements.desiredCity.length > 0 && (
                                    <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                                        <MapPin size={12} /> {lead.requirements.desiredCity.join(', ')}
                                    </span>
                                )}
                                {lead.requirements?.maxBudget && (
                                    <span className="font-medium">עד ₪{lead.requirements.maxBudget.toLocaleString()}</span>
                                )}
                                {lead.requirements?.minRooms && (
                                    <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                                        <BedDouble size={12} /> מעל {lead.requirements.minRooms} חד׳
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Panel toggle tabs */}
                        <div className="flex rounded-xl overflow-hidden border border-slate-200 text-xs font-semibold">
                            <button
                                onClick={() => setPanel('match')}
                                className={`px-3 py-2 transition-colors ${panel === 'match' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                                התאמות ({matchedProperties.length})
                            </button>
                            <button
                                onClick={() => setPanel('edit')}
                                className={`px-3 py-2 transition-colors ${panel === 'edit' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                                ניהול ({selectedPropertyIds.size})
                            </button>
                        </div>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {/* Existing catalog banner (only if we haven't generated a new one yet) */}
                    {!catalogUrl && lead.catalogUrl && (
                        <div className="mb-6 flex items-center justify-between text-sm bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                            <div className="flex items-center gap-2 text-blue-800">
                                <Link size={16} className="text-blue-500 shrink-0" />
                                <span>ללקוח זה <b>קיים כבר קטלוג נכסים.</b> יצירת קטלוג חדש תחליף את הקיים.</span>
                            </div>
                            <a href={lead.catalogUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold hover:underline text-xs bg-white px-3 py-1.5 rounded-lg shadow-sm border border-blue-100 shrink-0">
                                צפה בקיים
                            </a>
                        </div>
                    )}

                    {loading || loadingLikes ? (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-400">טוען נתונים...</div>
                    ) : panel === 'match' ? (
                        /* ── MATCH PANEL ── */
                        matchedPropertiesWithLikes.length === 0 ? (
                            <div className="py-16 flex flex-col items-center justify-center text-slate-400 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                    <AlertCircle size={32} />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-700 mb-1">לא נמצאו התאמות</h3>
                                <p className="text-sm max-w-xs">עבור לכרטיסיית "ניהול" כדי לבחור נכסים ידנית מכל המלאי.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Select all bar */}
                                <div className="flex items-center justify-between bg-blue-50 border border-blue-100 px-4 py-3 rounded-xl mb-6">
                                    <label className="flex items-center gap-3 cursor-pointer text-sm font-semibold text-blue-800">
                                        <input
                                            type="checkbox"
                                            checked={selectedPropertyIds.size === matchedPropertiesWithLikes.length && matchedPropertiesWithLikes.length > 0}
                                            onChange={handleSelectAll}
                                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-blue-300"
                                        />
                                        בחר הכל ({matchedPropertiesWithLikes.length} נכסים נמצאו)
                                    </label>
                                    <span className="text-xs text-blue-600 font-medium">נבחרו {selectedPropertyIds.size} פריטים</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {matchedPropertiesWithLikes.map(property => (
                                        <PropertyThumb
                                            key={property.id}
                                            property={property}
                                            selected={selectedPropertyIds.has(property.id)}
                                            onToggle={() => handleToggle(property.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    ) : (
                        /* ── EDIT PANEL (manage selected + add from all stock) ── */
                        <div className="space-y-5">
                            {/* Selected properties */}
                            {selectedProperties.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">נכסים שנבחרו לקטלוג ({selectedProperties.length})</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {selectedProperties.map(p => (
                                            <PropertyThumb
                                                key={p.id}
                                                property={p}
                                                selected={true}
                                                onToggle={() => handleToggle(p.id)}
                                                onRemove={() => handleToggle(p.id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Divider */}
                            <div className="border-t border-slate-200 pt-4">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">הוסף מכל המלאי</p>
                                {/* Search */}
                                <div className="relative mb-4">
                                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="חפש לפי כתובת / עיר..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 pr-9 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {filteredAllProperties
                                        .filter(p => !selectedPropertyIds.has(p.id)) // Don't show already-selected
                                        .map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => handleToggle(p.id)}
                                                className="bg-white border border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all hover:shadow-sm group"
                                            >
                                                <div className="w-10 h-10 bg-slate-100 rounded-xl flex-shrink-0 overflow-hidden">
                                                    {p.imageUrls?.[0] ? (
                                                        <img src={p.imageUrls[0]} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-slate-200" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-700 truncate">{p.address}</p>
                                                    <p className="text-xs text-blue-600 font-bold">₪{p.price.toLocaleString()}</p>
                                                </div>
                                                <Plus size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-slate-100 bg-white shrink-0">
                    {catalogUrl ? (
                        /* ── After catalog creation ── */
                        <div className="space-y-3">
                            <div className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                                <Link size={16} className="text-green-500" />
                                קטלוג נוצר בהצלחה! העתק את הקישור או שלח ישירות:
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                                <span className="flex-1 text-xs text-slate-600 truncate font-mono">{catalogUrl}</span>
                                <button
                                    onClick={handleCopyLink}
                                    className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                                >
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                    {copied ? 'הועתק!' : 'העתק'}
                                </button>
                                <a
                                    href={catalogUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                                    title="פתח קטלוג"
                                >
                                    <ExternalLink size={12} />
                                    פתח
                                </a>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                                <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">סגור</button>
                                <button
                                    onClick={handleSendWhatsApp}
                                    disabled={isSending}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#25D366] hover:bg-[#1db954] text-white shadow-md transition-all disabled:opacity-60"
                                >
                                    {isSending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={16} />}
                                    שלח ללקוח בוואטסאפ
                                </button>
                            </div>
                            <div className="text-center pt-1">
                                <a
                                    href={`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`שלום ${lead.name}, הכנתי עבורך קטלוג נכסים אישי: ${catalogUrl}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-slate-400 hover:text-green-600 underline transition-colors"
                                >
                                    <MessageCircle size={12} className="inline ml-1" />
                                    פתח וואטסאפ ישירות
                                </a>
                            </div>
                        </div>
                    ) : (
                        /* ── Property selection footer ── */
                        <div className="flex justify-between items-center gap-3">
                            <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">ביטול</button>
                            <div className="flex items-center gap-3">
                                {/* "Open Catalog" — generates + immediately opens in new tab */}
                                <button
                                    onClick={() => handleGenerateCatalog(true)}
                                    disabled={selectedPropertyIds.size === 0 || isGenerating}
                                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${selectedPropertyIds.size > 0 && !isGenerating
                                        ? 'border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700'
                                        : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    <ExternalLink size={15} />
                                    פתח קטלוג נכסים
                                </button>
                                {/* "Create Catalog" — generates and shows link/send UI */}
                                <button
                                    onClick={() => handleGenerateCatalog(false)}
                                    disabled={selectedPropertyIds.size === 0 || isGenerating}
                                    className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedPropertyIds.size > 0 && !isGenerating
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    {isGenerating ? (
                                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <CheckSquare size={16} />
                                    )}
                                    {isGenerating ? 'יוצר קטלוג...' : `צור קטלוג (${selectedPropertyIds.size})`}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
