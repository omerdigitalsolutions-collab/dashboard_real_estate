import KpiCard from '../components/dashboard/KpiCard';
import FinancialChart from '../components/dashboard/FinancialChart';
import OperationsCenter from '../components/dashboard/OperationsCenter';
import InventorySnapshot from '../components/dashboard/InventorySnapshot';
import PropertyMap from '../components/dashboard/PropertyMap';
import AgentLeaderboard from '../components/dashboard/AgentLeaderboard';
import RecentActivity from '../components/dashboard/RecentActivity';
import AIInsights from '../components/dashboard/AIInsights';
import TaskDashboardWidget from '../components/dashboard/TaskDashboardWidget';
import WidgetLeadSourceChart from '../components/dashboard/WidgetLeadSourceChart';
import WidgetLeadStatusChart from '../components/dashboard/WidgetLeadStatusChart';
import WidgetDealStatusChart from '../components/dashboard/WidgetDealStatusChart';
import WidgetAgencyExpenses from '../components/dashboard/WidgetAgencyExpenses';
import AddTaskModal from '../components/modals/AddTaskModal';
import ImportModal from '../components/modals/ImportModal';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { calculatePipelineStats } from '../utils/analytics';
import { Loader2, Upload, Edit3, Save, LayoutGrid, Calendar } from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { ResponsiveGridLayout } from 'react-grid-layout';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { TimeRange } from '../types';

// ─── Default layouts per tab (12-column grid, row-height = 80px) ────────────
// Finance tab: KPI commissions, financial chart, agency expenses
const DEFAULT_LAYOUT_FINANCE: LayoutItem[] = [
  { i: 'kpi_value', x: 0, y: 0, w: 4, h: 3, minH: 2, minW: 2 },
  { i: 'financial', x: 0, y: 3, w: 8, h: 6, minH: 3, minW: 3 },
  { i: 'agency_expenses', x: 8, y: 3, w: 4, h: 9, minH: 5, minW: 3 },
];

// Office tab: all operational / people / activity widgets
const DEFAULT_LAYOUT_OFFICE: LayoutItem[] = [
  { i: 'kpi_active', x: 0, y: 0, w: 4, h: 3, minH: 2, minW: 2 },
  { i: 'kpi_leads', x: 4, y: 0, w: 4, h: 3, minH: 2, minW: 2 },
  { i: 'kpi_tasks', x: 8, y: 0, w: 4, h: 3, minH: 2, minW: 2 },
  { i: 'inventory', x: 0, y: 3, w: 4, h: 4, minH: 3, minW: 2 },
  { i: 'leaderboard', x: 4, y: 3, w: 8, h: 4, minH: 3, minW: 3 },
  { i: 'map', x: 0, y: 7, w: 6, h: 5, minH: 3, minW: 2 },
  { i: 'lead_source_chart', x: 6, y: 7, w: 6, h: 5, minH: 4, minW: 3 },
  { i: 'task_widget', x: 0, y: 12, w: 4, h: 5, minH: 3, minW: 2 },
  { i: 'operations', x: 4, y: 12, w: 4, h: 5, minH: 3, minW: 2 },
  { i: 'activity', x: 8, y: 12, w: 4, h: 5, minH: 3, minW: 2 },
  { i: 'lead_status_chart', x: 0, y: 17, w: 6, h: 4, minH: 4, minW: 3 },
  { i: 'deal_status_chart', x: 6, y: 17, w: 6, h: 5, minH: 4, minW: 3 },
  { i: 'ai_insights', x: 0, y: 22, w: 12, h: 5, minH: 3, minW: 3 },
];

