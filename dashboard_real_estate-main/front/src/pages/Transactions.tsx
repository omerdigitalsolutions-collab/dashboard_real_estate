import { useState, useMemo, useEffect } from 'react';
import { Download, Plus, Calendar, Search, ArrowUpDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import DealsKanban from '../components/deals/DealsKanban';
import AddDealModal from '../components/modals/AddDealModal';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAgents } from '../hooks/useFirestoreData';
import { TimeRange } from '../types';
import { calculatePipelineStats } from '../utils/analytics';
import KpiCard from '../components/dashboard/KpiCard';

export default function Transactions() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { deals, leads, properties, agencySettings } = useLiveDashboardData();
  const { data: agents } = useAgents();

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

  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: 'projectedCommission' | 'createdAt', direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  const filteredDeals = useMemo(() => {
    let items = filterByTimeRange(deals, timeRange);

    if (search) {
      items = items.filter(d => {
        const prop = properties.find(p => p.id === d.propertyId);
        const lead = leads.find(l => l.id === d.leadId);
        const searchLower = search.toLowerCase();
        return (
          prop?.address?.toLowerCase().includes(searchLower) ||
          prop?.city?.toLowerCase().includes(searchLower) ||
          lead?.name?.toLowerCase().includes(searchLower) ||
          lead?.phone?.includes(search)
        );
      });
    }

    items.sort((a, b) => {
      let aVal: any = a[sortConfig.key];
      let bVal: any = b[sortConfig.key];

      if (sortConfig.key === 'createdAt') {
        aVal = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
        bVal = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  }, [deals, timeRange, search, sortConfig, properties, leads]);

  const pipelineStats = useMemo(() => calculatePipelineStats(filteredDeals), [filteredDeals]);

  const handleExportCSV = () => {
    if (!deals || deals.length === 0) {
      alert('אין עסקאות לייצוא');
      return;
    }

    const customStages = agencySettings?.customDealStages || [];
    const stagesMap = new Map<string, string>();
    if (customStages.length > 0) {
      customStages.forEach(s => stagesMap.set(s.id, s.label));
      stagesMap.set('won', 'נסגר בהצלחה');
    } else {
      stagesMap.set('qualification', 'בירור צרכים');
      stagesMap.set('negotiation', 'משא ומתן');
      stagesMap.set('won', 'נסגר בהצלחה');
    }

    const getStageLabel = (stageId: string) => {
      return stagesMap.get(stageId) || stageId || '---';
    };

    const headers = [
      'מזהה',
      'תיאור/כתובת הנכס',
      'שם הליד/לקוח',
      'טלפון',
      'סוכן מטפל',
      'סטטוס עסקה',
      'שווי נכס (₪)',
      'עמלה צפויה (₪)',
      'הסתברות לסגירה (%)',
      'תאריך יצירה'
    ];

    const getAgentName = (uid: string) => agents?.find(a => a.uid === uid || a.id === uid)?.name || 'לא משויך';
    const getLeadNameAndPhone = (leadId: string) => {
      const match = leads.find(l => l.id === leadId);
      return { name: match?.name || '---', phone: match?.phone || '---' };
    };
    const getPropertyDetails = (propertyId: string) => {
      const match = properties.find(p => p.id === propertyId);
      return match ? `${match.city || ''}, ${match.address || ''}`.replace(/^, |, $/g, '').trim() : '---';
    };

    const csvData = (deals as any[]).map(deal => {
      const leadInfo = deal.leadId ? getLeadNameAndPhone(deal.leadId) : { name: '---', phone: '---' };
      const propInfo = deal.propertyId ? getPropertyDetails(deal.propertyId) : '---';

      const agentLookupId = deal.agentId || deal.createdBy;
      const agentName = agentLookupId ? getAgentName(agentLookupId) : '---';

      const propPrice = properties.find(p => p.id === deal.propertyId)?.price || 0;

      const row = [
        deal.id || deal.propertyId || '---',
        `"${propInfo.replace(/"/g, '""')}"`,
        `"${leadInfo.name.replace(/"/g, '""')}"`,
        leadInfo.phone,
        `"${agentName.replace(/"/g, '""')}"`,
        `"${getStageLabel(deal.stage).replace(/"/g, '""')}"`,
        propPrice.toString(),
        deal.projectedCommission?.toString() || '0',
        deal.probability?.toString() || '0',
        deal.createdAt ? new Date(deal.createdAt.seconds * 1000).toLocaleDateString('he-IL') : '---'
      ];
      return row.join(',');
    });

    const csvContent = [headers.join(','), ...csvData].join('\n');
    // Add BOM for Hebrew support in Excel
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deals_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto w-full h-full px-2 sm:px-0">
      <div className="space-y-6 flex flex-col h-full min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900">עסקאות - Kanban</h1>
            <p className="text-sm text-slate-500 mt-0.5">ניהול עסקאות באמצעות לוח עבודה דינמי</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי כתובת או לקוח..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-right placeholder-slate-400"
              />
            </div>
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl h-10">
              <ArrowUpDown size={14} className="text-slate-400" />
              <select
                value={`${sortConfig.key}-${sortConfig.direction}`}
                onChange={(e) => {
                  const [key, direction] = e.target.value.split('-') as [any, any];
                  setSortConfig({ key, direction });
                }}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none appearance-none cursor-pointer"
              >
                <option value="createdAt-desc">חדש קודם</option>
                <option value="createdAt-asc">ישן קודם</option>
                <option value="projectedCommission-desc">עמלה (גבוה לנמוך)</option>
                <option value="projectedCommission-asc">עמלה (נמוך לגבוה)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2.5 rounded-xl shadow-sm h-10">
              <Calendar size={16} className="text-slate-400" />
              <select
                value={timeRange}
                onChange={(e) => handleRangeChange(e.target.value as TimeRange | 'all')}
                className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none appearance-none pr-6 cursor-pointer"
                style={{ paddingRight: '1rem', paddingLeft: '0.5rem' }}
              >
                <option value="all">כל הזמן</option>
                <option value="1m">חודש אחרון</option>
                <option value="3m">3 חודשים</option>
                <option value="6m">6 חודשים</option>
                <option value="1y">שנה אחרונה</option>
              </select>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-blue-200"
            >
              <Plus size={16} />
              עסקה חדשה
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              <Download size={15} />
              ייצוא CSV
            </button>
          </div>
        </div>

        {/* Dashboard Top KPIs Linkage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" dir="rtl">
          <KpiCard
            title="סה״כ פוטנציאל עמלות"
            value={`₪${pipelineStats.totalValue.toLocaleString()}`}
            rawValue={pipelineStats.totalValue}
            target={1000000}
            change={`${pipelineStats.successRate.toFixed(1)}% אחוז הצלחה`}
            positive
            subtitle={timeRange === 'all' ? "בכל השלבים הפעילים (כל הזמן)" : `בכל השלבים הפעילים (${timeRange})`}
            icon="Wallet"
            color="blue"
          />
          <KpiCard
            title="עסקאות פעילות"
            value={pipelineStats.activeCount.toString()}
            rawValue={pipelineStats.activeCount}
            target={20}
            change={`${pipelineStats.wonCount} נסגרו החודש`}
            positive
            subtitle={timeRange === 'all' ? "עסקאות בתהליך (כל הזמן)" : `עסקאות בתהליך (${timeRange})`}
            icon="Handshake"
            color="amber"
          />
        </div>

        <div className="flex-1 min-h-0">
          <DealsKanban dealsProps={filteredDeals} />
        </div>

        <AddDealModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
        />
      </div>
    </div>
  );
}
