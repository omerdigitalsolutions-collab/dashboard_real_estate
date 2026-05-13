import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Upload, MessageCircle, LayoutGrid, List, Building2, User as UserIcon, Pencil, Building, Handshake, ArrowUpDown, Phone, Sparkles, Calendar, ShieldCheck } from 'lucide-react';
import { useAgents, useLeads, useDeals, useAgency } from '../hooks/useFirestoreData';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAuth } from '../context/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import { useSuperAdminAllCityProperties } from '../hooks/useSuperAdminAllCityProperties';

import AddPropertyModal from '../components/modals/AddPropertyModal';
import EditPropertyModal from '../components/modals/EditPropertyModal';
import PropertyDetailsModal from '../components/modals/PropertyDetailsModal';
import ImportModal from '../components/modals/ImportModal';
import MergePropertiesModal from '../components/modals/MergePropertiesModal';
import CreateDealFromPropertyModal from '../components/modals/CreateDealFromPropertyModal';
import GeneralCatalogModal from '../components/modals/GeneralCatalogModal';
import KpiCard from '../components/dashboard/KpiCard';
import UpgradeModal from '../components/ui/UpgradeModal';
import { useSubscriptionGuard } from '../hooks/useSubscriptionGuard';
import { Property, AppUser, Lead, TimeRange } from '../types';
import { deleteProperty, updateProperty } from '../services/propertyService';
import { normalizeCity } from '../utils/stringUtils';
import { translatePropertyKind } from '../utils/formatters';
import { COMMERCIAL_PROPERTY_TYPES } from '../utils/constants';

