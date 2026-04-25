import { useState, useMemo } from 'react';
import { X, Users, Search, MessageCircle, Send, Check, AlertCircle } from 'lucide-react';
import { Property, Lead, SharedCatalog } from '../../types';
import { useLeads } from '../../hooks/useFirestoreData';

interface CatalogLeadMatcherModalProps {
    catalog: SharedCatalog;
    properties: Property[];
    leads: Lead[];
    onClose: () => void;
}

export default function CatalogLeadMatcherModal({ catalog, properties, leads, onClose }: CatalogLeadMatcherModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [sending, setSending] = useState(false);
    const [sentCount, setSentCount] = useState(0);

    const matchingLeads = useMemo(() => {
        return leads.filter(lead => {
            // Basic matching logic: check if lead requirements overlap with any property in catalog
            const matchesRequirement = properties.some(prop => {
                const typeMatch = !lead.requirements?.propertyType || lead.requirements.propertyType === prop.type;
                const cityMatch = !lead.requirements?.city || lead.requirements.city === prop.address?.city;
                const priceMatch = (!lead.requirements?.minPrice || (prop.price || 0) >= lead.requirements.minPrice) &&
                                   (!lead.requirements?.maxPrice || (prop.price || 0) <= lead.requirements.maxPrice);
                const roomMatch = (!lead.requirements?.minRooms || (prop.rooms || 0) >= lead.requirements.minRooms) &&
                                  (!lead.requirements?.maxRooms || (prop.rooms || 0) <= lead.requirements.maxRooms);
                
                return typeMatch && cityMatch && priceMatch && roomMatch;
            });

            const searchMatch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                (lead.phone || '').includes(searchTerm);

            return matchesRequirement && searchMatch;
        });
    }, [leads, properties, searchTerm]);

    const toggleLead = (id: string) => {
        const next = new Set(selectedLeadIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedLeadIds(next);
    };

    const handleBroadcast = async () => {
        if (selectedLeadIds.size === 0) return;
        setSending(true);
        const catalogUrl = `https://homer.management/catalog/${catalog.id}`;
        const message = `היי, מצאתי כמה נכסים שיכולים לעניין אותך: ${catalogUrl}`;
        
        let count = 0;
        for (const id of Array.from(selectedLeadIds)) {
            const lead = leads.find(l => l.id === id);
            if (lead?.phone) {
                const whatsappUrl = `https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
                count++;
            }
        }
        
        setSentCount(count);
        setSending(false);
        // We don't close immediately so the user sees the success state if we added one, 
        // but here it just opens many tabs. 
        // In a real broadcast we'd probably use a backend service.
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" dir="rtl">
            <div className="bg-slate-900 border border-slate-800 rounded-[40px] w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="flex items-center justify-between p-8 border-b border-slate-800/50">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                            <Users size={28} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tight">לידים מתאימים</h2>
                            <p className="text-slate-400 text-sm font-medium mt-1">מצאנו {matchingLeads.length} לידים שהדרישות שלהם מתאימות לנכסים בקטלוג</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-2xl transition-all">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-8 flex-1 overflow-y-auto space-y-6">
                    <div className="relative">
                        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                        <input
                            type="text"
                            placeholder="חפש ליד..."
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl pr-12 pl-4 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        {matchingLeads.map(lead => (
                            <div 
                                key={lead.id}
                                onClick={() => toggleLead(lead.id)}
                                className={`flex items-center justify-between p-5 rounded-3xl border transition-all cursor-pointer ${selectedLeadIds.has(lead.id) ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${selectedLeadIds.has(lead.id) ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-700 text-slate-400'}`}>
                                        {lead.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="text-white font-bold text-lg">{lead.name}</div>
                                        <div className="text-slate-400 text-sm">{lead.phone || 'אין טלפון'}</div>
                                    </div>
                                </div>
                                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${selectedLeadIds.has(lead.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'}`}>
                                    {selectedLeadIds.has(lead.id) && <Check size={16} strokeWidth={3} />}
                                </div>
                            </div>
                        ))}

                        {matchingLeads.length === 0 && (
                            <div className="py-12 text-center">
                                <div className="w-20 h-20 bg-slate-800/50 rounded-3xl flex items-center justify-center text-slate-600 mx-auto mb-6">
                                    <AlertCircle size={40} />
                                </div>
                                <h3 className="text-xl font-bold text-slate-300">לא נמצאו לידים מתאימים</h3>
                                <p className="text-slate-500 mt-2">נסה לשנות את החיפוש או לוודא שללידים יש דרישות מוגדרות.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 border-t border-slate-800/50 bg-slate-900/50 backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-6">
                        <div className="text-slate-400 text-sm font-medium">
                            {selectedLeadIds.size} לידים נבחרו
                        </div>
                        <button
                            onClick={handleBroadcast}
                            disabled={selectedLeadIds.size === 0 || sending}
                            className="flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-slate-900 font-black px-10 py-5 rounded-[24px] transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                        >
                            {sending ? (
                                <div className="w-6 h-6 border-3 border-slate-900/40 border-t-slate-900 rounded-full animate-spin" />
                            ) : (
                                <>
                                    <MessageCircle size={24} />
                                    הפץ בוואטסאפ
                                </>
                            )}
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-4 text-center">
                        * לחיצה תפתח חלונות וואטסאפ עבור כל ליד שנבחר. שים לב לחסום חלונות קופצים בדפדפן במידה והם חסומים.
                    </p>
                </div>
            </div>
        </div>
    );
}
