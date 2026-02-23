import KpiCard from '../components/dashboard/KpiCard';
import FinancialChart from '../components/dashboard/FinancialChart';
import OperationsCenter from '../components/dashboard/OperationsCenter';
import InventorySnapshot from '../components/dashboard/InventorySnapshot';
import PropertyMap from '../components/dashboard/PropertyMap';
import AgentLeaderboard from '../components/dashboard/AgentLeaderboard';
import RecentActivity from '../components/dashboard/RecentActivity';
import AIInsights from '../components/dashboard/AIInsights';
import TaskDashboardWidget from '../components/dashboard/TaskDashboardWidget';
import AddTaskModal from '../components/modals/AddTaskModal';
import ImportModal from '../components/modals/ImportModal';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { calculatePipelineStats } from '../utils/analytics';
import { Loader2, Upload } from 'lucide-react';
import { useState, useMemo } from 'react';

export default function Dashboard() {
  const { deals, tasks, leads, properties, loading } = useLiveDashboardData();
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const pipelineStats = useMemo(() => calculatePipelineStats(deals), [deals]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }
  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">לוח בקרה</h1>
            <p className="text-sm text-slate-500 mt-0.5">ברוך שובך, עומר. הנה מה שקורה היום.</p>
          </div>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Upload size={16} />
            ייבוא מאקסל
          </button>
        </div>

        {/* Row 1: KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="סה״כ פוטנציאל עמלות"
            value={`₪${pipelineStats.totalValue.toLocaleString()}`}
            rawValue={pipelineStats.totalValue}
            target={1000000}
            change={`${pipelineStats.successRate.toFixed(1)}% אחוז הצלחה`}
            positive={true}
            subtitle="בכל השלבים הפעילים"
            icon="Wallet"
            color="blue"
          />
          <KpiCard
            title="עסקאות פעילות"
            value={pipelineStats.activeCount.toString()}
            rawValue={pipelineStats.activeCount}
            target={20}
            change={`${pipelineStats.wonCount} נסגרו החודש`}
            positive={true}
            subtitle="עסקאות בתהליך"
            icon="Handshake"
            color="amber"
          />
          <KpiCard
            title="סה״כ לידים פעילים"
            value={leads.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length.toString()}
            rawValue={leads.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length}
            target={50}
            change="+10%"
            positive={true}
            subtitle="לידים חמים"
            icon="Users"
            color="emerald"
          />
          <KpiCard
            title="משימות פתוחות"
            value={tasks.filter(t => !t.isCompleted).length.toString()}
            rawValue={tasks.filter(t => !t.isCompleted).length}
            target={tasks.length || 1}
            change={`${tasks.filter(t => t.isCompleted).length} הושלמו שבוע אחרון`}
            positive={true}
            subtitle="ממתינות לביצוע"
            icon="CheckCircle2"
            color="violet"
          />
        </div>

        {/* Row 2: Inventory Snapshot (1/4) + Financial Chart (2/4) + Tasks (1/4) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-1 h-[400px]">
            <InventorySnapshot />
          </div>
          <div className="xl:col-span-2 h-[400px]">
            <FinancialChart />
          </div>
          <div className="xl:col-span-1 h-[400px]">
            <TaskDashboardWidget tasks={tasks as any} onAddClick={() => setIsAddTaskModalOpen(true)} />
          </div>
        </div>

        {/* Row 3: Operations (1/4) + Recent Activity (1/4) + Agent Leaderboard (2/4) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-1">
            <OperationsCenter />
          </div>
          <div className="xl:col-span-1 h-[400px]">
            <RecentActivity />
          </div>
          <div className="xl:col-span-2">
            <AgentLeaderboard />
          </div>
        </div>

        {/* Row 4: Property Map (1/4) + AI Insights (3/4) */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">מפת נכסים מרחבית</h3>
            </div>
            <div className="p-3 flex-1 h-[250px] sm:h-[300px] xl:h-[300px]">
              <PropertyMap height="100%" />
            </div>
          </div>
          <div className="xl:col-span-3">
            <AIInsights />
          </div>
        </div>

        <AddTaskModal
          isOpen={isAddTaskModalOpen}
          onClose={() => setIsAddTaskModalOpen(false)}
          leads={leads}
          properties={properties}
        />
        <ImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
      </div>
    </div>
  );
}