export default function Properties() {
    const { properties: agencyProperties = [], loading: agencyLoading } = useLiveDashboardData();
    const { data: agents = [] } = useAgents();
    const { data: leads = [] } = useLeads();
    const { data: deals = [] } = useDeals();
    const { agency } = useAgency();
    const { userData } = useAuth();
    const isAdmin = userData?.role === 'admin';
    const isAgent = userData?.role === 'agent';
    const currentUid = userData?.uid;
    const isMobile = useMediaQuery('(max-width: 768px)');

    const { isSuperAdmin } = useSuperAdmin();
    const { properties: allCityProperties, loading: cityLoading, cityCount } = useSuperAdminAllCityProperties(isSuperAdmin);

    // Super admin sees all city properties from every city; regular users see their agency properties
    const properties = isSuperAdmin ? allCityProperties : agencyProperties;
    const propertiesLoading = isSuperAdmin ? cityLoading : agencyLoading;

    const [search, setSearch] = useState('');
    const [mainFilter, setMainFilter] = useState<'my' | 'general'>('my');

    // Super admin always shows the general pool (all city properties)
    useEffect(() => {
        if (isSuperAdmin) setMainFilter('general');
    }, [isSuperAdmin]);
    const [subFilter, setSubFilter] = useState('all');
    const [roomsFilter, setRoomsFilter] = useState<string>('all');
    const [sortConfig, setSortConfig] = useState<{ key: 'price' | 'createdAt', direction: 'asc' | 'desc' } | null>({ key: 'createdAt', direction: 'desc' });
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [showGeneralCatalogModal, setShowGeneralCatalogModal] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [editingProperty, setEditingProperty] = useState<Property | null>(null);
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
    const [propertiesToCreateDeal, setPropertiesToCreateDeal] = useState<Property[]>([]);
    const [toast, setToast] = useState('');

    const location = useLocation();
    const navigate = useNavigate();
    const { features } = useSubscriptionGuard();

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
        const selectedCount = selectedPropertyIds.size;
        if (!selectedCount) return;

        // Filter out sourcing properties - They cannot be deleted from here per user requirement
        const allSelected = properties.filter(p => selectedPropertyIds.has(p.id));
        const toDeleteIds = allSelected
            .filter(p => !p.isGlobalCityProperty)
            .map(p => p.id);
        
        const sourcingCount = selectedCount - toDeleteIds.length;

        if (sourcingCount > 0 && toDeleteIds.length === 0) {
            alert('לא ניתן למחוק נכסים ממאגר ציבורי.');
            return;
        }

        const confirmMsg = sourcingCount > 0 
            ? `למחוק ${toDeleteIds.length} נכסים? (${sourcingCount} נכסי מאגר ציבורי יושמטו). הפעולה אינה הפיכה.`
            : `למחוק ${selectedPropertyIds.size} נכסים? הפעולה אינה הפיכה.`;

        if (!window.confirm(confirmMsg)) return;

        setToast('מוחק נכסים...');
        let successCount = 0;
        let failMsgs: string[] = [];

        try {
            // Run all deletions in parallel for much better performance
            const results = await Promise.all(toDeleteIds.map(async (id) => {
                try {
                    await deleteProperty(id);
                    return { id, success: true };
                } catch (err: any) {
                    return { id, success: false, error: err.message || 'שגיאה לא ידועה' };
                }
            }));

            results.forEach(res => {
                if (res.success) {
                    successCount++;
                } else if (res.error && !failMsgs.includes(res.error)) {
                    failMsgs.push(res.error);
                }
            });
            
            setSelectedPropertyIds(new Set());
            setToast(successCount > 0 ? `${successCount} נכסים נמחקו בהצלחה.` : '');
            
            if (failMsgs.length > 0) {
                alert(`חלק מהנכסים לא נמחקו:\n${failMsgs.join('\n')}`);
            }
        } catch (err) {
            console.error('Failed to bulk delete properties', err);
            alert('שגיאה בתהליך המחיקה.');
        } finally {
            setTimeout(() => setToast(''), 3000);
        }
    };

    const handleShareToMarketplace = async (prop: Property) => {
        if (!prop.id) return;
        if (!window.confirm('האם אתה בטוח שברצונך לשתף נכס זה למרקטפלייס? פרטי הבעלים יישארו חסויים.')) return;
        try {
            setToast('משתף במרקטפלייס...');
            await updateProperty(prop.id, {
                collaborationStatus: 'collaborative'
            }, prop.isGlobalCityProperty ? prop.address?.city : undefined);
            setToast('הנכס שותף במרקטפלייס בהצלחה');
        } catch (error) {
            console.error('Error sharing to marketplace:', error);
            alert('שגיאה בשיתוף הנכס');
        } finally {
            setTimeout(() => setToast(''), 3000);
        }
    };

    const filtered = filteredPropertiesByTime.filter((prop: Property) => {
        const normSearch = normalizeCity(search);
        const matchesSearch = !normSearch ||
            (prop.address?.city && normalizeCity(prop.address.city).includes(normSearch)) ||
            (prop.address?.fullAddress && normalizeCity(prop.address.fullAddress).includes(normSearch));
        
        const isAssignedToMe = prop.management?.assignedAgentId === currentUid;
        const isMyProperty = isAgent
            ? (isAssignedToMe && !prop.isGlobalCityProperty && prop.status !== 'draft')
            : (!prop.isGlobalCityProperty && prop.status !== 'draft');
        const isGeneralPool = prop.isGlobalCityProperty;
        const isDraft = isAgent
            ? (prop.status === 'draft' && isAssignedToMe)
            : prop.status === 'draft';

        // Filter by Main Tab
        const matchesMain = mainFilter === 'my' ? (isMyProperty || isDraft) : isGeneralPool;
        if (!matchesMain) return false;

        // Filter by Sub Tab
        const matchesSub =
            subFilter === 'all' ||
            (subFilter === 'commercial' ? (COMMERCIAL_PROPERTY_TYPES.includes(prop.propertyType)) :
             subFilter === 'draft' ? prop.status === 'draft' :
             (subFilter === 'sale' ? prop.transactionType === 'forsale' : prop.transactionType === 'rent') && !COMMERCIAL_PROPERTY_TYPES.includes(prop.propertyType) && prop.status !== 'draft');

        // Filter by Rooms
        const matchesRooms = 
            roomsFilter === 'all' ||
            (roomsFilter === '12+' ? (prop.rooms !== undefined && prop.rooms !== null && prop.rooms >= 12) : (prop.rooms?.toString() === roomsFilter));

        return matchesSearch && matchesSub && matchesRooms;
    });

    const sorted = useMemo(() => {
        const items = [...filtered];
        if (sortConfig) {
            items.sort((a, b) => {
                let aVal: any = a[sortConfig.key];
                let bVal: any = b[sortConfig.key];

                if (sortConfig.key === 'createdAt') {
                    const toMs = (ts: any) => {
                        if (!ts) return 0;
                        if (typeof ts.toMillis === 'function') return ts.toMillis();
                        if (ts.seconds != null) return ts.seconds * 1000;
                        if (ts._seconds != null) return ts._seconds * 1000;
                        if (typeof ts === 'number') return ts;
                        return 0;
                    };
                    aVal = toMs(a.createdAt);
                    bVal = toMs(b.createdAt);
                } else if (sortConfig.key === 'price') {
                    aVal = (a.financials as any)?.price ?? (a as any).price ?? 0;
                    bVal = (b.financials as any)?.price ?? (b as any).price ?? 0;
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
            if (p.status === 'draft' || !p.address?.city || !p.address?.fullAddress) return;
            const cityStr = p.address.city.trim().toLowerCase();
            const addrStr = p.address.fullAddress.trim().toLowerCase();
            const roomsStr = p.rooms ? p.rooms.toString() : 'no-rooms';
            const priceStr = p.financials?.price ? p.financials.price.toString() : 'no-price';

            const sig = `${cityStr}|${addrStr}|${roomsStr}|${priceStr}`;
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
    const tabCounts = useMemo(() => {
        const myProps = filteredPropertiesByTime.filter(p => !p.isGlobalCityProperty || p.status === 'draft');
        const generalProps = filteredPropertiesByTime.filter(p => p.isGlobalCityProperty);
        
        const currentMainSet = mainFilter === 'my' ? myProps : generalProps;

        return {
            all: currentMainSet.length,
            sale: currentMainSet.filter(p => p.transactionType === 'forsale' && !COMMERCIAL_PROPERTY_TYPES.includes(p.propertyType) && p.status !== 'draft').length,
            rent: currentMainSet.filter(p => p.transactionType === 'rent' && !COMMERCIAL_PROPERTY_TYPES.includes(p.propertyType) && p.status !== 'draft').length,
            commercial: currentMainSet.filter(p => COMMERCIAL_PROPERTY_TYPES.includes(p.propertyType) && p.status !== 'draft').length,
            draft: currentMainSet.filter(p => p.status === 'draft').length,
            // Global totals for main tabs
            myTotal: myProps.length,
            generalTotal: generalProps.length,
        };
    }, [filteredPropertiesByTime, mainFilter]);

    // Helper functions for Grid View
    const formatPropertyDate = (ts: any): string => {
        const ms = ts?.toDate ? ts.toDate().getTime() : ts?.seconds ? ts.seconds * 1000 : 0;
        if (!ms) return '';
        return new Date(ms).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const getPropertyAgent = (agentId: string) => agents.find((a: AppUser) => a.uid === agentId);

    const getPropertyClient = (propertyId: string) => {
        const relatedDeal = deals.find((d: any) => d.propertyId === propertyId);
        if (!relatedDeal) return null;
        return leads.find((l: Lead) => l.id === relatedDeal.leadId);
    };

    const formatPhoneForWhatsApp = (phone?: string) => {
        if (!phone) return '';
        return phone.replace(/[^\d]/g, '');
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
            let label = 'נכס שהמערכת איתרה';
            const source = (prop.originalSource || '').toLowerCase();
            if (source.includes('yad2')) label = 'יד 2';
            else if (source.includes('madlan')) label = 'מדלן';

            return {
                borderColor: 'border-l-4 border-l-cyan-400',
                iconBg: 'bg-cyan-50',
                iconText: 'text-cyan-600',
                badgeBg: 'bg-cyan-50 border-cyan-200 text-cyan-700',
                badgeText: 'text-cyan-700',
                badgeLabel: label,
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
            {/* Super Admin mode banner */}
            {isSuperAdmin && (
                <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm">
                    <ShieldCheck size={18} className="text-indigo-500 shrink-0" />
                    <span>מצב Super Admin — מציג את כל נכסי המאגר הציבורי מ-{cityCount} ערים</span>
                </div>
            )}

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
                                {/* Create deal from selection — everyone can */}
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
                                {/* Create General Catalog — everyone can */}
                                <button
                                    onClick={() => setShowGeneralCatalogModal(true)}
                                    className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                                >
                                    <Sparkles size={16} />
                                    צור קטלוג כללי ({selectedPropertyIds.size})
                                </button>
                                {/* Bulk delete — admin only */}
                                {!isAgent && (
                                    <button
                                        onClick={handleBulkDelete}
                                        className="inline-flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                                    >
                                        <Trash2 size={16} />
                                        מחק ({selectedPropertyIds.size})
                                    </button>
                                )}
                            </div>
                        )}
                        <button
                            onClick={() => navigate('/dashboard/marketplace')}
                            className="inline-flex items-center gap-2 bg-gradient-to-l from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm"
                        >
                            <Handshake size={16} />
                            כניסה למרקטפלייס
                        </button>
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
                                onClick={() => navigate('/dashboard/marketplace')}
                                className="w-10 h-10 flex items-center justify-center bg-gradient-to-l from-indigo-600 to-purple-600 text-white rounded-full shadow-sm"
                            >
                                <Handshake size={18} />
                            </button>
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

                    {/* Main Tabs (Mobile) */}
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
                        <button
                            onClick={() => setMainFilter('my')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                mainFilter === 'my' 
                                ? 'bg-white text-blue-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Building size={16} />
                            הנכסים שלי
                        </button>
                        <button
                            onClick={() => {
                                if (!features.canAccessSourcing && !isSuperAdmin) {
                                    setShowUpgradeModal(true);
                                    return;
                                }
                                setMainFilter('general');
                                setSubFilter('all');
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                mainFilter === 'general' 
                                ? 'bg-white text-cyan-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Search size={16} />
                            מאגר כללי
                            {!features.canAccessSourcing && (
                                <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-lg border border-amber-200">Pro</span>
                            )}
                        </button>
                    </div>

                    {/* Sub Filter Tabs (Mobile) */}
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x touch-pan-x">
                        {[
                            { key: 'all', label: 'הכל' },
                            { key: 'sale', label: 'למכירה' },
                            { key: 'rent', label: 'להשכרה' },
                            { key: 'commercial', label: 'מסחרי' },
                            ...(mainFilter === 'my' ? [{ key: 'draft', label: 'טיוטות' }] : []),
                        ].map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setSubFilter(key)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap snap-start border ${
                                    subFilter === key 
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                            >
                                {label}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${subFilter === key ? 'bg-white/30 text-white' : 'bg-slate-100 text-slate-500'}`}>
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
                                onClick={() => setShowGeneralCatalogModal(true)}
                                className="p-2 bg-blue-100 text-blue-700 rounded-xl"
                            >
                                <Sparkles size={18} />
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
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg h-9 divide-x divide-slate-200 divide-x-reverse">
                                <div className="flex items-center px-3 gap-2 h-full">
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
                                <div className="flex items-center px-3 h-full">
                                    <select
                                        value={roomsFilter}
                                        onChange={(e) => setRoomsFilter(e.target.value)}
                                        className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="all">חדרים</option>
                                        <option value="1">1</option>
                                        <option value="1.5">1.5</option>
                                        <option value="2">2</option>
                                        <option value="2.5">2.5</option>
                                        <option value="3">3</option>
                                        <option value="3.5">3.5</option>
                                        <option value="4">4</option>
                                        <option value="4.5">4.5</option>
                                        <option value="5">5</option>
                                        <option value="5.5">5.5</option>
                                        <option value="6">6</option>
                                        <option value="6.5">6.5</option>
                                        <option value="7">7</option>
                                        <option value="7.5">7.5</option>
                                        <option value="8">8</option>
                                        <option value="8.5">8.5</option>
                                        <option value="9">9</option>
                                        <option value="9.5">9.5</option>
                                        <option value="10">10</option>
                                        <option value="10.5">10.5</option>
                                        <option value="11">11</option>
                                        <option value="11.5">11.5</option>
                                        <option value="12+">12+</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        {!isMobile && (
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button
                                    onClick={() => setMainFilter('my')}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                        mainFilter === 'my' 
                                        ? 'bg-white shadow-md text-blue-600' 
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                    }`}
                                >
                                    <Building size={16} />
                                    הנכסים שלי
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${mainFilter === 'my' ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                                        {tabCounts.myTotal}
                                    </span>
                                </button>
                                <button
                                    onClick={() => {
                                        if (!features.canAccessSourcing) {
                                            setShowUpgradeModal(true);
                                            return;
                                        }
                                        setMainFilter('general');
                                        setSubFilter('all');
                                    }}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                        mainFilter === 'general' 
                                        ? 'bg-white shadow-md text-cyan-600' 
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                    }`}
                                >
                                    <Search size={16} />
                                    מאגר כללי
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${mainFilter === 'general' ? 'bg-cyan-50 text-cyan-500' : 'bg-slate-200 text-slate-500'}`}>
                                        {tabCounts.generalTotal}
                                    </span>
                                </button>
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
                             <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl h-10 w-full divide-x divide-slate-200 divide-x-reverse">
                                <div className="flex items-center gap-1.5 px-3 flex-1 h-full">
                                    <ArrowUpDown size={14} className="text-slate-400 flex-shrink-0" />
                                    <select
                                        value={`${sortConfig?.key}-${sortConfig?.direction}`}
                                        onChange={(e) => {
                                            const [key, direction] = e.target.value.split('-') as [any, any];
                                            setSortConfig({ key, direction });
                                        }}
                                        className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none appearance-none cursor-pointer w-full"
                                    >
                                        <option value="createdAt-desc">חדש קודם</option>
                                        <option value="createdAt-asc">ישן קודם</option>
                                        <option value="price-asc">מחיר (נמוך לגבוה)</option>
                                        <option value="price-desc">מחיר (גבוה לנמוך)</option>
                                    </select>
                                </div>
                                <div className="flex items-center px-3 flex-1 h-full">
                                    <select
                                        value={roomsFilter}
                                        onChange={(e) => setRoomsFilter(e.target.value)}
                                        className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none appearance-none cursor-pointer w-full"
                                    >
                                        <option value="all">חדרים</option>
                                        <option value="1">1</option>
                                        <option value="1.5">1.5</option>
                                        <option value="2">2</option>
                                        <option value="2.5">2.5</option>
                                        <option value="3">3</option>
                                        <option value="3.5">3.5</option>
                                        <option value="4">4</option>
                                        <option value="4.5">4.5</option>
                                        <option value="5">5</option>
                                        <option value="5.5">5.5</option>
                                        <option value="6">6</option>
                                        <option value="6.5">6.5</option>
                                        <option value="7">7</option>
                                        <option value="7.5">7.5</option>
                                        <option value="8">8</option>
                                        <option value="8.5">8.5</option>
                                        <option value="9">9</option>
                                        <option value="9.5">9.5</option>
                                        <option value="10">10</option>
                                        <option value="10.5">10.5</option>
                                        <option value="11">11</option>
                                        <option value="11.5">11.5</option>
                                        <option value="12+">12+</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                        {!isMobile && (
                            <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                                {[
                                    { key: 'all', label: 'הכל' },
                                    { key: 'sale', label: 'למכירה' },
                                    { key: 'rent', label: 'להשכרה' },
                                    { key: 'commercial', label: 'מסחרי' },
                                    ...(mainFilter === 'my' ? [{ key: 'draft', label: 'טיוטות (WhatsApp)' }] : []),
                                ].map(({ key, label }) => (
                                    <button
                                        key={key}
                                        onClick={() => setSubFilter(key)}
                                        className={'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ' + (subFilter === key ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200')}
                                    >
                                        {label}
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${subFilter === key ? 'bg-white/30 text-white' : 'bg-slate-200 text-slate-500'}`}>
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
                                const agent = getPropertyAgent(prop.management?.assignedAgentId ?? '');
                                const client = getPropertyClient(prop.id);
                                const imgUrl = prop.media?.images?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80';

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
                                                    🔍 נכס שהמערכת איתרה
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
                                                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-md ${prop.status === 'draft' ? 'bg-amber-500/90 text-white' : COMMERCIAL_PROPERTY_TYPES.includes(prop.propertyType) ? 'bg-orange-600/90 text-white' : prop.transactionType === 'forsale' ? 'bg-blue-600/90 text-white' : 'bg-emerald-600/90 text-white'}`}>
                                                    {prop.status === 'draft' ? 'טיוטה (דרוש עריכה)' : COMMERCIAL_PROPERTY_TYPES.includes(prop.propertyType) ? 'מסחרי' : prop.transactionType === 'forsale' ? 'למכירה' : 'להשכרה'}
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
                                                <div className="mb-3">
                                                    {/* Parsed summary row */}
                                                    <div className="flex justify-between items-start mb-1.5">
                                                        <h3 className="font-bold text-base text-amber-700 line-clamp-1">
                                                            {prop.address?.street ? prop.address.street : prop.address?.city || 'כתובת לא ידועה'}
                                                            {prop.address?.city && prop.address?.street ? `, ${prop.address.city}` : ''}
                                                        </h3>
                                                        {prop.financials?.price ? <span className="font-bold text-base text-blue-600">₪{prop.financials.price.toLocaleString()}</span> : null}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mb-2">
                                                        {[prop.address?.neighborhood, prop.rooms ? `${prop.rooms} חד׳` : null, prop.floor != null ? `קומה ${prop.floor}` : null, prop.squareMeters ? `${prop.squareMeters} מ״ר` : null].filter(Boolean).join(' • ')}
                                                    </p>
                                                    {/* AI description or raw message fallback */}
                                                    <p className="text-xs text-slate-600 line-clamp-2 bg-amber-50 p-2 rounded-lg border border-amber-100">
                                                        {prop.management?.descriptions || prop.rawDescription}
                                                    </p>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{prop.address?.fullAddress}</h3>
                                                        <span className="font-bold text-lg text-blue-600">₪{(prop.financials?.price || 0).toLocaleString()}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-500 font-medium mb-2 flex items-center gap-1.5 flex-wrap">
                                                        <Building2 size={14} className="text-slate-400" />
                                                        {prop.address?.city || 'עיר לא צוינה'}
                                                        {` • ${translatePropertyKind(prop.propertyType)}`}
                                                        {prop.rooms ? ` • ${prop.rooms} חדרים` : ''}
                                                        {prop.features?.parkingSpots != null ? ` • ${prop.features.parkingSpots} חניות` : ''}
                                                    </p>
                                                    {prop.createdAt && (
                                                        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                                                            <Calendar size={11} className="text-slate-300 shrink-0" />
                                                            נכנס: {formatPropertyDate(prop.createdAt)}
                                                        </p>
                                                    )}
                                                </>
                                            )}

                                            {/* Contacts Area */}
                                            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 mt-auto">
                                                {/* Agent */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">הסוכן המטפל</p>
                                                    <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                                        <div className="flex items-center gap-2 truncate">
                                                            <div className="w-6 h-6 rounded-full overflow-hidden bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold border border-slate-100 shrink-0">
                                                                {prop.isGlobalCityProperty ? (
                                                                    (agency?.logoUrl || agency?.settings?.logoUrl) ? (
                                                                        <img src={agency.logoUrl || agency?.settings?.logoUrl} alt="Office" className="w-full h-full object-contain" />
                                                                    ) : (
                                                                        <Building size={14} />
                                                                    )
                                                                ) : (
                                                                    agent?.photoURL ? (
                                                                        <img src={agent.photoURL} alt={agent.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        agent?.name ? (
                                                                            <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 font-bold">
                                                                                {agent.name.charAt(0)}
                                                                            </div>
                                                                        ) : (
                                                                            <UserIcon size={14} />
                                                                        )
                                                                    )
                                                                )}
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
                                                                {prop.status === 'draft' ? 'ע' : client?.name ? client.name.charAt(0) : <UserIcon size={14} />}
                                                            </div>
                                                            <span className="text-xs font-semibold text-slate-700 truncate" dir={prop.status === 'draft' && !prop.externalAgentName ? 'ltr' : 'rtl'}>
                                                                {prop.status === 'draft'
                                                                    ? (prop.externalAgentName || prop.externalAgentPhone || 'לא ידוע')
                                                                    : (client?.name || 'לא שויך')}
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
                                                <div className="flex items-center gap-2 w-full">
                                                    {(agency?.officePhone || agency?.billing?.ownerPhone) && (
                                                        <>
                                                            <a
                                                                href={`tel:${agency?.officePhone || agency?.billing?.ownerPhone}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold py-1.5 rounded-lg transition-colors"
                                                                title="התקשר למנהל המשרד"
                                                            >
                                                                <Phone size={13} />
                                                                שיחה
                                                            </a>
                                                            <a
                                                                href={`https://wa.me/${formatPhoneForWhatsApp(agency?.officePhone || agency?.billing?.ownerPhone)}?text=${encodeURIComponent(`היי ${agency?.name || 'מנהל'}, שמי ${leads.find(l => l.id === prop.leadId)?.name || userData?.name || ''}, אשמח לתאם שיחה טלפונית לגבי הנכס ב${prop.address?.fullAddress}`)}`}
                                                                target="_blank" rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold py-1.5 rounded-lg transition-colors"
                                                                title="שלח ווטסאפ למנהל"
                                                            >
                                                                <MessageCircle size={13} />
                                                                ווטסאפ
                                                            </a>
                                                        </>
                                                    )}
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
                                            {!prop.isGlobalCityProperty && prop.status !== 'draft' && prop.collaborationStatus !== 'collaborative' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleShareToMarketplace(prop); }}
                                                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold py-1.5 rounded-lg transition-colors"
                                                    title="שתף למרקטפלייס"
                                                >
                                                    <Building2 size={13} />
                                                    שתף למרקט
                                                </button>
                                            )}
                                            {!prop.readonly && !prop.isGlobalCityProperty && (!isAgent || prop.management?.assignedAgentId === currentUid) && (
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
                                                    href={`https://wa.me/${formatPhoneForWhatsApp(prop.externalAgentPhone)}?text=${encodeURIComponent(`היי, ראיתי את הנכס שפרסמת ב${prop.address?.city || ''} (${prop.rooms || ''} חדרים, ₪${(prop.financials?.price || 0).toLocaleString()}). יש לי לקוח שזה בדיוק מתאים לו. רלוונטי לשת״פ?`)}`}
                                                    target="_blank" rel="noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="p-1.5 bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 border border-slate-200 rounded-lg transition-colors shrink-0"
                                                    title="ווטסאפ סוכן"
                                                >
                                                    <MessageCircle size={14} />
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
                                        {['כתובת', 'סוג', 'מחיר', 'חדרים ושטח', 'חניות', 'בלעדיות', 'סוכן', 'לקוח', 'פעולות'].map((h) => (
                                            <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sorted.map((prop: Property) => {
                                        const agent = getPropertyAgent(prop.management?.assignedAgentId ?? '');
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
                                                                <span className="block text-sm font-semibold text-slate-800">{prop.address?.fullAddress} {prop.address?.city ? `, ${prop.address.city}` : ''}</span>
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
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${prop.transactionType === 'forsale' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                            {prop.transactionType === 'forsale' ? 'למכירה' : 'להשכרה'}
                                                        </span>
                                                        <span className="text-xs font-semibold text-slate-600">
                                                            {translatePropertyKind(prop.propertyType)}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <span className="block text-sm font-bold text-slate-700">₪{(prop.financials?.price || 0).toLocaleString()}</span>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm text-slate-600">
                                                        {prop.rooms ? `${prop.rooms} חדרים` : '-'}
                                                        {prop.squareMeters ? ` • ${prop.squareMeters} מ״ר` : ''}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm text-slate-600">
                                                        {prop.features?.parkingSpots != null ? prop.features.parkingSpots : '-'}
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
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full overflow-hidden bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold border border-slate-100 shrink-0">
                                                            {prop.isGlobalCityProperty ? (
                                                                (agency?.logoUrl || agency?.settings?.logoUrl) ? (
                                                                    <img src={agency.logoUrl || agency?.settings?.logoUrl} alt="Office" className="w-full h-full object-contain" />
                                                                ) : (
                                                                    <Building size={14} />
                                                                )
                                                            ) : (
                                                                agent?.photoURL ? (
                                                                    <img src={agent.photoURL} alt={agent.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    agent?.name ? (
                                                                        <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 font-bold">
                                                                            {agent.name.charAt(0)}
                                                                        </div>
                                                                    ) : (
                                                                        <UserIcon size={14} />
                                                                    )
                                                                )
                                                            )}
                                                        </div>
                                                        <div className="text-sm font-medium text-slate-700">
                                                            {prop.isGlobalCityProperty ? 'מאגר ציבורי' : (agent?.name || 'לא משויך')}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm font-medium text-slate-700">{client?.name || '-'}</div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="flex items-center gap-2">
                                                        {prop.isGlobalCityProperty && (agency?.officePhone || agency?.billing?.ownerPhone) && (
                                                            <>
                                                                <a
                                                                    href={`tel:${agency?.officePhone || agency?.billing?.ownerPhone}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg transition-colors shrink-0"
                                                                    title="התקשר למנהל"
                                                                >
                                                                    <Phone size={14} />
                                                                </a>
                                                                <a
                                                                    href={`https://wa.me/${formatPhoneForWhatsApp(agency?.officePhone || agency?.billing?.ownerPhone)}?text=${encodeURIComponent(`היי ${agency?.name || 'מנהל'}, שמי ${leads.find(l => l.id === prop.leadId)?.name || userData?.name || ''}, אשמח לתאם שיחה טלפונית לגבי הנכס ב${prop.address?.fullAddress}`)}`}
                                                                    target="_blank" rel="noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg transition-colors shrink-0"
                                                                    title="שלח ווטסאפ למנהל"
                                                                >
                                                                    <MessageCircle size={14} />
                                                                </a>
                                                            </>
                                                        )}
                                                        {prop.listingType === 'external' && prop.externalAgentPhone && (
                                                            <a
                                                                href={`https://wa.me/${formatPhoneForWhatsApp(prop.externalAgentPhone)}?text=${encodeURIComponent(`היי, ראיתי את הנכס שפרסמת ב${prop.address?.city || ''} (${prop.rooms || ''} חדרים, ₪${(prop.financials?.price || 0).toLocaleString()}). יש לי לקוח שזה בדיוק מתאים לו. רלוונטי לשת״פ?`)}`}
                                                                target="_blank" rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="bg-emerald-500 hover:bg-emerald-600 shadow-sm text-white px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold shrink-0"
                                                                title="צור קשר בוואטסאפ לשת״פ"
                                                            >
                                                                <MessageCircle size={14} /> שת״פ
                                                            </a>
                                                        )}
                                                        {!prop.readonly && !prop.isGlobalCityProperty && (!isAgent || prop.management?.assignedAgentId === currentUid) && (
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
                                                        {!prop.isGlobalCityProperty && prop.status !== 'draft' && prop.collaborationStatus !== 'collaborative' && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleShareToMarketplace(prop); }}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
                                                                title="שתף למרקטפלייס"
                                                            >
                                                                <Building2 size={16} />
                                                            </button>
                                                        )}
                                                        {!prop.readonly && !prop.isGlobalCityProperty && (!isAgent || prop.management?.assignedAgentId === currentUid) && (
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (window.confirm('האם אתה בטוח שברצונך למחוק את הנכס?')) {
                                                                        try {
                                                                            setToast('מוחק נכס...');
                                                                            await deleteProperty(prop.id);
                                                                            setToast('נכס נמחק בהצלחה');
                                                                        } catch (err: any) {
                                                                            console.error('Failed to delete property', err);
                                                                            alert(err.message || 'שגיאה במחיקת הנכס. נסה שוב.');
                                                                        } finally {
                                                                            setTimeout(() => setToast(''), 3000);
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
                    agency={agency}
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

            <UpgradeModal 
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                featureName="מאגר הנכסים הציבורי"
            />

            {showGeneralCatalogModal && (
                <GeneralCatalogModal
                    selectedProperties={properties.filter(p => selectedPropertyIds.has(p.id))}
                    onClose={() => setShowGeneralCatalogModal(false)}
                    onSuccess={() => {
                        setSelectedPropertyIds(new Set());
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
