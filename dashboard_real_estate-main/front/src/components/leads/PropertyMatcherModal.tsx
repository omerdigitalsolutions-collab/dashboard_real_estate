import { useState } from 'react';
import { Sparkles, MapPin, BedDouble, X, CheckSquare, MessageCircle, AlertCircle, Link, Copy, Check, Send } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { createCatalog } from '../../services/catalogService';
import { matchPropertiesForLead } from '../../services/leadService';
import { Lead } from '../../types';
import { sendWhatsAppWebhook } from '../../utils/webhookClient';

interface PropertyMatcherModalProps {
    lead: Lead;
    onClose: () => void;
    onSuccess?: (message: string) => void;
}

export default function PropertyMatcherModal({ lead, onClose, onSuccess }: PropertyMatcherModalProps) {
    const { properties, loading } = useLiveDashboardData();
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());

    // Strict Deterministic Matching Logic (using shared engine)
    const matchedProperties = matchPropertiesForLead(lead.requirements, properties);

    const [isGenerating, setIsGenerating] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [catalogUrl, setCatalogUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedPropertyIds(new Set(matchedProperties.map(p => p.id)));
        } else {
            setSelectedPropertyIds(new Set());
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedPropertyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Step 1: Create catalog and get the link
    const handleGenerateCatalog = async () => {
        if (selectedPropertyIds.size === 0) return;
        setIsGenerating(true);
        try {
            const token = await createCatalog(
                lead.agencyId,
                lead.id,
                lead.name,
                Array.from(selectedPropertyIds)
            );
            const baseUrl = window.location.origin;
            setCatalogUrl(`${baseUrl}/catalog/${token}`);
        } catch (error) {
            console.error('Failed to generate catalog', error);
            alert('שגיאה ביצירת הקטלוג.');
        } finally {
            setIsGenerating(false);
        }
    };

    // Copy link to clipboard
    const handleCopyLink = async () => {
        if (!catalogUrl) return;
        try {
            await navigator.clipboard.writeText(catalogUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const input = document.createElement('input');
            input.value = catalogUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Step 2: Send via WhatsApp
    const handleSendWhatsApp = async () => {
        if (!catalogUrl) return;
        setIsSending(true);
        try {
            const success = await sendWhatsAppWebhook({
                action: 'send_catalog',
                leadPhone: lead.phone,
                leadName: lead.name,
                catalogUrl,
            });

            if (success) {
                if (onSuccess) {
                    onSuccess('הקטלוג נוצר ונשלח ללקוח בהצלחה');
                }
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
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body - Scrollable List */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                            טוען נתונים...
                        </div>
                    ) : matchedProperties.length === 0 ? (
                        <div className="py-16 flex flex-col items-center justify-center text-slate-400 text-center">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                                <AlertCircle size={32} />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 mb-1">לא נמצאו התאמות</h3>
                            <p className="text-sm max-w-xs">נסה להרחיב את טווח החיפוש בכרטיס הלקוח כדי למצוא נכסים רלוונטיים.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Selection Action Bar */}
                            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 px-4 py-3 rounded-xl mb-6">
                                <label className="flex items-center gap-3 cursor-pointer text-sm font-semibold text-blue-800">
                                    <input
                                        type="checkbox"
                                        checked={selectedPropertyIds.size === matchedProperties.length && matchedProperties.length > 0}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-blue-300"
                                    />
                                    בחר הכל ({matchedProperties.length} נכסים נמצאו)
                                </label>
                                <span className="text-xs text-blue-600 font-medium">
                                    נבחרו {selectedPropertyIds.size} פריטים
                                </span>
                            </div>

                            {/* Property Mini-Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {matchedProperties.map(property => (
                                    <div
                                        key={property.id}
                                        onClick={() => handleSelectRow(property.id)}
                                        className={`group relative bg-white border ${selectedPropertyIds.has(property.id) ? 'border-blue-500 ring-1 ring-blue-500 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'} rounded-2xl p-4 flex gap-4 cursor-pointer transition-all`}
                                    >
                                        <div className="absolute top-4 right-4 z-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedPropertyIds.has(property.id)}
                                                readOnly
                                                className="w-4 h-4 rounded text-blue-600 border-slate-300"
                                            />
                                        </div>

                                        <div className="w-24 h-24 bg-slate-100 rounded-xl flex-shrink-0 overflow-hidden relative border border-slate-100">
                                            {property.imageUrls && property.imageUrls.length > 0 ? (
                                                <img src={property.imageUrls[0]} alt={property.address} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-100" />
                                            )}
                                        </div>

                                        <div className="flex-1 flex flex-col justify-center">
                                            <h3 className="font-bold text-slate-800 leading-tight mb-1 pr-6">
                                                {/* Show only street + city without house number */}
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
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-5 border-t border-slate-100 bg-white shrink-0">
                    {/* Step 2: catalog link created — show link + send */}
                    {catalogUrl ? (
                        <div className="space-y-3">
                            <div className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                                <Link size={16} className="text-green-500" />
                                קטלוג נוצר בהצלחה! העתק את הקישור או שלח ישירות:
                            </div>
                            {/* Link field with copy */}
                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                                <span className="flex-1 text-xs text-slate-600 truncate font-mono">{catalogUrl}</span>
                                <button
                                    onClick={handleCopyLink}
                                    className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                                >
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                    {copied ? 'הועתק!' : 'העתק'}
                                </button>
                            </div>
                            {/* Action buttons */}
                            <div className="flex justify-between items-center pt-1">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                                >
                                    סגור
                                </button>
                                <button
                                    onClick={handleSendWhatsApp}
                                    disabled={isSending}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#25D366] hover:bg-[#1db954] text-white shadow-md transition-all disabled:opacity-60"
                                >
                                    {isSending ? (
                                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Send size={16} />
                                    )}
                                    שלח ללקוח בוואטסאפ
                                </button>
                            </div>
                            {/* Direct WhatsApp link fallback */}
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
                        /* Step 1: Choose properties and create catalog */
                        <div className="flex justify-between items-center">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={handleGenerateCatalog}
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
                                {isGenerating ? 'יוצר קטלוג...' : `צור קטלוג דיגיטלי (${selectedPropertyIds.size})`}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