export default function Dashboard() {
  const { deals, tasks, leads, properties, loading, agencySettings } = useLiveDashboardData();
  const { userData } = useAuth();
  const { preferences, saveTabLayout, updatePreferences } = usePreferences();
  const navigate = useNavigate();

  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [activeTab, setActiveTab] = useState<'finance' | 'office'>('office');
  const [timeRange, setTimeRange] = useState<TimeRange>('6m');
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Per-tab layout state
  const [layoutFinance, setLayoutFinance] = useState<LayoutItem[]>(DEFAULT_LAYOUT_FINANCE);
  const [layoutOffice, setLayoutOffice] = useState<LayoutItem[]>(DEFAULT_LAYOUT_OFFICE);

  const currentLayout = activeTab === 'finance' ? layoutFinance : layoutOffice;
  const setCurrentLayout = (l: LayoutItem[] | ((p: LayoutItem[]) => LayoutItem[])) => {
    if (activeTab === 'finance') setLayoutFinance(l as any);
    else setLayoutOffice(l as any);
  };

  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(1200);

  useEffect(() => {
    const node = gridWrapperRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setGridWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const filterByTimeRange = (items: any[], range: TimeRange) => {
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

  const filteredDeals = useMemo(() => filterByTimeRange(deals, timeRange), [deals, timeRange]);
  const filteredLeads = useMemo(() => filterByTimeRange(leads, timeRange), [leads, timeRange]);

  const pipelineStats = useMemo(() => calculatePipelineStats(filteredDeals), [filteredDeals]);

  useEffect(() => {
    // Load per-tab saved layouts from preferences, fall back to defaults
    const saved = preferences?.dashboardLayout as any;
    if (saved?.finance && saved.finance.length > 0) setLayoutFinance(saved.finance);
    else setLayoutFinance(DEFAULT_LAYOUT_FINANCE);
    if (saved?.office && saved.office.length > 0) setLayoutOffice(saved.office);
    else setLayoutOffice(DEFAULT_LAYOUT_OFFICE);
  }, []);

  const handleLayoutChange = (layout: any) => {
    let mergedLayout = layout;
    const prevLayout = activeTab === 'finance' ? layoutFinance : layoutOffice;
    const newLayoutMap = new Map(layout.map((item: any) => [item.i, item]));
    const updated = prevLayout.map((item: any) => newLayoutMap.get(item.i) || item);
    layout.forEach((item: any) => {
      if (!prevLayout.find((p: any) => p.i === item.i)) updated.push(item);
    });
    mergedLayout = updated;
    setCurrentLayout(updated);
    if (isEditing) {
      saveTabLayout(activeTab, mergedLayout);
    }
  };

  const handleResetLayout = async () => {
    setIsResetting(true);
    if (activeTab === 'finance') {
      setLayoutFinance(DEFAULT_LAYOUT_FINANCE);
    } else {
      setLayoutOffice(DEFAULT_LAYOUT_OFFICE);
    }
    updatePreferences({ dashboardLayout: { finance: DEFAULT_LAYOUT_FINANCE, office: DEFAULT_LAYOUT_OFFICE } as any });
    setTimeout(() => {
      setIsResetting(false);
      setIsEditing(false);
    }, 500);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ── Per-widget wrapper classes ────────────────────────────────────────────
  const editRing = isEditing
    ? 'ring-2 ring-dashed ring-blue-400 ring-offset-1 cursor-grab active:cursor-grabbing rounded-2xl'
    : '';
  const innerWrap = isEditing ? 'pointer-events-none select-none h-full' : 'h-full';

  return (
    <div className="tour-dashboard max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-10 overflow-x-hidden" dir="rtl">

      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">לוח בקרה</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            ברוך שובך{userData?.name ? `, ${userData.name}` : ''}. הנה מה שקורה היום.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-2 bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 px-3 py-2.5 rounded-xl shadow-lg">
            <Calendar size={16} className="text-slate-400" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="bg-transparent text-sm font-semibold text-slate-300 focus:outline-none appearance-none pr-6 cursor-pointer"
              style={{ paddingRight: '1rem', paddingLeft: '0.5rem' }}
            >
              <option value="1m">חודש אחרון</option>
              <option value="3m">3 חודשים</option>
              <option value="6m">6 חודשים</option>
              <option value="1y">שנה אחרונה</option>
            </select>
          </div>

          {/* Import button – always visible */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all shadow-lg"
            title="ייבוא מאקסל"
          >
            <Upload size={16} />
            <span className="hidden sm:inline">ייבוא</span>
          </button>

          {isEditing && (
            <button
              onClick={handleResetLayout}
              disabled={isResetting}
              className="inline-flex items-center gap-2 bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-800 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-lg disabled:opacity-60"
            >
              {isResetting ? <Loader2 size={16} className="animate-spin" /> : <LayoutGrid size={16} />}
              איפוס לעיצוב מקורי
            </button>
          )}

          {isEditing ? (
            <button
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-sm font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            >
              <Save size={16} />
              <span className="hidden sm:inline">שמור עיצוב</span>
              <span className="sm:hidden">שמור</span>
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all shadow-lg"
              title="ערוך דאשבורד"
            >
              <Edit3 size={16} />
              <span className="hidden sm:inline">ערוך</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex bg-slate-800/50 p-1 rounded-xl w-fit mb-6 border border-slate-700/50">
        <button
          onClick={() => setActiveTab('finance')}
          className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'finance'
            ? 'bg-blue-500 text-white shadow-md'
            : 'text-slate-400 hover:text-slate-200'
            }`}
        >
          פיננסים
        </button>
        <button
          onClick={() => setActiveTab('office')}
          className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'office'
            ? 'bg-blue-500 text-white shadow-md'
            : 'text-slate-400 hover:text-slate-200'
            }`}
        >
          משרדי
        </button>
      </div>

      {/* ── Edit Mode Banner ─────────────────────────────────────────── */}
      {isEditing && (
        <div className="mb-4 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-sm text-blue-400 flex items-center gap-2 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
          <Edit3 size={14} className="shrink-0" />
          מצב עריכה פעיל — גרור ושנה גודל ווידג'טים לפי רצונך, לאחר מכן לחץ <strong className="mr-1 text-blue-300">"שמור עיצוב"</strong>.
        </div>
      )}

      {/*
              ── Grid wrapper ─────────────────────────────────────────────────
              react-grid-layout uses LTR coordinate system (x=0 is the left
              edge). We wrap in dir=ltr so the grid calculates positions
              correctly, then restore dir=rtl inside every widget.
            */}
      <div dir="ltr" ref={gridWrapperRef} className="w-full">
        <ResponsiveGridLayout
          width={gridWidth}
          layouts={{ lg: currentLayout, md: currentLayout, sm: currentLayout, xs: currentLayout, xxs: currentLayout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 12, xs: 1, xxs: 1 }}
          rowHeight={80}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          // @ts-ignore
          isDraggable={isEditing && !isMobile}
          // @ts-ignore
          isResizable={isEditing && !isMobile}
          onLayoutChange={(layout: any) => handleLayoutChange(layout)}
        >
          {/* ─ KPI Cards ───────────────────────────────────────────────────── */}
          {activeTab === 'finance' && (
            <div key="kpi_value" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={innerWrap}>
                <KpiCard
                  title="סה״כ פוטנציאל עמלות"
                  value={`₪${pipelineStats.totalValue.toLocaleString()}`}
                  rawValue={pipelineStats.totalValue}
                  target={1000000}
                  change={`${pipelineStats.successRate.toFixed(1)}% אחוז הצלחה`}
                  positive
                  subtitle="בכל השלבים הפעילים"
                  icon="Wallet"
                  color="blue"
                  onClick={() => navigate(`/dashboard/transactions?range=${timeRange}`)}
                />
              </div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="kpi_active" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={innerWrap}>
                <KpiCard
                  title="עסקאות פעילות"
                  value={pipelineStats.activeCount.toString()}
                  rawValue={pipelineStats.activeCount}
                  target={20}
                  change={`${pipelineStats.wonCount} נסגרו החודש`}
                  positive
                  subtitle="עסקאות בתהליך"
                  icon="Handshake"
                  color="amber"
                  onClick={() => navigate(`/dashboard/transactions?range=${timeRange}`)}
                />
              </div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="kpi_leads" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={innerWrap}>
                <KpiCard
                  title="סה״כ לידים פעילים"
                  value={filteredLeads.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length.toString()}
                  rawValue={filteredLeads.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length}
                  target={50}
                  change="+10%"
                  positive
                  subtitle="לידים חמים"
                  icon="Users"
                  color="emerald"
                  onClick={() => navigate(`/dashboard/leads?range=${timeRange}`)}
                />
              </div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="kpi_tasks" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={innerWrap}>
                <KpiCard
                  title="משימות פתוחות"
                  value={tasks.filter(t => !t.isCompleted).length.toString()}
                  rawValue={tasks.filter(t => !t.isCompleted).length}
                  target={tasks.length || 1}
                  change={`${tasks.filter(t => t.isCompleted).length} הושלמו שבוע אחרון`}
                  positive
                  subtitle="ממתינות לביצוע"
                  icon="CheckCircle2"
                  color="violet"

                />
              </div>
            </div>
          )}

          {/* ─ Row 2 ──────────────────────────────────────────────── */}
          {activeTab === 'office' && (
            <div key="inventory" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={innerWrap}><InventorySnapshot timeRange={timeRange} onClick={() => navigate(`/dashboard/properties?range=${timeRange}`)} /></div>
            </div>
          )}

          {activeTab === 'finance' && (
            <div key="financial" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><FinancialChart /></div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="task_widget" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}>
                <TaskDashboardWidget
                  tasks={tasks as any}
                  onAddClick={() => setIsAddTaskModalOpen(true)}
                />
              </div>
            </div>
          )}

          {/* ─ Row 3 ──────────────────────────────────────────────── */}
          {activeTab === 'office' && (
            <div key="operations" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><OperationsCenter /></div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="activity" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><RecentActivity /></div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="leaderboard" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><AgentLeaderboard /></div>
            </div>
          )}

          {/* ─ Row 4 ──────────────────────────────────────────────── */}
          {activeTab === 'office' && (
            <div
              key="map"
              dir="rtl"
              className={`overflow-hidden bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col ${editRing}`}
            >
              <div className="p-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-bold text-slate-800">מפת נכסים מרחבית</h3>
                {isEditing && (
                  <span className="drag-handle text-slate-300 hover:text-slate-500 cursor-grab text-xs select-none px-1">
                    ⠿ גרור
                  </span>
                )}
              </div>
              <div className={`flex-1 min-h-0 ${isEditing ? 'pointer-events-none select-none' : ''}`}>
                <PropertyMap height="100%" />
              </div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="ai_insights" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><AIInsights /></div>
            </div>
          )}

          {/* ─ Row 5 ──────────────────────────────────────────────── */}
          {activeTab === 'office' && (
            <div key="lead_source_chart" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><WidgetLeadSourceChart leads={leads as any} /></div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="lead_status_chart" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><WidgetLeadStatusChart leads={leads as any} /></div>
            </div>
          )}

          {activeTab === 'office' && (
            <div key="deal_status_chart" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><WidgetDealStatusChart deals={deals as any} agencySettings={agencySettings} /></div>
            </div>
          )}

          {/* ─ Row 6 ──────────────────────────────────────────────── */}
          {activeTab === 'finance' && (
            <div key="agency_expenses" dir="rtl" className={`overflow-hidden ${editRing}`}>
              <div className={`${innerWrap} flex flex-col`}><WidgetAgencyExpenses /></div>
            </div>
          )}
        </ResponsiveGridLayout>
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
  );
}
