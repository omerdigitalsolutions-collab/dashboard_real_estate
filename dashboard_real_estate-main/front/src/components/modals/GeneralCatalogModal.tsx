import { useState } from 'react';
import { X, Sparkles, Send, Copy, Check, ExternalLink, Link } from 'lucide-react';
import { createCatalog } from '../../services/catalogService';
import { useAuth } from '../../context/AuthContext';
import { Property } from '../../types';

interface GeneralCatalogModalProps {
    selectedProperties: Property[];
    onClose: () => void;
    onSuccess?: (catalogId: string) => void;
}

export default function GeneralCatalogModal({ selectedProperties, onClose, onSuccess }: GeneralCatalogModalProps) {
    const { userData } = useAuth();
    const [title, setTitle] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [catalogUrl, setCatalogUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleCreate = async () => {
        if (!userData?.agencyId || selectedProperties.length === 0) return;
        setIsGenerating(true);
        try {
            const propertyItems = selectedProperties.map(p => ({
                id: p.id,
                collectionPath: p.isGlobalCityProperty ? (p.originalSource ? `cities/${normalizeCity(p.address?.city || '')}` : 'properties') : 'properties'
            }));

            // In some cases isGlobalCityProperty properties might have a more complex path logic.
            // Let's use a simpler approach based on what I saw in PropertyMatcherModal
            const nextPropertyItems = selectedProperties.map(p => ({
                id: p.id,
                collectionPath: (p as any).collectionPath || (p.isGlobalCityProperty ? 'cities/unknown' : 'properties')
            }));

            const catalogId = await createCatalog(
                userData.agencyId,
                null,
                undefined,
                nextPropertyItems,
                title
            );

            const url = `https://homer.management/catalog/${catalogId}`;
            setCatalogUrl(url);
            onSuccess?.(catalogId);
        } catch (error) {
            console.error('Failed to create general catalog', error);
            alert('שגיאה ביצירת הקטלוג');
        } finally {
            setIsGenerating(false);
        }
    };

    const normalizeCity = (city: string) => {
        return city.trim().toLowerCase().replace(/\s+/g, '-');
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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" dir="rtl">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                            <Sparkles size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">יצירת קטלוג כללי</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {catalogUrl ? (
                        <div className="space-y-4">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Check size={24} />
                                </div>
                                <h3 className="font-bold text-emerald-900">הקטלוג נוצר בהצלחה!</h3>
                                <p className="text-sm text-emerald-700 mt-1">הקטלוג מוכן לשיתוף עם הלקוחות שלך.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pr-1">קישור לקטלוג</label>
                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                    <span className="flex-1 text-xs text-slate-600 truncate font-mono">{catalogUrl}</span>
                                    <button
                                        onClick={handleCopyLink}
                                        className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                        {copied ? 'הועתק!' : 'העתק'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <a
                                    href={catalogUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shadow-md"
                                >
                                    <ExternalLink size={18} />
                                    צפה בקטלוג
                                </a>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
                                    <div className="text-blue-600 font-bold text-lg">{selectedProperties.length}</div>
                                    <div className="text-sm text-blue-800 font-medium">נכסים נבחרו לקטלוג</div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 pr-1">שם הקטלוג (אופציונלי)</label>
                                    <input
                                        type="text"
                                        placeholder="למשל: דירות 4 חדרים בשכונת פלורנטין"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    />
                                    <p className="text-[11px] text-slate-400 pr-1">שם זה יופיע בראש דף הקטלוג עבור הלקוחות.</p>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all"
                                >
                                    ביטול
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={isGenerating}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shadow-md disabled:opacity-50"
                                >
                                    {isGenerating ? (
                                        <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Sparkles size={18} />
                                            צור קטלוג
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
