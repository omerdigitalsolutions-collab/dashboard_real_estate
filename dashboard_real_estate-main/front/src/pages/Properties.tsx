import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Upload, MessageCircle, LayoutGrid, List, Building2, User as UserIcon, Pencil, Building, Handshake } from 'lucide-react';
import { useAgents, useLeads, useDeals, useAgency } from '../hooks/useFirestoreData';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAuth } from '../context/AuthContext';

import AddPropertyModal from '../components/modals/AddPropertyModal';
import EditPropertyModal from '../components/modals/EditPropertyModal';
import PropertyDetailsModal from '../components/modals/PropertyDetailsModal';
import ImportModal from '../components/modals/ImportModal';
import MergePropertiesModal from '../components/modals/MergePropertiesModal';
import CreateDealFromPropertyModal from '../components/modals/CreateDealFromPropertyModal';
import KpiCard from '../components/dashboard/KpiCard';
import { Property, AppUser, Lead, Deal, TimeRange } from '../types';
import { deleteProperty } from '../services/propertyService';

export default function Properties() {
    const { properties = [], loading: propertiesLoading } = useLiveDashboardData();
    const { data: agents = [] } = useAgents();
    const { data: leads = [] } = useLeads();
    const { data: deals = [] } = useDeals();
    const { agency } = useAgency();
    const { userData } = useAuth();
    const isAdmin = userData?.role === 'admin';

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('All');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [editingProperty, setEditingProperty] = useState<Property | null>(null);
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
    const [propertyToCreateDeal, setPropertyToCreateDeal] = useState<Property | null>(null);
    const [toast, setToast] = useState('');

    const location = useLocation();
    const navigate = useNavigate();

    const params = new URLSearchParams(location.search);
    const rawRange = params.get('range') as TimeRange | null;
    const [timeRange, setTimeRange] = useState<TimeRange | 'all'>(rawRange || 'all');

    useEffect(() => {
        const queryId = params.get('id');
        const openId = location.state?.openId || queryId;

        if (openId && properties.length > 0) {
            const targetProp = properties.find((p: Property) => p.id === openId);
            if (targetProp && (!selectedProperty || selectedProperty.id !== targetProp.id)) {
                setSelectedProperty(targetProp);
                // Clear state or params to avoid re-opening if needed, 
                // but keep it for query params if we want shareable links.
                if (location.state?.openId) {
                    navigate(location.pathname + location.search, { replace: true, state: {} });
                }
            }
        }

        if (rawRange) {
            setTimeRange(rawRange);
        }
    }, [location.state, location.search, properties, selectedProperty, navigate, location.pathname, rawRange]);

    const handleRangeChange = (newRange: TimeRange | 'all') => {
        setTimeRange(newRange);
        const newParams = new URLSearchParams(location.search);
        if (newRange === 'all') {
            newParams.delete('range');
        } else {
            newParams.set('range', newRange);
        }
        navigate(`${location.pathname}?${newParams.toString()}`, { replace: true, state: location.state });
    };

    const filterByTimeRange = (items: any[], range: TimeRange | 'all') => {
        if (range === 'all') return items;
        const now = new Date();
        const cutoff = new Date();
        if (range === '1m') cutoff.setMonth(now.getMonth() - 1);
        else if (range === '3m') cutoff.setMonth(now.getMonth() - 3);
        else if (range === '6m') cutoff.setMonth(now.getMonth() - 6);
        else if (range === '1y') cutoff.setFullYear(now.getFullYear() - 1);

        return items.filter(item => {
            if (!item.createdAt) return true;
            const itemDate = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
            return itemDate >= cutoff;
        });
    };

    const filteredPropertiesByTime = useMemo(() => filterByTimeRange(properties, timeRange), [properties, timeRange]);

    const handleSelectAll = () => {
        if (selectedPropertyIds.size === filtered.length) {
            setSelectedPropertyIds(new Set());
        } else {
            setSelectedPropertyIds(new Set(filtered.map((p: Property) => p.id)));
        }
    };

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedPropertyIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`למחוק ${selectedPropertyIds.size} נכסים? הפעולה אינה הפיכה.`)) return;
        try {
            await Promise.all([...selectedPropertyIds].map(id => deleteProperty(id)));
            setSelectedPropertyIds(new Set());
        } catch (err) {
            console.error('Failed to bulk delete properties', err);
            alert('שגיאה במחיקה. נסה שוב.');
        }
    };

    const filtered = filteredPropertiesByTime.filter((prop: Property) => {
        const matchesSearch =
            (prop.city && prop.city.toLowerCase().includes(search.toLowerCase())) ||
            (prop.address && prop.address.toLowerCase().includes(search.toLowerCase())) || '';
        const matchesFilter = filter === 'All' || prop.type === filter;
        return matchesSearch && matchesFilter;
    });

    const duplicateGroups = useMemo(() => {
        const groups = new Map<string, Property[]>();
        filteredPropertiesByTime.forEach((p: Property) => {
            if (p.status === 'draft' || !p.city || !p.address) return;
            const cityStr = p.city.trim().toLowerCase();
            const addrStr = p.address.trim().toLowerCase();
            const roomsStr = p.rooms ? p.rooms.toString() : 'no-rooms';
            const sqmStr = p.sqm ? p.sqm.toString() : 'no-sqm';

            const sig = `${cityStr}|${addrStr}|${roomsStr}|${sqmStr}`;
            const existing = groups.get(sig) || [];
            groups.set(sig, [...existing, p]);
        });

        const result: { signature: string, properties: Property[] }[] = [];
        groups.forEach((props, sig) => {
            if (props.length > 1) {
                result.push({ signature: sig, properties: props });
            }
        });
        return result;
    }, [filteredPropertiesByTime]);

    // Helper functions for Grid View
    const getPropertyAgent = (agentId: string) => agents.find((a: AppUser) => a.uid === agentId);

    const getPropertyClient = (propertyId: string) => {
        const relatedDeal = deals.find((d: Deal) => d.propertyId === propertyId);
        if (!relatedDeal) return null;
        return leads.find((l: Lead) => l.id === relatedDeal.leadId);
    };

    const formatPhoneForWhatsApp = (phone?: string) => {
        if (!phone) return null;
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) return `972${cleaned.substring(1)}`;
        if (cleaned.startsWith('972')) return cleaned;
        return `972${cleaned}`;
    };

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 leading-tight">ניהול נכסים</h1>
                    <p className="text-sm text-slate-500 mt-1">{properties.length} נכסים במערכת</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    {selectedPropertyIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="inline-flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm animate-in fade-in zoom-in duration-200"
                        >
                            <Trash2 size={16} />
                            מחק ({selectedPropertyIds.size})
                        </button>
                    )}
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                        <Upload size={16} />
                        ייבוא מאקסל / תמונה
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                        <Plus size={16} />
                        הוסף נכס
                    </button>
                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2.5 rounded-xl shadow-sm h-10 w-full sm:w-auto overflow-hidden">
                        <select
                            value={timeRange}
                            onChange={(e) => handleRangeChange(e.target.value as TimeRange | 'all')}
                            className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none appearance-none pr-2 cursor-pointer w-full text-right"
                        >
                            <option value="all">כל הזמן</option>
                            <option value="1m">חודש אחרון</option>
                            <option value="3m">3 חודשים</option>
                            <option value="6m">6 חודשים</option>
                            <option value="1y">שנה אחרונה</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" dir="rtl">
                <KpiCard
                    title="מלאי נכסים"
                    value={filteredPropertiesByTime.filter(p => p.listingType === 'exclusive' || p.isExclusive === true).length.toString()}
                    rawValue={filteredPropertiesByTime.filter(p => p.listingType === 'exclusive' || p.isExclusive === true).length}
                    target={20}
                    change="חדשים בתקופה"
                    positive={true}
                    subtitle={timeRange === 'all' ? "בלעדיות נכסים (כל הזמן)" : `נכסים בבלעדיות (${timeRange})`}
                    icon="Home"
                    color="sky"
                />
            </div>

            {/* Duplicates Banner */}
            {duplicateGroups.length > 0 && isAdmin && (
                <div className="bg-purple-50 border border-purple-200 text-purple-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <div>
                        <h3 className="font-bold text-sm">זוהו {duplicateGroups.length} קבוצות של נכסים כפולים</h3>
                        <p className="text-xs mt-0.5 opacity-80">חלק מהנכסים מופיעים מספר פעמים במלאי עם נתונים זהים. כדאי למזג אותם למניעת כפילויות.</p>
                    </div>
                    <button
                        onClick={() => setShowMergeModal(true)}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shadow-sm flex-shrink-0"
                    >
                        לסקירה ומיזוג
                    </button>
                </div>
            )}

            {/* Table Card wrapper */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="חיפוש עיר או רחוב..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-right placeholder-slate-400"
                            />
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title="תצוגת כרטיסיות"
                            >
                                <LayoutGrid size={16} />
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title="תצוגת טבלה"
                            >
                                <List size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                        {['All', 'sale', 'rent', 'draft'].map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' + (filter === f ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200')}
                            >
                                {f === 'All' ? 'הכל' : f === 'sale' ? 'למכירה' : f === 'rent' ? 'להשכרה' : 'טיוטות (WhatsApp)'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-4 bg-slate-50/50 min-h-[400px]">
                    {propertiesLoading ? (
                        <div className="text-center text-slate-400 text-sm py-12">טוען נתונים...</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center text-slate-400 text-sm py-12">לא נמצאו נכסים התואמים את החיפוש.</div>
                    ) : viewMode === 'grid' ? (
                        // GRID VIEW
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filtered.map((prop: Property) => {
                                const agent = getPropertyAgent(prop.agentId);
                                const client = getPropertyClient(prop.id);
                                const imgUrl = prop.imageUrls?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80';

                                return (
                                    <div
                                        key={prop.id}
                                        onClick={() => setSelectedProperty(prop)}
                                        className="relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col group"
                                    >
                                        {/* Thumbnail */}
                                        <div className="relative h-48 overflow-hidden bg-slate-100">
                                            <img
                                                src={imgUrl}
                                                alt="Property"
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                            <div className="absolute top-3 right-3 flex flex-col gap-2">
                                                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-md ${prop.status === 'draft' ? 'bg-amber-500/90 text-white' : prop.kind === 'מסחרי' ? 'bg-orange-600/90 text-white' : prop.type === 'sale' ? 'bg-blue-600/90 text-white' : 'bg-emerald-600/90 text-white'}`}>
                                                    {prop.status === 'draft' ? 'טיוטה (דרוש עריכה)' : prop.kind === 'מסחרי' ? 'מסחרי' : prop.type === 'sale' ? 'למכירה' : 'להשכרה'}
                                                </span>
                                            </div>
                                            {prop.listingType === 'exclusive' || (prop.exclusivityEndDate && prop.exclusivityEndDate.toDate() > new Date() && prop.status !== 'draft') ? (
                                                <div className="absolute top-3 left-3 flex items-center gap-1 bg-amber-500/90 backdrop-blur-md text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm w-max">
                                                    👑 בלעדיות
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* Details */}
                                        <div className="p-4 flex-1">
                                            {prop.status === 'draft' ? (
                                                <div className="mb-4">
                                                    <h3 className="font-bold text-lg text-amber-700 mb-1">הודעה מקבוצת WhatsApp</h3>
                                                    <p className="text-sm text-slate-600 line-clamp-3 bg-amber-50 p-2 rounded-lg border border-amber-100">
                                                        "{prop.rawDescription}"
                                                    </p>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{prop.address}</h3>
                                                        <span className="font-bold text-lg text-blue-600">₪{(prop.price || 0).toLocaleString()}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-500 font-medium mb-4 flex items-center gap-1.5">
                                                        <Building2 size={14} className="text-slate-400" />
                                                        {prop.city || 'עיר לא צוינה'} {prop.rooms ? `• ${prop.rooms} חדרים` : ''}
                                                    </p>
                                                </>
                                            )}

                                            {/* Contacts Area */}
                                            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 mt-auto">
                                                {/* Agent */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">הסוכן המטפל</p>
                                                    <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                                        <div className="flex items-center gap-2 truncate">
                                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                                                                {agent?.name ? agent.name.charAt(0) : <UserIcon size={12} />}
                                                            </div>
                                                            <span className="text-xs font-semibold text-slate-700 truncate">{agent?.name || '---'}</span>
                                                        </div>
                                                        {agent?.phone && (
                                                            <a
                                                                href={`https://wa.me/${formatPhoneForWhatsApp(agent.phone)}`}
                                                                target="_blank" rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-emerald-500 hover:text-emerald-600 p-1 hover:bg-emerald-50 rounded-md transition-colors flex-shrink-0"
                                                                title={`שלח הודעה ל${agent.name}`}
                                                            >
                                                                <MessageCircle size={14} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Client / Ext. Agent */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                                        {prop.status === 'draft' ? 'סוכן עמית (WhatsApp)' : 'פרטי לקוח'}
                                                    </p>
                                                    <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                                        <div className="flex items-center gap-2 truncate">
                                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${prop.status === 'draft' ? 'bg-amber-100 text-amber-600' : 'bg-violet-100 text-violet-600'}`}>
                                                                {prop.status === 'draft' ? 'ע' : client?.name ? client.name.charAt(0) : <UserIcon size={12} />}
                                                            </div>
                                                            <span className="text-xs font-semibold text-slate-700 truncate" dir="ltr">
                                                                {prop.status === 'draft' ? (prop.externalAgentPhone || 'לא ידוע') : (client?.name || 'לא שויך')}
                                                            </span>
                                                        </div>
                                                        {(prop.status === 'draft' ? prop.externalAgentPhone : client?.phone) && (
                                                            <a
                                                                href={`https://wa.me/${formatPhoneForWhatsApp(prop.status === 'draft' ? prop.externalAgentPhone : client!.phone)}`}
                                                                target="_blank" rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-emerald-500 hover:text-emerald-600 p-1 hover:bg-emerald-50 rounded-md transition-colors flex-shrink-0"
                                                                title={`שלח הודעה בווטסאפ`}
                                                            >
                                                                <MessageCircle size={14} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Footer Actions */}
                                        <div className="px-4 pb-4 pt-2 flex items-center gap-2 border-t border-slate-100 mt-3 flex-wrap">
                                            {prop.isGlobalCityProperty ? (
                                                <div className="flex-1 w-full text-center py-1.5 px-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold" title="מאגר ציבורי אותר אוטומטית">
                                                    המערכת איתרה נכס זה
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setPropertyToCreateDeal(prop); }}
                                                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold py-1.5 rounded-lg transition-colors"
                                                    title="צור עסקה לנכס זה"
                                                >
                                                    <Handshake size={13} />
                                                    צור עסקה
                                                </button>
                                            )}
                                            {!prop.readonly && !prop.isGlobalCityProperty && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingProperty(prop); }}
                                                    className="p-1.5 bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200 rounded-lg transition-colors shrink-0"
                                                    title="ערוך נכס"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                            {prop.listingType === 'external' && prop.externalAgentPhone && (
                                                <a
                                                    href={`https://wa.me/${formatPhoneForWhatsApp(prop.externalAgentPhone)}?text=${encodeURIComponent(`היי, ראיתי את הנכס שפרסמת ב${prop.city || ''} (${prop.rooms || ''} חדרים, ₪${(prop.price || 0).toLocaleString()}). יש לי לקוח שזה בדיוק מתאים לו. רלוונטי לשת״פ?`)}`}
                                                    target="_blank" rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="p-1.5 bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 border border-slate-200 rounded-lg transition-colors shrink-0"
                                                    title="ווטסאפ סוכן"
                                                >
                                                    <MessageCircle size={14} />
                                                </a>
                                            )}
                                            {isAdmin && prop.yad2Link && (
                                                <a
                                                    href={prop.yad2Link}
                                                    target="_blank" rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="p-1.5 bg-slate-50 hover:bg-orange-50 text-slate-500 hover:text-orange-600 border border-slate-200 rounded-lg transition-colors text-[10px] font-bold"
                                                    title="מודעה ביד2"
                                                >
                                                    🔗
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // TABLE VIEW
                        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                            <table className="w-full text-right border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-3 w-12 text-center">
                                            <input
                                                type="checkbox"
                                                checked={filtered.length > 0 && selectedPropertyIds.size === filtered.length}
                                                onChange={handleSelectAll}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </th>
                                        {['כתובת', 'סוג', 'מחיר', 'חדרים ושטח', 'בלעדיות', 'סוכן', 'לקוח', 'פעולות'].map((h) => (
                                            <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filtered.map((prop: Property) => {
                                        const agent = getPropertyAgent(prop.agentId);
                                        const client = getPropertyClient(prop.id);

                                        return (
                                            <tr
                                                key={prop.id}
                                                onClick={() => setSelectedProperty(prop)}
                                                className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selectedPropertyIds.has(prop.id) ? 'bg-blue-50/60' : ''}`}
                                            >
                                                <td className="px-4 py-4 text-center" onClick={e => !prop.readonly && toggleSelect(prop.id, e)}>
                                                    {!prop.readonly && (
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedPropertyIds.has(prop.id)}
                                                            onChange={() => { }}
                                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${prop.status === 'draft' ? 'bg-amber-50 text-amber-600' : prop.kind === 'מסחרי' ? 'bg-orange-50 text-orange-600' : prop.type === 'sale' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                            {prop.status === 'draft' ? <MessageCircle size={18} /> : <Building size={18} />}
                                                        </div>
                                                        <div>
                                                            {prop.status === 'draft' ? (
                                                                <span className="block text-sm font-semibold text-amber-800">ממתין לאישור (WhatsApp)</span>
                                                            ) : (
                                                                <span className="block text-sm font-semibold text-slate-800">{prop.address} {prop.city ? `, ${prop.city}` : ''}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${prop.kind === 'מסחרי' ? 'bg-orange-50 text-orange-600' : prop.type === 'sale' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {prop.kind === 'מסחרי' ? 'מסחרי' : prop.type === 'sale' ? 'למכירה' : 'להשכרה'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <span className="block text-sm font-bold text-slate-700">₪{prop.price.toLocaleString()}</span>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm text-slate-600">
                                                        {prop.rooms ? `${prop.rooms} חדרים` : '-'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    {prop.listingType === 'exclusive' || (prop.exclusivityEndDate && prop.exclusivityEndDate.toDate() > new Date()) ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 mb-1">
                                                            👑 בלעדיות
                                                        </span>
                                                    ) : prop.isGlobalCityProperty ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 mb-1">
                                                            המערכת איתרה נכס זה
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 block">-</span>
                                                    )}
                                                    {isAdmin && prop.yad2Link && (
                                                        <a href={prop.yad2Link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="block mt-2 text-[10px] text-orange-500 hover:text-orange-600 font-semibold underline">
                                                            לצפייה במודעה ביד2
                                                        </a>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm font-medium text-slate-700">{agent?.name || 'לא משויך'}</div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm font-medium text-slate-700">{client?.name || '-'}</div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="flex items-center gap-2">
                                                        {prop.listingType === 'external' && prop.externalAgentPhone && (
                                                            <a
                                                                href={`https://wa.me/${formatPhoneForWhatsApp(prop.externalAgentPhone)}?text=${encodeURIComponent(`היי, ראיתי את הנכס שפרסמת ב${prop.city || ''} (${prop.rooms || ''} חדרים, ₪${(prop.price || 0).toLocaleString()}). יש לי לקוח שזה בדיוק מתאים לו. רלוונטי לשת״פ?`)}`}
                                                                target="_blank" rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="bg-emerald-500 hover:bg-emerald-600 shadow-sm text-white px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold shrink-0"
                                                                title="צור קשר בוואטסאפ לשת״פ"
                                                            >
                                                                <MessageCircle size={14} /> שת״פ
                                                            </a>
                                                        )}
                                                        {!prop.readonly && !prop.isGlobalCityProperty && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setEditingProperty(prop); }}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                                                                title="ערוך נכס"
                                                            >
                                                                <Pencil size={16} />
                                                            </button>
                                                        )}
                                                        {!prop.isGlobalCityProperty && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setPropertyToCreateDeal(prop); }}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors shrink-0"
                                                                title="צור עסקה"
                                                            >
                                                                <Handshake size={16} />
                                                            </button>
                                                        )}
                                                        {!prop.readonly && !prop.isGlobalCityProperty && (
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (window.confirm('האם אתה בטוח שברצונך למחוק את הנכס?')) {
                                                                        try {
                                                                            await deleteProperty(prop.id);
                                                                        } catch (err) {
                                                                            console.error('Failed to delete property', err);
                                                                            alert('שגיאה במחיקת הנכס. נסה שוב.');
                                                                        }
                                                                    }
                                                                }}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                                title="מחק נכס"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination (Mock) */}
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <p className="text-xs text-slate-500">
                        מציג <span className="font-semibold text-slate-700">{filtered.length}</span> רשומות
                    </p>
                </div>
            </div>

            <AddPropertyModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
            />

            {editingProperty && (
                <EditPropertyModal
                    property={editingProperty}
                    isOpen={true}
                    onClose={() => setEditingProperty(null)}
                    onSuccess={(msg) => {
                        setEditingProperty(null);
                        setToast(msg);
                        setTimeout(() => setToast(''), 3500);
                    }}
                />
            )}

            <ImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                defaultEntityType="property"
            />

            {selectedProperty && (
                <PropertyDetailsModal
                    property={selectedProperty}
                    agents={agents}
                    leads={leads}
                    onClose={() => setSelectedProperty(null)}
                    onCreateDeal={(prop) => {
                        setSelectedProperty(null); // Close details modal
                        setPropertyToCreateDeal(prop); // Open create deal modal
                    }}
                />
            )}

            <MergePropertiesModal
                isOpen={showMergeModal}
                onClose={() => setShowMergeModal(false)}
                groups={duplicateGroups}
                onMerged={() => {
                    setToast('הנכסים מוזגו בהצלחה!');
                    setTimeout(() => setToast(''), 3500);
                }}
            />

            {propertyToCreateDeal && (
                <CreateDealFromPropertyModal
                    property={propertyToCreateDeal}
                    agents={agents}
                    leads={leads}
                    agencySettings={agency?.settings}
                    isOpen={true}
                    onClose={() => setPropertyToCreateDeal(null)}
                    onSuccess={(msg) => {
                        setToast(msg);
                        setTimeout(() => setToast(''), 3500);
                    }}
                />
            )}

            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl z-50">
                    {toast}
                </div>
            )}
        </div>
    );
}
