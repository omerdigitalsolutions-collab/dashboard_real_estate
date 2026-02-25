import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, MessageCircle, MapPin, Sparkles, RefreshCw, Car, MoveUp, Sun, Shield, Users, TrendingUp, BarChart3, ArrowUpDown, ChevronUp, ChevronDown, Upload, Trash2, UserCircle2, MessageSquare, Pencil } from 'lucide-react';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAgents } from '../hooks/useFirestoreData';
import PropertyMatcherModal from '../components/leads/PropertyMatcherModal';
import LeadProfilePanel from '../components/leads/LeadProfilePanel';
import AddLeadModal from '../components/modals/AddLeadModal';
import EditLeadModal from '../components/modals/EditLeadModal';
import ImportModal from '../components/modals/ImportModal';
import BulkWhatsAppModal from '../components/modals/BulkWhatsAppModal';
import { Toast, ToastState } from '../components/ui/Toast';
import { Lead } from '../types';
import { deleteLead } from '../services/leadService';

const statusColors: Record<string, string> = {
  new: 'bg-sky-50 text-sky-600 border border-sky-100',
  contacted: 'bg-amber-50 text-amber-600 border border-amber-100',
  meeting_set: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  won: 'bg-green-50 text-green-600 border border-green-100',
  lost: 'bg-slate-50 text-slate-600 border border-slate-200',
};

const statusLabels: Record<string, string> = {
  All: 'הכל',
  new: 'חדש',
  contacted: 'בטיפול',
  meeting_set: 'נקבעה פגישה',
  won: 'נסגר הדיל',
  lost: 'אבוד / לא רלוונטי',
};

type SortConfig = {
  key: keyof Lead | 'potentialValue' | 'createdAt';
  direction: 'asc' | 'desc';
} | null;

