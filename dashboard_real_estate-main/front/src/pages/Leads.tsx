import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, MessageCircle, MapPin, RefreshCw, ArrowUpDown, ChevronUp, ChevronDown, Upload, Trash2, MessageSquare, Pencil, Home, MoreVertical, Phone, Users } from 'lucide-react';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAgents } from '../hooks/useFirestoreData';
import { useSearchParams } from 'react-router-dom';
import { useMediaQuery } from '../hooks/useMediaQuery';
import PropertyMatcherModal from '../components/leads/PropertyMatcherModal';
import LeadProfilePanel from '../components/leads/LeadProfilePanel';
import AddLeadModal from '../components/modals/AddLeadModal';
import EditLeadModal from '../components/modals/EditLeadModal';
import AddPropertyModal from '../components/modals/AddPropertyModal';
import ImportModal from '../components/modals/ImportModal';
import BulkWhatsAppModal from '../components/modals/BulkWhatsAppModal';
import PropertyDetailsModal from '../components/modals/PropertyDetailsModal';
import PendingLeadsInbox from '../components/leads/PendingLeadsInbox';
import KpiCard from '../components/dashboard/KpiCard';
import { Toast, ToastState } from '../components/ui/Toast';
import { Lead, Property, TimeRange } from '../types';
import { deleteLead } from '../services/leadService';

const statusColors: Record<string, string> = {
  new: 'bg-sky-50 text-sky-600 border border-sky-100',
  contacted: 'bg-amber-50 text-amber-600 border border-amber-100',
  meeting_set: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  won: 'bg-green-50 text-green-600 border border-green-100',
  lost: 'bg-slate-50 text-slate-600 border border-slate-200',
  import: 'bg-sky-50 text-sky-600 border border-sky-100',
};

const statusLabels: Record<string, string> = {
  All: 'הכל',
  new: 'חדש',
  contacted: 'בטיפול',
  meeting_set: 'נקבעה פגישה',
  won: 'נסגר הדיל',
  lost: 'אבוד / לא רלוונטי',
  import: 'חדש (ייבוא)',
};

type SortConfig = {
  key: keyof Lead | 'potentialValue' | 'createdAt';
  direction: 'asc' | 'desc';
} | null;

