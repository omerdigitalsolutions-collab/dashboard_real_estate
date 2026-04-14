import { useState, useMemo, useEffect } from 'react';
import { Sparkles, MapPin, BedDouble, X, CheckSquare, MessageCircle, AlertCircle, Link, Copy, Check, Send, Plus, Trash2, ExternalLink, Search, Heart } from 'lucide-react';

import { createCatalog, getCatalogsByLeadId, updateCatalog } from '../../services/catalogService';
import { updateLead } from '../../services/leadService';
import { Lead, Property } from '../../types';
import { sendWhatsAppWebhook } from '../../utils/webhookClient';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import UpgradeModal from '../ui/UpgradeModal';

interface PropertyMatcherModalProps {
    lead: Lead;
    allProperties: Property[]; // <-- Added
    onClose: () => void;
    onSuccess?: (message: string) => void;
}

// ── Helper: property card thumbnail ──────────────────────────────────────────
function PropertyThumb({ property, selected, onToggle, onRemove, onQuickShare, onQuickAddToCatalog, isInCatalog }: {
    property: Property & { 
        isLiked?: boolean; 
        isExclusivity?: boolean; 
        matchScore?: number; 
        isNeighborhoodMatch?: boolean;
        category?: 'high' | 'medium';
    };
    selected: boolean;
    onToggle: () => void;
    onRemove?: () => void;
    onQuickShare?: () => void;
    onQuickAddToCatalog?: () => void;
    isInCatalog?: boolean;
}) {
    const isExclusivity = (property as any).isExclusivity !== false;

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
                    className="w-5 h-5 rounded-lg text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                {isInCatalog && (
                    <span className="text-[10px] font-bold text-blue-500 mt-0.5">בקטלוג</span>
                )}
                {property.isLiked && (
                    <Heart size={16} className="text-rose-500 fill-rose-500 mt-1" />
                )}
            </div>

            {/* Score Badge */}
            {property.matchScore !== undefined && (
                <div className={`absolute top-4 left-4 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-sm ${
                    property.category === 'high' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                    {property.matchScore}% התאמה
                </div>
            )}

            {/* Neighborhood Check */}
            {property.isNeighborhoodMatch === false && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                    <AlertCircle size={10} />
                    מחוץ לשכונה המבוקשת
                </div>
            )}

            {/* Quick Actions (only shown if provided) */}
            {(onQuickShare || onQuickAddToCatalog) && (
                <div className="absolute bottom-3 left-4 z-20 flex gap-2">
                    {onQuickShare && (
                        <button
                            onClick={e => { e.stopPropagation(); onQuickShare(); }}
                            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100 shadow-sm p-1.5 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                            title="שלח ישירות בוואטסאפ"
                        >
                            <MessageCircle size={14} />
                        </button>
                    )}
                    {onQuickAddToCatalog && (
                        <button
                            onClick={e => { e.stopPropagation(); onQuickAddToCatalog(); }}
                            className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 shadow-sm p-1.5 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                            title="הוסף לקטלוג ושלח מנוסח"
                        >
                            <Plus size={14} />
                        </button>
                    )}
                </div>
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
                {property.neighborhood && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] py-0.5 text-center font-bold">
                        {property.neighborhood}
                    </div>
                )}
            </div>

            <div className="flex-1 flex flex-col justify-center">
                <h3 className="font-bold text-slate-800 leading-tight mb-1 pr-6 text-sm">
                    {(property.address || 'כתובת חסויה')}{property.city ? `, ${property.city}` : ''}
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
                    {isExclusivity ? (
                        <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 font-bold">בלעדיות</span>
                    ) : (
                        <span className="bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100">מאגר חיצוני</span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PropertyMatcherModal({ lead, allProperties, onClose, onSuccess }: PropertyMatcherModalProps) {
    const { userData } = useAuth();
    const [matchedProperties, setMatchedProperties] = useState<any[]>([]);
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());

    // Feature gating
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);



    useEffect(() => {
        const fetchMatches = async () => {
            if (!lead.id || !userData?.agencyId) return;
            setLoadingMatches(true);
            try {
                const { matchPropertiesForLeadCF } = await import('../../services/leadService');
                const result = await matchPropertiesForLeadCF(userData.agencyId, lead.requirements);
                setMatchedProperties(result.matches || []);
            } catch (err) {
                console.error('Error fetching matches from CF:', err);
                // Fallback to local matching if CF fails or for legacy
                const { matchPropertiesForLead } = await import('../../services/leadService');
                setMatchedProperties(matchPropertiesForLead(lead.requirements, allProperties));
            } finally {
                setLoadingMatches(false);
            }
        };

        const fetchPlan = async () => {
            if (userData?.agencyId) {
                try {
                    const { getDoc, doc: fsDoc } = await import('firebase/firestore');
                    const snap = await getDoc(fsDoc(db, 'agencies', userData.agencyId));
                    if (snap.exists()) {
                        const plan = snap.data()?.planId || 'starter';
                        if (plan === 'starter') {
                            setIsUpgradeModalOpen(true);
                        }
                    }
                } catch (err) {
                    console.error('Error fetching plan:', err);
                }
            }
        };
        fetchMatches();
        fetchPlan();
    }, [userData, lead.id]);

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
                const inCatalog = new Set<string>();

                // Find properties in any catalog and specifically likes
                catalogs.forEach(catalog => {
                    if (catalog.likedPropertyIds) {
                        catalog.likedPropertyIds.forEach(id => liked.add(id));
                    }
                    if (catalog.propertyIds) {
                        catalog.propertyIds.forEach(p => {
                            const id = typeof p === 'string' ? p : p.id;
                            inCatalog.add(id);
                        });
                    }
                });

                setLikedPropertyIds(liked);

                // If lead has a specific current catalog, pre-select those items
                if (lead.catalogId) {
                    const currentCatalog = catalogs.find(c => c.id === lead.catalogId);
                    if (currentCatalog?.propertyIds) {
                        const ids = currentCatalog.propertyIds.map(p => typeof p === 'string' ? p : p.id);
                        setSelectedPropertyIds(new Set(ids));
                    }
                } else if (inCatalog.size > 0) {

                    // Fallback to any properties found in catalogs if lead.catalogId is missing
                    setSelectedPropertyIds(inCatalog);
                }
            })
            .catch(err => console.warn('Could not load liked properties:', err))
            .finally(() => setLoadingLikes(false));
    }, [lead.id, lead.agencyId, lead.catalogId]);

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

    const { highMatches, mediumMatches } = useMemo(() => {
        const high: any[] = [];
        const medium: any[] = [];

        matchedPropertiesWithLikes.forEach(p => {
            if (p.category === 'high') high.push(p);
            else medium.push(p);
        });

        return { highMatches: high, mediumMatches: medium };
    }, [matchedPropertiesWithLikes]);

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

    const formatPhoneForWhatsApp = (phone?: string) => {
        if (!phone) return '';
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) return `972${cleaned.substring(1)}`;
        if (cleaned.startsWith('972')) return cleaned;
        return `972${cleaned}`;
    };

    const handleQuickShare = (prop: Property) => {
        const url = `https://homer.management/properties?id=${prop.id}`;
        const waMsg = encodeURIComponent(`היי ${lead.name}, הנה פרטים על נכס מעניין ב${prop.city}: ${url}`);
        window.open(`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}?text=${waMsg}`, '_blank', 'noopener,noreferrer');
    };

    const handleQuickAddToCatalog = async (prop: Property) => {
        setIsGenerating(true);
        try {
            const nextPropertyItems = Array.from(selectedPropertyIds).map(id => {
                const p = [...matchedProperties, ...allProperties].find(item => item.id === id);
                return {
                    id,
                    collectionPath: (p as any)?.collectionPath || 'properties'
                };
            });

            // Add the new one if not already there
            if (!nextPropertyItems.find(p => p.id === prop.id)) {
                nextPropertyItems.push({
                    id: prop.id,
                    collectionPath: (prop as any).collectionPath || 'properties'
                });
            }

            const nextIdsOnly = nextPropertyItems.map(p => p.id);

            let token = lead.catalogId;
            let url = token ? `https://homer.management/catalog/${token}` : lead.catalogUrl;

            if (token) {
                // Update existing
                await updateCatalog(token, nextPropertyItems);
            } else {
                // Create new
                token = await createCatalog(lead.agencyId, lead.id, lead.name, nextPropertyItems);
                url = `https://homer.management/catalog/${token}`;
                await updateLead(lead.id, { catalogId: token, catalogUrl: url } as any);
            }

            // Re-select it so UI updates visually
            setSelectedPropertyIds(new Set(nextIdsOnly));
            setCatalogUrl(url || `https://homer.management/catalog/${token}`);


            const waMsg = encodeURIComponent(`היי ${lead.name}, יש למשרד שלנו נכס חדש שכרגע יצא לשוק ונראה שהוא בול מה שחיפשת! הוספתי לך אותו לקטלוג האישי שלך. כנס לראות: ${url || `https://homer.management/catalog/${token}`}`);
            window.open(`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}?text=${waMsg}`, '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('Failed to quick add to catalog', error);
            alert('שגיאה בעדכון הקטלוג');
        } finally {
            setIsGenerating(false);
        }
    };

    // Generate/Update catalog and optionally open in new tab
    const handleGenerateCatalog = async (openTab = false) => {
        if (selectedPropertyIds.size === 0) return;
        setIsGenerating(true);
        try {
            const nextPropertyItems = Array.from(selectedPropertyIds).map(id => {
                const p = [...matchedProperties, ...allProperties].find(item => item.id === id);
                return {
                    id,
                    collectionPath: (p as any)?.collectionPath || 'properties'
                };
            });

            let token = lead.catalogId;
            let url = token ? `https://homer.management/catalog/${token}` : lead.catalogUrl;

            if (token) {
                // Persistent Update
                await updateCatalog(token, nextPropertyItems);
            } else {
                // Initial Creation
                token = await createCatalog(
                    lead.agencyId,
                    lead.id,
                    lead.name,
                    nextPropertyItems
                );
                url = `https://homer.management/catalog/${token}`;
                // Save to lead document
                await updateLead(lead.id, {
                    catalogId: token,
                    catalogUrl: url
                } as any);
            }


            setCatalogUrl(url || `https://homer.management/catalog/${token}`);
            if (openTab) window.open(url || `https://homer.management/catalog/${token}`, '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('Failed to update catalog', error);
            alert('שגיאה בעדכון הקטלוג.');
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
                    {loadingMatches && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                             <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-3" />
                             <p className="text-xs font-medium">סורק נכסים מתאימים במאגר...</p>
                        </div>
                    )}

                    {!loadingMatches && (
                        <>

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

                    {loadingLikes ? (
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
                                {highMatches.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            <p className="text-sm font-bold text-slate-700">התאמה גבוהה ({highMatches.length})</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {highMatches.map(property => (
                                                <PropertyThumb
                                                    key={property.id}
                                                    property={property}
                                                    selected={selectedPropertyIds.has(property.id)}
                                                    onToggle={() => handleToggle(property.id)}
                                                    onQuickShare={() => handleQuickShare(property)}
                                                    onQuickAddToCatalog={() => handleQuickAddToCatalog(property)}
                                                    isInCatalog={selectedPropertyIds.has(property.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {mediumMatches.length > 0 && (
                                    <div className="space-y-4 pt-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                            <p className="text-sm font-bold text-slate-700">התאמה בינונית ({mediumMatches.length})</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {mediumMatches.map(property => (
                                                <PropertyThumb
                                                    key={property.id}
                                                    property={property}
                                                    selected={selectedPropertyIds.has(property.id)}
                                                    onToggle={() => handleToggle(property.id)}
                                                    onQuickShare={() => handleQuickShare(property)}
                                                    onQuickAddToCatalog={() => handleQuickAddToCatalog(property)}
                                                    isInCatalog={selectedPropertyIds.has(property.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
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
                                                onQuickShare={() => handleQuickShare(p)}
                                                isInCatalog={true}
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
                        </>
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
                                    {lead.catalogId ? 'פתח קטלוג נוכחי' : 'פתח קטלוג נכסים'}
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
                                    {isGenerating ? (lead.catalogId ? 'מעדכן...' : 'יוצר...') : (lead.catalogId ? `עדכן קטלוג (${selectedPropertyIds.size})` : `צור קטלוג (${selectedPropertyIds.size})`)}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <UpgradeModal
                isOpen={isUpgradeModalOpen}
                onClose={() => {
                    setIsUpgradeModalOpen(false);
                    onClose(); // Close the parent matcher modal too since they don't have access
                }}
                featureName="התאמה בין ליד לדירה"
            />
        </div>
    );
}