export default function Leads() {
  const { leads = [], loading } = useLiveDashboardData();
  const { data: agents } = useAgents();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [activeTab, setActiveTab] = useState<'buyer' | 'seller'>('buyer');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });

  // Multi-selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [matchingLead, setMatchingLead] = useState<Lead | null>(null);
  const [profileLead, setProfileLead] = useState<Lead | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
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
      if (targetLead && profileLead?.id !== targetLead.id) {
        setProfileLead(targetLead);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, leads, profileLead, navigate, location.pathname]);

  const handleSort = (key: any) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const processedLeads = useMemo(() => {
    let filtered = leads.filter((lead) => {
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
          aVal = a.createdAt?.toMillis() || 0;
          bVal = b.createdAt?.toMillis() || 0;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [leads, search, filter, activeTab, sortConfig]);

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
    <div className="space-y-6" dir="rtl">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">ניהול לקוחות (לידים)</h1>
          <p className="text-sm text-slate-500 mt-1">{leads.length} לקוחות במערכת</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedLeadIds.size > 0 && (
            <>
              <button
                onClick={handleBroadcast}
                className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm animate-in fade-in zoom-in duration-200"
              >
                <MessageCircle size={16} />
                <span>ווטסאפ ({selectedLeadIds.size})</span>
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm(`למחוק ${selectedLeadIds.size} לידים? הפעולה אינה הפיכה.`)) return;
                  try {
                    await Promise.all([...selectedLeadIds].map(id => deleteLead(id)));
                    setSelectedLeadIds(new Set());
                    setToast({ show: true, message: `${selectedLeadIds.size} לידים נמחקו`, type: 'success' });
                  } catch {
                    setToast({ show: true, message: 'שגיאה במחיקה', type: 'error' });
                  }
                }}
                className="inline-flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm animate-in fade-in zoom-in duration-200"
              >
                <Trash2 size={16} />
                <span>מחק ({selectedLeadIds.size})</span>
              </button>
            </>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="רענן רשימה"
            className="inline-flex items-center justify-center w-10 h-10 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={18} className={isRefreshing ? "animate-spin text-blue-600" : ""} />
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Upload size={16} />
            ייבוא מאקסל
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Plus size={16} />
            הוסף ליד
          </button>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'סה"כ לידים', value: leads.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'אחוז המרה', value: leads.length > 0 ? `${Math.round((leads.filter(l => l.status === 'won').length / leads.length) * 100)}%` : '0%', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'שווי פוטנציאלי', value: `₪${Math.round(leads.reduce((sum, l) => sum + (l.requirements?.maxBudget || 0), 0) / 1_000_000 * 10) / 10}M`, icon: BarChart3, color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map((card) => (
          <div key={card.label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center`}>
              <card.icon size={22} className={card.color} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">{card.label}</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => { setActiveTab('buyer'); setSelectedLeadIds(new Set()); }}
          className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'buyer' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          מחפשי דירה ({leads.filter(l => l.type === 'buyer').length || 0})
        </button>
        <button
          onClick={() => { setActiveTab('seller'); setSelectedLeadIds(new Set()); }}
          className={`px-6 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'seller' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          בעלי נכסים ({leads.filter(l => l.type === 'seller').length || 0})
        </button>
      </div>


      {/* Table Card wrapper */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden text-right">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם או טלפון..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-right placeholder-slate-400"
            />
          </div>
          <div className="flex gap-2 mr-auto sm:mr-0">
            {['All', 'new', 'contacted', 'meeting_set', 'won', 'lost'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' + (filter === f ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200')}
              >
                {statusLabels[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
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
                    onClick={() => setProfileLead(lead)}
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
                            <div className="flex gap-1.5 mt-1.5 flex-wrap">
                              {lead.requirements?.mustHaveParking && <div className="bg-slate-50 p-1 rounded border border-slate-100" title="חניה"><Car size={13} className="text-slate-500" /></div>}
                              {lead.requirements?.mustHaveElevator && <div className="bg-slate-50 p-1 rounded border border-slate-100" title="מעלית"><MoveUp size={13} className="text-slate-500" /></div>}
                              {lead.requirements?.mustHaveBalcony && <div className="bg-slate-50 p-1 rounded border border-slate-100" title="מרפסת"><Sun size={13} className="text-slate-500" /></div>}
                              {lead.requirements?.mustHaveSafeRoom && <div className="bg-slate-50 p-1 rounded border border-slate-100" title='ממ"ד'><Shield size={13} className="text-slate-500" /></div>}
                            </div>
                          </>
                        ) : (
                          <>
                            {lead.requirements?.desiredCity && lead.requirements.desiredCity.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 rounded px-2 py-0.5">
                                <MapPin size={10} />
                                {lead.requirements.desiredCity.join(', ')}
                              </span>
                            )}
                            {lead.requirements?.maxBudget && (
                              <span className="block text-xs font-medium text-slate-700">₪{lead.requirements.maxBudget.toLocaleString()}</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {(() => {
                        const agent = agents.find(a => a.uid === lead.assignedAgentId || a.id === lead.assignedAgentId);
                        return agent ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                              {agent.name.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-slate-700">{agent.name}</span>
                          </div>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setProfileLead(lead); }}
                            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <UserCircle2 size={14} />
                            שייך סוכן
                          </button>
                        );
                      })()}
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block">{lead.source}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={'inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ' + (statusColors[lead.status] || statusColors.new)}>
                        {statusLabels[lead.status] || lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs text-slate-500">{lead.createdAt?.toDate().toLocaleDateString('he-IL')}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {activeTab === 'buyer' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setMatchingLead(lead); }}
                            className="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Sparkles size={14} />
                            התאמות
                          </button>
                        )}
                        {/* WhatsApp direct message button */}
                        {lead.phone && (
                          <a
                            href={`https://wa.me/${lead.phone.replace(/^0/, '972').replace(/[^\d]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="שלח הודעת ווטסאפ"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <MessageSquare size={16} />
                          </a>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingLead(lead); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="ערוך ליד"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="מחק ליד"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <p className="text-xs text-slate-500">מציג <span className="font-semibold text-slate-700">{processedLeads.length}</span> רשומות</p>
        </div>
      </div>

      {matchingLead && <PropertyMatcherModal lead={matchingLead} onClose={() => setMatchingLead(null)} />}

      <BulkWhatsAppModal
        isOpen={isBulkWhatsAppModalOpen}
        onClose={() => setIsBulkWhatsAppModalOpen(false)}
        selectedLeads={leads.filter(l => selectedLeadIds.has(l.id))}
        onSuccess={handleBulkWhatsAppSuccess}
      />
      {profileLead && (
        <LeadProfilePanel
          lead={profileLead}
          agents={agents}
          onClose={() => setProfileLead(null)}
          onUpdated={(msg) => {
            setToast({ show: true, message: msg, type: 'success' });
          }}
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
      <Toast show={toast.show} message={toast.message} type={toast.type} onClose={() => setToast(prev => ({ ...prev, show: false }))} />
    </div>
  );
}
