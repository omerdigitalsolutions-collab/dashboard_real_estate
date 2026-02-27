import { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import DealsKanban from '../components/deals/DealsKanban';
import AddDealModal from '../components/modals/AddDealModal';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAgents } from '../hooks/useFirestoreData';

export default function Transactions() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { deals, leads, properties, agencySettings } = useLiveDashboardData();
  const { data: agents } = useAgents();

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

    const csvData = deals.map(deal => {
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
          <div className="flex gap-2">
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

        <div className="flex-1 min-h-0">
          <DealsKanban />
        </div>

        <AddDealModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
        />
      </div>
    </div>
  );
}