export default function Leads() {
  const { leads = [], properties = [], loading } = useLiveDashboardData();
  const { data: agents } = useAgents();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [activeTab, setActiveTab] = useState<'buyer' | 'seller'>('buyer');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [searchParams, setSearchParams] = useSearchParams();
  const rawRange = searchParams.get('range') as TimeRange | null;
  const [timeRange, setTimeRange] = useState<TimeRange | 'all'>(rawRange || 'all');

  useEffect(() => {
    if (rawRange) {
      setTimeRange(rawRange);
    }
  }, [rawRange]);

  const handleRangeChange = (newRange: TimeRange | 'all') => {
    setTimeRange(newRange);
    if (newRange === 'all') {
      searchParams.delete('range');
    } else {
      searchParams.set('range', newRange);
    }
    setSearchParams(searchParams);
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

  const filteredLeadsByTime = useMemo(() => filterByTimeRange(leads, timeRange), [leads, timeRange]);

  // Multi-selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [matchingLead, setMatchingLead] = useState<Lead | null>(null);
  const [profileLeadId, setProfileLeadId] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [addingPropertyForLeadId, setAddingPropertyForLeadId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBulkWhatsAppModalOpen, setIsBulkWhatsAppModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.openId && leads.length > 0) {
      const targetLead = leads.find(l => l.id === location.state.openId);
      if (targetLead && profileLeadId !== targetLead.id) {
        setProfileLeadId(targetLead.id);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, leads, profileLeadId, navigate, location.pathname]);

  const profileLead = useMemo(() => {
    if (!profileLeadId) return null;
    return leads.find(l => l.id === profileLeadId) || null;
  }, [profileLeadId, leads]);

  const handleSort = (key: any) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const processedLeads = useMemo(() => {
    let filtered = filteredLeadsByTime.filter((lead) => {
      const type = lead.type || 'buyer';
      if (type !== activeTab) return false;

      const matchesSearch =
        lead.name.toLowerCase().includes(search.toLowerCase()) ||
        lead.phone?.includes(search);
      const matchesFilter = filter === 'All' || lead.status === filter;
      return matchesSearch && matchesFilter;
    });

    if (sortConfig) {
      filtered.sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof Lead];
        let bVal: any = b[sortConfig.key as keyof Lead];

        // Custom handlers
        if (sortConfig.key === 'potentialValue') {
          aVal = a.requirements?.maxBudget || 0;
          bVal = b.requirements?.maxBudget || 0;
        } else if (sortConfig.key === 'createdAt') {
          aVal = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
          bVal = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
        } else if (sortConfig.key === 'status') {
          aVal = a.status || '';
          bVal = b.status || '';
        } else {
          aVal = a[sortConfig.key as keyof Lead] || '';
          bVal = b[sortConfig.key as keyof Lead] || '';
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [filteredLeadsByTime, search, filter, activeTab, sortConfig]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLeadIds(new Set(processedLeads.map(l => l.id)));
    } else {
      setSelectedLeadIds(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBroadcast = () => {
    setIsBulkWhatsAppModalOpen(true);
  };

  const handleBulkWhatsAppSuccess = () => {
    setToast({ show: true, message: 'הודעות ווטסאפ נשלחו בהצלחה', type: 'success' });
    setSelectedLeadIds(new Set());
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setToast({ show: true, message: 'הנתונים רעננו בהצלחה', type: 'success' });
    }, 600);
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את הליד? הפעולה אינה הפיכה.')) return;
    try {
      await deleteLead(leadId);
      setToast({ show: true, message: 'הליד נמחק בהצלחה', type: 'success' });
    } catch (err) {
      console.error('Failed to delete lead:', err);
      setToast({ show: true, message: 'שגיאה במחיקת הליד', type: 'error' });
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  return (
    <div className="relative min-h-screen pb-24 md:pb-8 bg-slate-50/50" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 px-4 md:px-0 pt-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ניהול לידים</h1>
          <p className="text-slate-500 text-sm mt-1">ניהול ומעקב אחר לקוחות פוטנציאליים</p>
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all font-semibold shadow-sm"
          >
            <Upload size={18} className="text-slate-400" />
            ייבוא לידים
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-500/20"
          >
            <Plus size={20} />
            ליד חדש
          </button>
        </div>

        {/* Selected Items Bulk Actions */}
        {selectedLeadIds.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap px-1">
             <button
                onClick={handleBroadcast}
                className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm animate-in fade-in zoom-in duration-200"
              >
                <MessageCircle size={16} />
                <span>וואטסאפ ({selectedLeadIds.size})</span>
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm(`למחוק ${selectedLeadIds.size} לידים? הפעולה אינה הפיכה.`)) return;
                  const count = selectedLeadIds.size;
                  try {
                    await Promise.all([...selectedLeadIds].map(id => deleteLead(id)));
                    setSelectedLeadIds(new Set());
                    setToast({ show: true, message: `${count} לידים נמחקו`, type: 'success' });
                  } catch {
                    setToast({ show: true, message: 'שגיאה במחיקה', type: 'error' });
                  }
                }}
                className="inline-flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm animate-in fade-in zoom-in duration-200"
              >
                <Trash2 size={16} />
                <span>מחק ({selectedLeadIds.size})</span>
              </button>
          </div>
        )}
      </div>

      <div className="px-4 md:px-0">
        {/* Search and Filters Card */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם, טלפון או נכס..."
                className="w-full pr-10 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-right"
              />
            </div>

            <div className="flex overflow-x-auto pb-2 -mb-2 scrollbar-hide gap-2 px-1 snap-x touch-pan-x">
               <button
                onClick={() => setFilter('All')}
                className={`flex-shrink-0 px-5 py-2 rounded-full text-xs font-bold transition-all snap-start shadow-sm border ${filter === 'All' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                הכל
              </button>
               {['new', 'contacted', 'meeting_set', 'won', 'lost'].map((f) => (
                <button
                  key={f}
                  onClick={(e) => { e.stopPropagation(); setFilter(f); }}
                  className={`flex-shrink-0 whitespace-nowrap px-5 py-2 rounded-full border text-xs font-bold transition-all snap-start shadow-sm ${
                    filter === f
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {statusLabels[f] || f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" dir="rtl">
          <KpiCard
            title="סה״כ לידים פעילים"
            value={filteredLeadsByTime.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length.toString()}
            rawValue={filteredLeadsByTime.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length}
            target={50}
            change="+10%"
            positive={true}
            subtitle={timeRange === 'all' ? "לידים חמים (כל הזמן)" : `לידים חמים (${timeRange})`}
            icon="Users"
            color="blue"
          />
          <KpiCard
            title="סיכום פגישות"
            value={filteredLeadsByTime.filter(l => l.status === 'meeting_set').length.toString()}
            rawValue={filteredLeadsByTime.filter(l => l.status === 'meeting_set').length}
            target={20}
            change="+5%"
            positive={true}
            subtitle="פגישות שנקבעו"
            icon="Calendar"
            color="purple"
          />
        </div>

        <PendingLeadsInbox />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-6">
          {/* Tabs */}
          <div className="flex border-b border-slate-100 bg-slate-50/10 p-1.5">
            <button
              onClick={() => { setActiveTab('buyer'); setSelectedLeadIds(new Set()); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'buyer' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:bg-slate-100/50'}`}
            >
               <Users size={16} />
               רוכשים ({filteredLeadsByTime.filter(l => l.type === 'buyer').length || 0})
            </button>
            <button
              onClick={() => { setActiveTab('seller'); setSelectedLeadIds(new Set()); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'seller' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:bg-slate-100/50'}`}
            >
               <Home size={16} />
               מוכרים ({filteredLeadsByTime.filter(l => l.type === 'seller').length || 0})
            </button>
          </div>

          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
             {/* Time actions */}
            <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm">
                <button
                  onClick={() => handleRangeChange('1m')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${timeRange === '1m' ? 'bg-blue-50 text-blue-600' : 'text-slate-500'}`}
                >
                  חודש
                </button>
                <button
                  onClick={() => handleRangeChange('3m')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${timeRange === '3m' ? 'bg-blue-50 text-blue-600' : 'text-slate-500'}`}
                >
                  רבעון
                </button>
                <button
                  onClick={() => handleRangeChange('all')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${timeRange === 'all' ? 'bg-blue-50 text-blue-600' : 'text-slate-500'}`}
                >
                  הכל
                </button>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0"
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin text-blue-600" : ""} />
            </button>
          </div>

          {/* List Area */}
          {!isMobile ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50/50">
                  <tr>
                    <th className="px-4 py-3 border-b border-slate-100 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={processedLeads.length > 0 && selectedLeadIds.size === processedLeads.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">איש קשר</th>
                    <th
                      className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 cursor-pointer group"
                      onClick={() => handleSort('potentialValue')}
                    >
                      <div className="flex items-center gap-1.5">
                        {activeTab === 'buyer' ? 'מתעניין ב...' : 'כתובת ומחיר'}
                        <SortIcon column="potentialValue" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">סוכן מטפל</th>
                    <th
                      className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 cursor-pointer group"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-1.5">
                        סטטוס
                        <SortIcon column="status" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 cursor-pointer group"
                      onClick={() => handleSort('createdAt')}
                    >
                      <div className="flex items-center gap-1.5">
                        נוצר ב-
                        <SortIcon column="createdAt" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">טוען נתונים...</td>
                    </tr>
                  ) : processedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">לא נמצאו לקוחות התואמים את החיפוש.</td>
                    </tr>
                  ) : (
                    processedLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        onClick={() => setProfileLeadId(lead.id)}
                      >
                        <td className="px-4 py-4 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.has(lead.id)}
                            onChange={() => handleSelectRow(lead.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 flex-shrink-0">
                              {lead.name.charAt(0)}
                            </div>
                            <div>
                              <span className="block text-sm font-semibold text-slate-800">{lead.name}</span>
                              <span className="block text-xs text-slate-500 mt-0.5" dir="ltr">{lead.phone}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-1">
                            {activeTab === 'buyer' ? (
                              <>
                                {lead.requirements?.desiredCity && lead.requirements.desiredCity.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 rounded px-2 py-0.5">
                                    <MapPin size={10} />
                                    {lead.requirements.desiredCity.join(', ')}
                                  </span>
                                )}
                                {lead.requirements?.maxBudget && (
                                  <span className="block text-xs font-medium text-slate-700">עד ₪{lead.requirements.maxBudget.toLocaleString()}</span>
                                )}
                              </>
                            ) : (
                              <>
                                {(() => {
                                  const sellerProperty = properties.find(p => p.leadId === lead.id);
                                  if (sellerProperty) {
                                    return (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedProperty(sellerProperty); }}
                                        className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors border border-blue-100"
                                      >
                                        <Home size={12} className="text-blue-500" />
                                        <span className="font-semibold truncate max-w-[150px]">{sellerProperty.address}</span>
                                      </button>
                                    );
                                  }
                                  return (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setAddingPropertyForLeadId(lead.id); }}
                                      className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors border border-slate-200"
                                    >
                                      <Plus size={12} />
                                      <span className="font-semibold">שייך נכס</span>
                                    </button>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {(() => {
                            const agent = agents?.find(a => a.uid === lead.assignedAgentId || a.id === lead.assignedAgentId);
                            return agent ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                                  {agent.name.charAt(0)}
                                </div>
                                <span className="text-sm font-medium text-slate-700">{agent.name}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">טרם שויך</span>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-4">
                          <span className={'inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ' + (statusColors[lead.status] || statusColors.new)}>
                            {statusLabels[lead.status] || lead.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs text-slate-500">{lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString('he-IL') : new Date(lead.createdAt).toLocaleDateString('he-IL')}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                             {lead.phone && (
                              <a
                                href={`https://wa.me/${lead.phone.replace(/^0/, '972').replace(/[^\d]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                              >
                                <MessageSquare size={16} />
                              </a>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingLead(lead); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {processedLeads.length === 0 ? (
                <div className="px-4 py-12 text-center text-slate-400 text-sm">לא נמצאו לקוחות.</div>
              ) : (
                processedLeads.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => setProfileLeadId(lead.id)}
                    className="p-5 hover:bg-slate-50/50 transition-colors active:bg-slate-100"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700 border-2 border-white shadow-sm shrink-0">
                          {lead.name.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-bold text-slate-900 text-base truncate">{lead.name}</h3>
                          <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 uppercase tracking-tight border border-blue-100">
                            {statusLabels[lead.status] || lead.status}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingLead(lead); }}
                        className="text-slate-300 hover:text-slate-500 p-1.5 hover:bg-slate-100 rounded-full transition-colors"
                      >
                        <MoreVertical size={20} />
                      </button>
                    </div>

                    <div className="flex flex-col gap-3 py-4 border-y border-slate-50 text-sm text-slate-600">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 shadow-sm border border-blue-100/50">
                          <Phone size={14} />
                        </div>
                        <span dir="ltr" className="font-bold text-slate-700">{lead.phone}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500 shadow-sm border border-orange-100/50">
                          <Search size={14} />
                        </div>
                        <span className="text-slate-600 font-medium truncate">
                          {activeTab === 'buyer' 
                            ? `${lead.requirements?.desiredCity?.join(', ') || 'כל עיר'} • עד ₪${lead.requirements?.maxBudget?.toLocaleString() || 'לא צוין'}`
                            : properties?.find(p => p.leadId === lead.id)?.address || 'אין נכס משוייך'
                          }
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      {lead.phone && (
                        <a 
                          href={`https://wa.me/${lead.phone.replace(/^0/, '972').replace(/[^\d]/g, '')}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-emerald-500 text-white py-3 rounded-2xl text-center font-bold text-xs hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
                        >
                          <MessageSquare size={16} />
                          שלח וואטסאפ
                        </a>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setProfileLeadId(lead.id); }}
                        className="flex-1 bg-white border border-slate-200 text-slate-700 py-3 rounded-2xl text-center font-bold text-xs hover:bg-slate-50 transition-all shadow-sm"
                      >
                        פרטים מלאים
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="px-4 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/20">
            <p className="text-xs text-slate-400">מציג <span className="font-bold text-slate-600">{processedLeads.length}</span> לקוחות</p>
          </div>
        </div>
      </div>

      <AddLeadModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} defaultEntityType="lead" />
      <BulkWhatsAppModal
        isOpen={isBulkWhatsAppModalOpen}
        onClose={() => setIsBulkWhatsAppModalOpen(false)}
        selectedLeads={processedLeads.filter(l => selectedLeadIds.has(l.id))}
        onSuccess={handleBulkWhatsAppSuccess}
      />
      
      {matchingLead && <PropertyMatcherModal lead={matchingLead} allProperties={properties} onClose={() => setMatchingLead(null)} />}

      {profileLead && (
        <LeadProfilePanel
          lead={profileLead}
          agents={agents || []}
          onClose={() => setProfileLeadId(null)}
          onUpdated={(msg) => {
            setToast({ show: true, message: msg, type: 'success' });
          }}
        />
      )}
      {addingPropertyForLeadId && (
        <AddPropertyModal
          isOpen={true}
          onClose={() => setAddingPropertyForLeadId(null)}
          leadId={addingPropertyForLeadId ?? undefined}
        />
      )}
      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          isOpen={true}
          onClose={() => setEditingLead(null)}
          onSuccess={(msg) => {
            setEditingLead(null);
            setToast({ show: true, message: msg, type: 'success' });
          }}
        />
      )}
      {selectedProperty && (
        <PropertyDetailsModal
          property={selectedProperty}
          agents={agents || []}
          leads={leads}
          onClose={() => setSelectedProperty(null)}
        />
      )}
      
      {/* Floating Action Button for Mobile */}
      {isMobile && (
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="fixed bottom-24 right-6 z-[60] bg-blue-600 hover:bg-blue-700 text-white w-16 h-16 rounded-full shadow-lg shadow-blue-500/40 flex items-center justify-center transition-all active:scale-95 border-2 border-white/20"
          title="הוסף ליד חדש"
        >
          <Plus size={32} strokeWidth={2.5} />
        </button>
      )}

      <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast(prev => ({ ...prev, show: false }))} />
    </div>
  );
}
