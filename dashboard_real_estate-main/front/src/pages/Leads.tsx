import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, MessageCircle, MapPin, RefreshCw, ArrowUpDown, ChevronUp, ChevronDown, Upload, Trash2, MessageSquare, Pencil, Home, MoreVertical, Phone, Users, Sparkles, Handshake, PhoneIncoming } from 'lucide-react';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAgents } from '../hooks/useFirestoreData';
import { useAuth } from '../context/AuthContext';
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
import { Lead, Property, TimeRange, CallLog } from '../types';
import { deleteLead, updateLead } from '../services/leadService';
import { getLiveMissedCalls } from '../services/callLogService';

const statusColors: Record<string, string> = {
  new: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
  contacted: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  meeting_set: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  won: 'bg-green-500/10 text-green-400 border border-green-500/20',
  lost: 'bg-slate-700/50 text-slate-400 border border-slate-600',
  import: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
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
  const { userData } = useAuth();
  const isAgent = userData?.role === 'agent';
  const isAdmin = userData?.role === 'admin';
  const currentUid = userData?.uid;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [activeTab, setActiveTab] = useState<'buyer' | 'seller'>('buyer');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });
  const isMobile = useMediaQuery('(max-width: 768px)');
  const navigate = useNavigate();

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
  const [missedCallsToday, setMissedCallsToday] = useState(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBulkWhatsAppModalOpen, setIsBulkWhatsAppModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const location = useLocation();


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

  // Missed calls subscription for KPI card
  useEffect(() => {
    if (!userData?.agencyId) return;
    const unsub = getLiveMissedCalls(userData.agencyId, (logs: CallLog[]) => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = logs.filter((l) => {
        const d = (l.createdAt as any)?.toDate?.();
        return d && d >= todayStart;
      }).length;
      setMissedCallsToday(todayCount);
    });
    return () => unsub();
  }, [userData?.agencyId]);

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
    <div className="relative min-h-screen pb-24 md:pb-8" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 px-4 md:px-0 pt-6">
        <div className="relative">
          <div className="absolute -right-4 top-0 w-1 h-12 bg-blue-600 rounded-full blur-sm opacity-50 hidden md:block" />
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            ניהול לידים
            <span className="text-xs font-bold px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 shadow-sm">
              BETA
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">ניהול ומעקב אחר לקוחות פוטנציאליים ושליחת קטלוגים</p>
        </div>

        {/* Desktop actions replaced by relocated buttons below */}

      </div>

      <div className="px-4 md:px-0">
        {/* Search and Filters Card */}
        <div className="bg-[#0f172a]/80 backdrop-blur-md p-5 rounded-[2rem] shadow-xl border border-slate-800 mb-8">
          <div className="flex flex-col gap-6">
            <div className="relative group">
              <Search size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם, טלפון או נכס..."
                className="w-full pr-12 pl-4 py-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-base font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-right shadow-inner text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex overflow-x-auto pb-1 -mb-1 scrollbar-hide gap-3 px-1 snap-x touch-pan-x">
               <button
                onClick={() => setFilter('All')}
                className={`flex-shrink-0 px-6 py-2.5 rounded-xl text-xs font-black transition-all snap-start shadow-sm border-2 ${filter === 'All' ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200' : 'bg-white text-slate-500 border-slate-50 hover:border-slate-200 hover:text-slate-700'}`}
              >
                הכל
              </button>
               {['new', 'contacted', 'meeting_set', 'won', 'lost'].map((f) => (
                <button
                  key={f}
                  onClick={(e) => { e.stopPropagation(); setFilter(f); }}
                  className={`px-5 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all border snap-start ${
                    filter === f
                      ? 'bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/25 scale-105'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {statusLabels[f] || f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        {/* KPI Cards and Actions */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8 items-stretch" dir="rtl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">

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
          <KpiCard
            title="שיחות שלא נענו"
            value={missedCallsToday.toString()}
            rawValue={missedCallsToday}
            target={0}
            change={missedCallsToday > 0 ? `${missedCallsToday} היום` : 'הכל תואם'}
            positive={missedCallsToday === 0}
            subtitle="שיחות נכנסות שלא נענו היום"
            icon="Phone"
            color="red"
          />
          </div>

          {/* Action Buttons Aligned with KPI +10% line */}
          <div className="flex lg:flex-col items-center lg:items-stretch justify-between lg:justify-start gap-3 lg:w-[220px] pt-4 lg:pt-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-3.5 bg-slate-800/50 border border-slate-700 text-slate-300 rounded-2xl hover:bg-slate-800 hover:text-white transition-all font-bold shadow-lg"
            >
              <Upload size={18} className="text-slate-400" />
              ייבוא לידים
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl transition-all font-black shadow-xl shadow-blue-500/20 active:scale-95 group"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              ליד חדש
            </button>
            <button
              onClick={() => navigate('/dashboard/marketplace')}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-2xl transition-all font-black shadow-xl shadow-indigo-500/20 active:scale-95 group"
            >
              <Handshake size={20} className="group-hover:rotate-12 transition-transform duration-300" />
              כניסה למרקטפלייס
            </button>

            {selectedLeadIds.size > 0 && (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right duration-300">
                <button
                  onClick={handleBroadcast}
                  className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-5 py-3.5 rounded-2xl font-bold hover:bg-emerald-500/20 transition-all shadow-lg"
                >
                  <MessageCircle size={18} />
                  <span>וואטסאפ ({selectedLeadIds.size})</span>
                </button>
                {/* Bulk delete: admin only */}
                {!isAgent && (
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
                    className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 px-5 py-3.5 rounded-2xl font-bold hover:bg-red-500/20 transition-all shadow-lg"
                  >
                    <Trash2 size={18} />
                    <span>מחק ({selectedLeadIds.size})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {isAdmin && <PendingLeadsInbox />}

        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl shadow-xl border border-slate-800 overflow-hidden mt-6">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-900/50 p-1.5">
            <div className="flex bg-slate-800/80 p-1.5 rounded-[1.25rem] w-full md:w-fit border border-slate-700/50">
            <button
              onClick={() => setActiveTab('buyer')}
              className={`flex items-center gap-2.5 px-8 py-2.5 rounded-xl text-sm font-black transition-all ${
                activeTab === 'buyer'
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users size={16} />
              רוכשים
            </button>
            <button
              onClick={() => setActiveTab('seller')}
              className={`flex items-center gap-2.5 px-8 py-2.5 rounded-xl text-sm font-black transition-all ${
                activeTab === 'seller'
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home size={16} />
              מוכרים
            </button>
          </div>
          </div>

          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/30">
             {/* Time actions */}
            <div className="flex bg-slate-800/50 border border-slate-700 p-1 rounded-xl shadow-inner">
                <button
                  onClick={() => handleRangeChange('1m')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${timeRange === '1m' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}
                >
                  חודש
                </button>
                <button
                  onClick={() => handleRangeChange('3m')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${timeRange === '3m' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}
                >
                  רבעון
                </button>
                <button
                  onClick={() => handleRangeChange('all')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${timeRange === 'all' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-400'}`}
                >
                  הכל
                </button>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-10 h-10 flex items-center justify-center bg-slate-800/50 border border-slate-700 text-slate-400 rounded-xl hover:bg-slate-750 hover:text-slate-200 transition-colors shadow-sm shrink-0"
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin text-blue-400" : ""} />
            </button>
          </div>

          {/* List Area */}
          {!isMobile ? (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 border-b border-slate-700 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={processedLeads.length > 0 && selectedLeadIds.size === processedLeads.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide border-b border-slate-700">איש קשר</th>
                    <th
                      className="px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide border-b border-slate-700 cursor-pointer group"
                      onClick={() => handleSort('potentialValue')}
                    >
                      <div className="flex items-center gap-1.5">
                        {activeTab === 'buyer' ? 'מתעניין ב...' : 'כתובת ומחיר'}
                        <SortIcon column="potentialValue" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide border-b border-slate-700">סוכן מטפל</th>
                    <th
                      className="px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide border-b border-slate-700 cursor-pointer group"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-1.5">
                        סטטוס
                        <SortIcon column="status" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide border-b border-slate-700 cursor-pointer group"
                      onClick={() => handleSort('createdAt')}
                    >
                      <div className="flex items-center gap-1.5">
                        נוצר ב-
                        <SortIcon column="createdAt" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide border-b border-slate-700">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
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
                        className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                        onClick={() => setProfileLeadId(lead.id)}
                      >
                        <td className="px-4 py-4 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.has(lead.id)}
                            onChange={() => handleSelectRow(lead.id)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center text-sm font-bold text-blue-400 flex-shrink-0 border border-blue-500/20">
                              {lead.name.charAt(0)}
                            </div>
                            <div>
                              <span className="block text-sm font-black text-white flex items-center gap-1">
                                {lead.name}
                                {(lead.callCount ?? 0) > 0 && <PhoneIncoming size={11} className="text-blue-400 flex-shrink-0" />}
                              </span>
                              <span className="block text-xs text-slate-500 mt-0.5 font-medium" dir="ltr">{lead.phone}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-1">
                            {activeTab === 'buyer' ? (
                              <>
                                {lead.requirements?.desiredCity && lead.requirements.desiredCity.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800/50 rounded px-2 py-0.5 border border-slate-700/50">
                                    <MapPin size={10} />
                                    {lead.requirements.desiredCity.join(', ')}
                                  </span>
                                )}
                                {lead.requirements?.maxBudget && (
                                  <span className="block text-xs font-bold text-slate-300">עד ₪{lead.requirements.maxBudget.toLocaleString()}</span>
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
                                        className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-lg transition-colors border border-blue-500/20"
                                      >
                                        <Home size={12} className="text-blue-400" />
                                        <span className="font-bold truncate max-w-[150px]">{sellerProperty.address?.fullAddress}</span>
                                      </button>
                                    );
                                  }
                                  return (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setAddingPropertyForLeadId(lead.id); }}
                                      className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/50 hover:bg-slate-800 px-2.5 py-1 rounded-lg transition-colors border border-slate-700"
                                    >
                                      <Plus size={12} />
                                      <span className="font-bold">שייך נכס</span>
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
                                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 flex-shrink-0 border border-slate-700">
                                  {agent.name.charAt(0)}
                                </div>
                                <span className="text-sm font-bold text-slate-300">{agent.name}</span>
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
                             {activeTab === 'buyer' && (
                               <button
                                 onClick={(e) => { e.stopPropagation(); setMatchingLead(lead); }}
                                 className="p-1.5 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-50 transition-all hover:scale-110"
                                 title="התאמה חכמה"
                               >
                                 <Sparkles size={18} fill="currentColor" fillOpacity={0.1} />
                               </button>
                             )}
                             
                             {/* Share to MLS Quick Action */}
                             {(!isAgent || lead.assignedAgentId === currentUid) && lead.collaborationStatus !== 'collaborative' && (
                               <button
                                 onClick={async (e) => { 
                                   e.stopPropagation(); 
                                   try {
                                     await updateLead(lead.id, {
                                       collaborationStatus: 'collaborative',
                                       collaborationTerms: 'חצי-חצי בעמלות',
                                       collaborationAgentName: userData?.displayName || 'סוכן מהמשרד'
                                     } as any);
                                     setToast({ show: true, message: 'הליד פורסם למרקטפלייס בהצלחה!', type: 'success' });
                                   } catch (err) {
                                     setToast({ show: true, message: 'שגיאה בפרסום למרקטפלייס', type: 'error' });
                                   }
                                 }}
                                 className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all hover:scale-110"
                                 title="הכנס דרישות למרקט פלייס"
                               >
                                 <Handshake size={18} />
                               </button>
                             )}
                             {lead.phone && (
                              <a
                                href={`https://wa.me/${lead.phone.replace(/^0/, '972').replace(/[^\d]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all hover:scale-110"
                                title="שלח וואטסאפ"
                              >
                                <MessageSquare size={18} />
                              </a>
                            )}
                             {/* Edit — only for admin or assigned agent */}
                             {(!isAgent || lead.assignedAgentId === currentUid) && (
                               <button
                                 onClick={(e) => { e.stopPropagation(); setEditingLead(lead); }}
                                 className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all hover:scale-110"
                                 title="ערוך ליד"
                               >
                                 <Pencil size={18} />
                               </button>
                             )}
                             {/* Delete — only for admin or assigned agent */}
                             {(!isAgent || lead.assignedAgentId === currentUid) && (
                               <button
                                 onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                                 className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all hover:scale-110"
                                 title="מחק ליד"
                               >
                                 <Trash2 size={18} />
                               </button>
                             )}
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
             <div className="divide-y divide-slate-800">
              {processedLeads.length === 0 ? (
                <div className="px-4 py-12 text-center text-slate-400 text-sm">לא נמצאו לקוחות.</div>
              ) : (
                processedLeads.map((lead) => (
                   <div
                    key={lead.id}
                    onClick={() => setProfileLeadId(lead.id)}
                    className="p-5 hover:bg-slate-800/30 transition-colors active:bg-slate-800"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                         <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-lg font-black text-blue-400 border-2 border-blue-500/20 shadow-sm shrink-0">
                          {lead.name.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-black text-white text-base truncate">{lead.name}</h3>
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

                     <div className="flex flex-col gap-3 py-4 border-y border-slate-800/50 text-sm text-slate-400">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shadow-sm border border-blue-500/20">
                          <Phone size={14} />
                        </div>
                        <span dir="ltr" className="font-bold text-slate-300">{lead.phone}</span>
                      </div>
                       <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400 shadow-sm border border-orange-500/20">
                          <Search size={14} />
                        </div>
                        <span className="text-slate-400 font-medium truncate">
                          {activeTab === 'buyer' 
                            ? `${lead.requirements?.desiredCity?.join(', ') || 'כל עיר'} • עד ₪${lead.requirements?.maxBudget?.toLocaleString() || 'לא צוין'}`
                            : properties?.find(p => p.leadId === lead.id)?.address?.fullAddress || 'אין נכס משוייך'
                          }
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3">
                      <div className="flex gap-3">
                         {activeTab === 'buyer' && (
                           <button 
                            onClick={(e) => { e.stopPropagation(); setMatchingLead(lead); }}
                            className="flex-1 bg-amber-500 text-white py-3.5 rounded-2xl text-center font-black text-xs hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                           >
                            <Sparkles size={16} fill="white" />
                            התאמה חכמה
                           </button>
                         )}
                         {lead.phone && (
                          <a 
                            href={`https://wa.me/${lead.phone.replace(/^0/, '972').replace(/[^\d]/g, '')}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 bg-emerald-500 text-white py-3.5 rounded-2xl text-center font-black text-xs hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
                          >
                            <MessageSquare size={16} />
                            וואטסאפ
                          </a>
                        )}
                      </div>
                       <button 
                        onClick={(e) => { e.stopPropagation(); setProfileLeadId(lead.id); }}
                        className="w-full bg-slate-800/50 border-2 border-slate-700 text-slate-300 py-3.5 rounded-2xl text-center font-black text-xs hover:bg-slate-800 transition-all shadow-sm"
                      >
                        פרטים מלאים לעריכה
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

           <div className="px-4 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/30">
            <p className="text-xs text-slate-500">מציג <span className="font-bold text-slate-400">{processedLeads.length}</span> לקוחות</p>
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
