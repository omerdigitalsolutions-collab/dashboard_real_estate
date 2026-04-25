import { useState, useMemo } from 'react';
import { Search, Sparkles, Filter, ExternalLink, Copy, Check, MessageCircle, Users, Trash2, Calendar, LayoutGrid, List, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { SharedCatalog, Lead, Property } from '../types';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import CatalogLeadMatcherModal from '../components/modals/CatalogLeadMatcherModal';
import PropertyCatalogCreatorModal from '../components/modals/PropertyCatalogCreatorModal';

export default function Catalogs() {
    const { userData } = useAuth();
    const navigate = useNavigate();
    const { sharedCatalogs, leads, properties } = useLiveDashboardData();
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [activeTab, setActiveTab] = useState<'general' | 'leads'>('general');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [matchingCatalog, setMatchingCatalog] = useState<SharedCatalog | null>(null);
    const [isCreatorOpen, setIsCreatorOpen] = useState(false);

    const filteredCatalogs = useMemo(() => {
        return (sharedCatalogs || [])
            .filter(catalog => {
                const matchesSearch = (catalog.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (catalog.leadName || '').toLowerCase().includes(searchTerm.toLowerCase());
                
                const isGeneral = !catalog.leadId;
                const matchesTab = activeTab === 'general' ? isGeneral : !isGeneral;

                return matchesSearch && matchesTab;
            })
            .sort((a, b) => {
                const timeA = a.createdAt?.seconds || 0;
                const timeB = b.createdAt?.seconds || 0;
                return timeB - timeA;
            });
    }, [sharedCatalogs, searchTerm, activeTab]);

    const handleCopyLink = async (id: string) => {
        const url = `https://homer.management/catalog/${id}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק קטלוג זה? הקישור יפסיק לעבוד.')) return;
        try {
            await deleteDoc(doc(db, 'shared_catalogs', id));
        } catch (err) {
            console.error('Failed to delete catalog', err);
            alert('שגיאה במחיקת הקטלוג');
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'תאריך לא ידוע';
        const date = new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500" dir="rtl">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Sparkles className="text-blue-500" size={32} />
                        ניהול קטלוגים
                    </h1>
                    <p className="text-slate-400 font-medium">נהל ושתף קטלוגים כלליים או מותאמים אישית ללידים</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setIsCreatorOpen(true)}
                        className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                    >
                        <Plus size={20} />
                        צור קטלוג חדש
                    </button>

                    <div className="flex items-center gap-3 bg-slate-900/50 p-1 rounded-2xl border border-slate-800">
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            <LayoutGrid size={20} />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            <List size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs & Filters bar */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-8 border-b border-slate-800 pb-px">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`pb-4 text-lg font-bold transition-all relative ${activeTab === 'general' ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        קטלוגים כלליים
                        {activeTab === 'general' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-t-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('leads')}
                        className={`pb-4 text-lg font-bold transition-all relative ${activeTab === 'leads' ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        קטלוגים עבור לידים
                        {activeTab === 'leads' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-t-full" />}
                    </button>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 p-4 rounded-3xl flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                        <input
                            type="text"
                            placeholder={activeTab === 'general' ? "חפש לפי שם קטלוג..." : "חפש לפי שם ליד..."}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl pr-12 pl-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            {filteredCatalogs.length > 0 ? (
                <div className={viewMode === 'grid' 
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6"
                    : "flex flex-col gap-4"
                }>
                    {filteredCatalogs.map((catalog) => (
                        <CatalogCard 
                            key={catalog.id} 
                            catalog={catalog} 
                            viewMode={viewMode}
                            onCopy={() => handleCopyLink(catalog.id)}
                            onDelete={() => handleDelete(catalog.id)}
                            onMatch={() => setMatchingCatalog(catalog)}
                            isCopied={copiedId === catalog.id}
                            formatDate={formatDate}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-slate-900/20 border border-slate-800/50 rounded-[40px] py-20 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-slate-800/50 rounded-3xl flex items-center justify-center text-slate-600 mb-6">
                        <Sparkles size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-300">לא נמצאו קטלוגים</h3>
                    <p className="text-slate-500 mt-2 max-w-sm">צור קטלוג חדש מתוך עמוד הנכסים או על ידי שיתוף נכסים לליד.</p>
                </div>
            )}

            {matchingCatalog && (
                <CatalogLeadMatcherModal
                    catalog={matchingCatalog}
                    properties={properties.filter(p => 
                        matchingCatalog.propertyIds?.some(item => 
                            typeof item === 'string' ? item === p.id : item.id === p.id
                        )
                    )}
                    leads={leads}
                    onClose={() => setMatchingCatalog(null)}
                />
            )}

            {isCreatorOpen && (
                <PropertyCatalogCreatorModal
                    properties={properties}
                    onClose={() => setIsCreatorOpen(false)}
                    onSuccess={(id) => {
                        // Optional: show toast or scroll to new catalog
                    }}
                />
            )}
        </div>
    );
}

function CatalogCard({ catalog, viewMode, onCopy, onDelete, onMatch, isCopied, formatDate }: { 
    catalog: SharedCatalog, 
    viewMode: 'grid' | 'list',
    onCopy: () => void,
    onDelete: () => void,
    onMatch: () => void,
    isCopied: boolean,
    formatDate: (t: any) => string
}) {
    const isGeneral = !catalog.leadId;

    if (viewMode === 'list') {
        return (
            <div className={`bg-slate-900/40 border rounded-2xl p-4 flex items-center justify-between group transition-all ${isGeneral ? 'border-slate-800 hover:border-blue-500/30' : 'border-slate-800 hover:border-emerald-500/30'}`}>
                <div className="flex items-center gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isGeneral ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {isGeneral ? <Sparkles size={24} /> : <Users size={24} />}
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-white font-bold truncate">{catalog.title || catalog.leadName || 'קטלוג ללא שם'}</h4>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(catalog.createdAt)}</span>
                            <span className="flex items-center gap-1"><LayoutGrid size={12} /> {catalog.propertyIds?.length || 0} נכסים</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isGeneral && (
                        <button 
                            onClick={onMatch}
                            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl transition-all font-bold text-xs"
                            title="התאם לידים"
                        >
                            <Users size={16} />
                            התאם לידים
                        </button>
                    )}
                    <button 
                        onClick={onCopy}
                        className={`p-2 rounded-xl transition-all ${isCopied ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        title="העתק קישור"
                    >
                        {isCopied ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                    <a 
                        href={`https://homer.management/catalog/${catalog.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-all"
                        title="צפה"
                    >
                        <ExternalLink size={18} />
                    </a>
                    <button 
                        onClick={onDelete}
                        className="p-2 bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                        title="מחק"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-slate-900/40 border rounded-[32px] p-6 flex flex-col gap-6 group transition-all relative overflow-hidden ${isGeneral ? 'border-slate-800 hover:border-blue-500/30' : 'border-slate-800 hover:border-emerald-500/30'}`}>
            {/* Background glow on hover */}
            <div className={`absolute -top-10 -right-10 w-32 h-32 blur-[50px] transition-all pointer-events-none ${isGeneral ? 'bg-blue-600/5 group-hover:bg-blue-600/10' : 'bg-emerald-600/5 group-hover:bg-emerald-600/10'}`}></div>
            
            <div className="flex items-start justify-between relative">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isGeneral ? 'bg-blue-600/20 text-blue-400 shadow-inner' : 'bg-emerald-600/20 text-emerald-400 shadow-inner'}`}>
                    {isGeneral ? <Sparkles size={28} /> : <Users size={28} />}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider ${isGeneral ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                        {isGeneral ? 'קטלוג כללי' : 'עבור ליד'}
                    </span>
                </div>
            </div>

            <div className="space-y-1">
                <h4 className="text-xl font-bold text-white line-clamp-1 leading-tight">{catalog.title || catalog.leadName || 'קטלוג ללא שם'}</h4>
                <p className="text-slate-500 text-sm flex items-center gap-2 font-medium">
                    <Calendar size={14} className="text-slate-600" />
                    נוצר ב-{formatDate(catalog.createdAt)}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                <div className="text-center">
                    <div className="text-2xl font-black text-white leading-none">{catalog.propertyIds?.length || 0}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">נכסים</div>
                </div>
                <div className="text-center border-r border-slate-800">
                    <div className="text-2xl font-black text-white leading-none">{isGeneral ? '-' : '1'}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">לידים</div>
                </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 mt-auto">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onCopy}
                        className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${isCopied ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/50'}`}
                    >
                        {isCopied ? <Check size={16} /> : <Copy size={16} />}
                        {isCopied ? 'הועתק בהצלחה' : 'העתק קישור'}
                    </button>
                    <a 
                        href={`https://homer.management/catalog/${catalog.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3.5 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white rounded-xl transition-all border border-slate-700/50 active:scale-95"
                    >
                        <ExternalLink size={20} />
                    </a>
                </div>

                {isGeneral && (
                    <button 
                        onClick={onMatch}
                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
                    >
                        <Users size={18} />
                        התאם לידים רלוונטיים
                    </button>
                )}

                {!isGeneral && (
                    <button 
                        onClick={onDelete}
                        className="w-full flex items-center justify-center gap-2 py-3 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-xl font-bold text-xs transition-all mt-1"
                    >
                        <Trash2 size={16} />
                        מחק קטלוג
                    </button>
                )}
                
                {isGeneral && (
                    <button 
                        onClick={onDelete}
                        className="text-center text-xs text-slate-600 hover:text-red-400 transition-colors mt-1 font-bold"
                    >
                        מחק קטלוג
                    </button>
                )}
            </div>
        </div>
    );
}
