import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Upload, MessageCircle, LayoutGrid, List, Building2, User as UserIcon, Pencil, Building, Handshake, ArrowUpDown } from 'lucide-react';
import { useAgents, useLeads, useDeals, useAgency } from '../hooks/useFirestoreData';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAuth } from '../context/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';

import AddPropertyModal from '../components/modals/AddPropertyModal';
import EditPropertyModal from '../components/modals/EditPropertyModal';
import PropertyDetailsModal from '../components/modals/PropertyDetailsModal';
import ImportModal from '../components/modals/ImportModal';
import MergePropertiesModal from '../components/modals/MergePropertiesModal';
import CreateDealFromPropertyModal from '../components/modals/CreateDealFromPropertyModal';
import KpiCard from '../components/dashboard/KpiCard';
import { Property, AppUser, Lead, TimeRange } from '../types';
import { deleteProperty } from '../services/propertyService';

export default function Properties() {
    const { properties = [], loading: propertiesLoading } = useLiveDashboardData();
    const { data: agents = [] } = useAgents();
    const { data: leads = [] } = useLeads();
    const { data: deals = [] } = useDeals();
    const { agency } = useAgency();
    const { userData } = useAuth();
    const isAdmin = userData?.role === 'admin';
    const isMobile = useMediaQuery('(max-width: 768px)');

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('All');
    const [sortConfig, setSortConfig] = useState<{ key: 'price' | 'createdAt', direction: 'asc' | 'desc' } | null>({ key: 'createdAt', direction: 'desc' });
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [editingProperty, setEditingProperty] = useState<Property | null>(null);
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
    const [propertiesToCreateDeal, setPropertiesToCreateDeal] = useState<Property[]>([]);
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
        const matchesFilter =
            filter === 'All' ||
            (filter === 'commercial' ? prop.kind === 'מסחרי' : prop.type === filter && prop.kind !== 'מסחרי');
        return matchesSearch && matchesFilter;
    });

    const sorted = useMemo(() => {
        const items = [...filtered];
        if (sortConfig) {
            items.sort((a, b) => {
                let aVal: any = a[sortConfig.key];
                let bVal: any = b[sortConfig.key];

                if (sortConfig.key === 'createdAt') {
                    aVal = a.createdAt?.toMillis() || 0;
                    bVal = b.createdAt?.toMillis() || 0;
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [filtered, sortConfig]);

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

    // Count per filter tab (calculated from filteredPropertiesByTime, not filtered)
    const tabCounts = useMemo(() => ({
        All: filteredPropertiesByTime.length,
        sale: filteredPropertiesByTime.filter((p: Property) => p.type === 'sale' && p.kind !== 'מסחרי').length,
        rent: filteredPropertiesByTime.filter((p: Property) => p.type === 'rent' && p.kind !== 'מסחרי').length,
        commercial: filteredPropertiesByTime.filter((p: Property) => p.kind === 'מסחרי').length,
        draft: filteredPropertiesByTime.filter((p: Property) => p.status === 'draft').length,
    }), [filteredPropertiesByTime]);

    // Helper functions for Grid View
    const getPropertyAgent = (agentId: string) => agents.find((a: AppUser) => a.uid === agentId);

    const getPropertyClient = (propertyId: string) => {
        const relatedDeal = deals.find((d: any) => d.propertyId === propertyId);
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

    /**
     * Returns visual styles per listing type / source:
     * - exclusive  → gold/amber (agency's own exclusive)
     * - external   → purple (another agency's listing)
     * - private    → slate (private / owner-listed)
     * - city       → teal/cyan (system-sourced from cities collection)
     * - draft      → amber-warm (WhatsApp draft)
     */
    const getListingStyle = (prop: Property): {
        borderColor: string;
        iconBg: string;
        iconText: string;
        badgeBg: string;
        badgeText: string;
        badgeLabel: string;
        badgeEmoji: string;
    } => {
        if (prop.isGlobalCityProperty) {
            return {
                borderColor: 'border-l-4 border-l-cyan-400',
                iconBg: 'bg-cyan-50',
                iconText: 'text-cyan-600',
                badgeBg: 'bg-cyan-50 border-cyan-200 text-cyan-700',
                badgeText: 'text-cyan-700',
                badgeLabel: 'נכס שהמערת איתרה',
                badgeEmoji: '🔍',
            };
        }
        if (prop.status === 'draft') {
            return {
                borderColor: 'border-l-4 border-l-amber-400',
                iconBg: 'bg-amber-50',
                iconText: 'text-amber-600',
                badgeBg: 'bg-amber-50 border-amber-200 text-amber-700',
                badgeText: 'text-amber-700',
                badgeLabel: 'טיוטה (WhatsApp)',
                badgeEmoji: '💬',
            };
        }
        if (prop.listingType === 'exclusive' || prop.isExclusive) {
            return {
                borderColor: 'border-l-4 border-l-amber-500',
                iconBg: 'bg-amber-50',
                iconText: 'text-amber-600',
                badgeBg: 'bg-amber-50 border-amber-200 text-amber-700',
                badgeText: 'text-amber-700',
                badgeLabel: 'בלעדיות המשרד',
                badgeEmoji: '👑',
            };
        }
        if (prop.listingType === 'external') {
            return {
                borderColor: 'border-l-4 border-l-purple-400',
                iconBg: 'bg-purple-50',
                iconText: 'text-purple-600',
                badgeBg: 'bg-purple-50 border-purple-200 text-purple-700',
                badgeText: 'text-purple-700',
                badgeLabel: 'ממשרד אחר',
                badgeEmoji: '🤝',
            };
        }
        if (prop.listingType === 'private') {
            return {
                borderColor: 'border-l-4 border-l-slate-400',
                iconBg: 'bg-slate-50',
                iconText: 'text-slate-600',
                badgeBg: 'bg-slate-50 border-slate-200 text-slate-600',
                badgeText: 'text-slate-600',
                badgeLabel: 'נכס פרטי',
                badgeEmoji: '🔑',
            };
        }
        // Default (no listingType set — agency-owned)
        return {
            borderColor: 'border-l-4 border-l-blue-400',
            iconBg: 'bg-blue-50',
            iconText: 'text-blue-600',
            badgeBg: 'bg-blue-50 border-blue-200 text-blue-700',
            badgeText: 'text-blue-700',
            badgeLabel: 'נכס המשרד',
            badgeEmoji: '🏠',
        };
    };

    return (
        <div className="space-y-4 sm:space-y-6" dir="rtl">
            {/* Header Area */}
            {!isMobile ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 leading-tight">ניהול נכסים</h1>
                        <p className="text-sm text-slate-500 mt-1">{properties.length} נכסים במערכת</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                        {selectedPropertyIds.size > 0 && (
                            <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                                <button
                                    onClick={() => {
                                        const selected = properties.filter(p => selectedPropertyIds.has(p.id));
                                        setPropertiesToCreateDeal(selected);
                                    }}
                                    className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                                >
                                    <Handshake size={16} />
                                    צור עסקה ({selectedPropertyIds.size})
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="inline-flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                                >
                                    <Trash2 size={16} />
                                    מחק ({selectedPropertyIds.size})
                                </button>
                            </div>
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
            ) : (
                /* Mobile Header */
                <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 leading-tight">ניהול נכסים</h1>
                            <p className="text-sm text-slate-500 mt-0.5">{properties.length} נכסים במערכת</p>
                        </div>
                        <div className="flex items-center gap-2">
                             <button
                                onClick={() => setShowImportModal(true)}
                                className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-full shadow-sm"
                            >
                                <Upload size={18} />
                            </button>
                            <div className="relative">
                                <select
                                    value={timeRange}
                                    onChange={(e) => handleRangeChange(e.target.value as TimeRange | 'all')}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                >
                                    <option value="all">כל הזמן</option>
                                    <option value="1m">חודש אחרון</option>
                                    <option value="3m">3 חודשים</option>
                                    <option value="6m">6 חודשים</option>
                                    <option value="1y">שנה אחרונה</option>
                                </select>
                                <div className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-full shadow-sm pointer-events-none">
                                    <Building size={18} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Filter Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x touch-pan-x">
                        {[
                            { key: 'All', label: 'הכל' },
                            { key: 'sale', label: 'למכירה' },
                            { key: 'rent', label: 'להשכרה' },
                            { key: 'commercial', label: 'מסחרי' },
                            { key: 'draft', label: 'טיוטות' },
                        ].map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setFilter(key)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap snap-start border ${
                                    filter === key 
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                            >
                                {label}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === key ? 'bg-white/30 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {tabCounts[key as keyof typeof tabCounts]}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Mobile Bulk Actions */}
                    {selectedPropertyIds.size > 0 && (
                        <div className="flex items-center gap-2 py-2 px-3 bg-blue-50 border border-blue-100 rounded-2xl animate-in slide-in-from-top-2">
                            <span className="text-sm font-bold text-blue-700 px-2">{selectedPropertyIds.size} נבחרו</span>
                            <div className="flex-1" />
                            <button
                                onClick={() => {
                                    const selected = properties.filter(p => selectedPropertyIds.has(p.id));
                                    setPropertiesToCreateDeal(selected);
                                }}
                                className="p-2 bg-emerald-100 text-emerald-700 rounded-xl"
                            >
                                <Handshake size={18} />
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="p-2 bg-red-100 text-red-700 rounded-xl"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Top KPI Cards */}
            <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto sm:overflow-x-visible pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide snap-x touch-pan-x" dir="rtl">
                <div className="min-w-[280px] sm:min-w-full snap-start">
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
                                className="w-full bg-slate-50 border-none rounded-xl pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20"
                            />
                        </div>
                        {!isMobile && (
                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg h-9">
                                <ArrowUpDown size={14} className="text-slate-400" />
                                <select
                                    value={`${sortConfig?.key}-${sortConfig?.direction}`}
                                    onChange={(e) => {
                                        const [key, direction] = e.target.value.split('-') as [any, any];
                                        setSortConfig({ key, direction });
                                    }}
                                    className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none appearance-none cursor-pointer"
                                >
                                    <option value="createdAt-desc">חדש קודם</option>
                                    <option value="createdAt-asc">ישן קודם</option>
                                    <option value="price-asc">מחיר (נמוך לגבוה)</option>
                                    <option value="price-desc">מחיר (גבוה לנמוך)</option>
                                </select>
                            </div>
                        )}
                        {!isMobile && (
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
                        )}
                        {isMobile && (
                             <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl h-10">
                                <ArrowUpDown size={14} className="text-slate-400" />
                                <select
                                    value={`${sortConfig?.key}-${sortConfig?.direction}`}
                                    onChange={(e) => {
                                        const [key, direction] = e.target.value.split('-') as [any, any];
                                        setSortConfig({ key, direction });
                                    }}
                                    className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none appearance-none cursor-pointer"
                                >
                                    <option value="createdAt-desc">חדש</option>
                                    <option value="price-asc">מחיר ↑</option>
                                    <option value="price-desc">מחיר ↓</option>
                                </select>
                            </div>
                        )}
                    </div>
                    {!isMobile && (
                        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                            {[
                                { key: 'All', label: 'הכל' },
                                { key: 'sale', label: 'למכירה' },
                                { key: 'rent', label: 'להשכרה' },
                                { key: 'commercial', label: 'מסחרי' },
                                { key: 'draft', label: 'טיוטות (WhatsApp)' },
                            ].map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setFilter(key)}
                                    className={'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ' + (filter === key ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200')}
                                >
                                    {label}
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filter === key ? 'bg-white/30 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                        {tabCounts[key as keyof typeof tabCounts]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="p-4 bg-slate-50/50 min-h-[400px]">
                    {propertiesLoading ? (
                        <div className="text-center text-slate-400 text-sm py-12">טוען נתונים...</div>
                    ) : sorted.length === 0 ? (
                        <div className="text-center text-slate-400 text-sm py-12">לא נמצאו נכסים התואמים את החיפוש.</div>
                    ) : (viewMode === 'grid' || isMobile) ? (
                        // GRID VIEW (Always on mobile)
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                            {sorted.map((prop: Property) => {
                                const agent = getPropertyAgent(prop.agentId);
                                const client = getPropertyClient(prop.id);
                                const imgUrl = prop.imageUrls?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80';

                                const listingStyle = getListingStyle(prop);

                                return (
                                    <div
                                        key={prop.id}
                                        onClick={() => setSelectedProperty(prop)}
                                        className={`relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col group ${listingStyle.borderColor}`}
                                    >
                                        {/* Hover-only "System Found" tooltip for city properties */}
                                        {prop.isGlobalCityProperty && (
                                            <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-center pt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                <span className="bg-cyan-600/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                                                    🔍 נכס שהמערת איתרה
                                                </span>
                                            </div>
                                        )}

                                        {/* Thumbnail */}
                                        <div className="relative h-48 overflow-hidden bg-slate-100">
                                            <img
                                                src={imgUrl}
                                                alt="Property"
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                            {/* Property type badge (top-right) */}
                                            <div className="absolute top-3 right-3 flex flex-col gap-2">
                                                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-md ${prop.status === 'draft' ? 'bg-amber-500/90 text-white' : prop.kind === 'מסחרי' ? 'bg-orange-600/90 text-white' : prop.type === 'sale' ? 'bg-blue-600/90 text-white' : 'bg-emerald-600/90 text-white'}`}>
                                                    {prop.status === 'draft' ? 'טיוטה (דרוש עריכה)' : prop.kind === 'מסחרי' ? 'מסחרי' : prop.type === 'sale' ? 'למכירה' : 'להשכרה'}
                                                </span>
                                            </div>
                                            {/* Listing-type badge (top-left) */}
                                            <div className="absolute top-3 left-3">
                                                {(prop.listingType === 'exclusive' || (prop.exclusivityEndDate && prop.exclusivityEndDate.toDate() > new Date() && prop.status !== 'draft')) && (
                                                    <span className="flex items-center gap-1 bg-amber-500/90 backdrop-blur-md text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm">
                                                        👑 בלעדיות
                                                    </span>
                                                )}
                                                {prop.listingType === 'external' && prop.status !== 'draft' && !prop.isGlobalCityProperty && (
                                                    <span className="flex items-center gap-1 bg-purple-600/90 backdrop-blur-md text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm">
                                                        🤝 ממשרד אחר
                                                    </span>
                                                )}
                                                {prop.listingType === 'private' && prop.status !== 'draft' && (
                                                    <span className="flex items-center gap-1 bg-slate-600/90 backdrop-blur-md text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm">
                                                        🔑 פרטי
                                                    </span>
                                                )}
                                                {prop.isGlobalCityProperty && (
                                                    <span className="flex items-center gap-1 bg-cyan-600/90 backdrop-blur-md text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm">
                                                        🔍 מאגר ציבורי
                                                    </span>
                                                )}
                                            </div>
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
                                                <div className={`flex-1 w-full text-center py-1.5 px-2 border rounded-lg text-xs font-bold ${listingStyle.badgeBg}`}>
                                                    {listingStyle.badgeEmoji} {listingStyle.badgeLabel}
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setPropertiesToCreateDeal([prop]); }}
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
                                                checked={sorted.length > 0 && selectedPropertyIds.size === sorted.length}
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
                                    {sorted.map((prop: Property) => {
                                        const agent = getPropertyAgent(prop.agentId);
                                        const client = getPropertyClient(prop.id);

                                        const tableListingStyle = getListingStyle(prop);

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
                                                        {/* Icon color-coded per listing type */}
                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tableListingStyle.iconBg} ${tableListingStyle.iconText}`}>
                                                            {prop.status === 'draft' ? <MessageCircle size={18} /> : <Building size={18} />}
                                                        </div>
                                                        <div className="relative group/addr">
                                                            {prop.status === 'draft' ? (
                                                                <span className="block text-sm font-semibold text-amber-800">ממתין לאישור (WhatsApp)</span>
                                                            ) : (
                                                                <span className="block text-sm font-semibold text-slate-800">{prop.address} {prop.city ? `, ${prop.city}` : ''}</span>
                                                            )}
                                                            {/* Listing type tag */}
                                                            <span className={`inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${tableListingStyle.badgeBg}`}>
                                                                {tableListingStyle.badgeEmoji} {tableListingStyle.badgeLabel}
                                                            </span>
                                                            {/* Hover tooltip for city properties */}
                                                            {prop.isGlobalCityProperty && (
                                                                <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-cyan-700 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-lg opacity-0 group-hover/addr:opacity-100 transition-opacity pointer-events-none z-10">
                                                                    🔍 נכס שהמערת איתרה
                                                                </span>
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
                                                                onClick={(e) => { e.stopPropagation(); setPropertiesToCreateDeal([prop]); }}
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
                        מציג <span className="font-semibold text-slate-700">{sorted.length}</span> רשומות
                    </p>
                </div>
            </div>

            {/* Mobile FAB */}
            {isMobile && (
                <button
                    onClick={() => setShowAddModal(true)}
                    className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/40 flex items-center justify-center z-40 animate-in zoom-in duration-300"
                >
                    <Plus size={28} />
                </button>
            )}

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
                        setPropertiesToCreateDeal([prop]); // Open create deal modal
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

            {propertiesToCreateDeal.length > 0 && (
                <CreateDealFromPropertyModal
                    properties={propertiesToCreateDeal}
                    agents={agents}
                    leads={leads}
                    agencySettings={agency?.settings}
                    isOpen={true}
                    onClose={() => setPropertiesToCreateDeal([])}
                    onSuccess={(msg) => {
                        setToast(msg);
                        setTimeout(() => setToast(''), 3500);
                        setSelectedPropertyIds(new Set()); // Clear selection after bulk creation
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
