import { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import DealsKanban from '../components/deals/DealsKanban';
import AddDealModal from '../components/modals/AddDealModal';

export default function Transactions() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
            <button className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
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
