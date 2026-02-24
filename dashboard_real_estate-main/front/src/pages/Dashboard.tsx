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
import { Loader2, Upload, Edit3, Save, LayoutGrid } from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { ResponsiveGridLayout } from 'react-grid-layout';
import type { LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// ─── Default layout (12-column grid, row-height = 80px) ─────────────────────
// x=0 is LEFT in the grid coordinate system. We wrap the grid in a dir=ltr
// container so the visual left matches the coordinate left, then each widget
// uses dir=rtl internally.
const DEFAULT_LAYOUT: LayoutItem[] = [
  // Row 1 – KPI cards (each 3 cols wide, 2 rows tall)
  { i: 'kpi_value', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'kpi_active', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'kpi_leads', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'kpi_tasks', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  // Row 2 – Inventory | Financial Chart | Tasks
  { i: 'inventory', x: 9, y: 2, w: 3, h: 5, minW: 2, minH: 3 },
  { i: 'financial', x: 3, y: 2, w: 6, h: 5, minW: 3, minH: 3 },
  { i: 'task_widget', x: 0, y: 2, w: 3, h: 5, minW: 2, minH: 3 },
  // Row 3 – Operations | Activity | Leaderboard
  { i: 'operations', x: 9, y: 7, w: 3, h: 5, minW: 2, minH: 3 },
  { i: 'activity', x: 6, y: 7, w: 3, h: 5, minW: 2, minH: 3 },
  { i: 'leaderboard', x: 0, y: 7, w: 6, h: 5, minW: 3, minH: 3 },
  // Row 4 – Map | AI Insights
  { i: 'map', x: 9, y: 12, w: 3, h: 5, minW: 2, minH: 3 },
  { i: 'ai_insights', x: 0, y: 12, w: 9, h: 5, minW: 3, minH: 3 },
];

export default function Dashboard() {
  const { deals, tasks, leads, properties, loading } = useLiveDashboardData();
  const { userData } = useAuth();
  const { preferences, saveLayout, updatePreferences } = usePreferences();

  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [currentLayout, setCurrentLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT);

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

  const pipelineStats = useMemo(() => calculatePipelineStats(deals), [deals]);

  useEffect(() => {
    if (preferences?.dashboardLayout && preferences.dashboardLayout.length > 0) {
      setCurrentLayout(preferences.dashboardLayout as LayoutItem[]);
    } else {
      setCurrentLayout(DEFAULT_LAYOUT);
    }
  }, [preferences?.dashboardLayout]);

  const handleLayoutChange = (layout: any) => {
    setCurrentLayout(layout); // Fast local update
    if (isEditing) {           // Only save to Firestore if the user is deliberately editing
      saveLayout(layout);
    }
  };

  const handleResetLayout = async () => {
    setIsResetting(true);
    setCurrentLayout(DEFAULT_LAYOUT);
    updatePreferences({ dashboardLayout: DEFAULT_LAYOUT });
    setTimeout(() => {
      setIsResetting(false);
      setIsEditing(false); // Drop out of edit mode so they see the clean result
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
    <div className="max-w-[1600px] mx-auto w-full pb-10 overflow-x-hidden" dir="rtl">

      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">לוח בקרה</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ברוך שובך{userData?.name ? `, ${userData.name}` : ''}. הנה מה שקורה היום.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Import button – always visible */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Upload size={16} />
            ייבוא מאקסל
          </button>

          {isEditing && (
            <button
              onClick={handleResetLayout}
              disabled={isResetting}
              className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-60"
            >
              {isResetting ? <Loader2 size={16} className="animate-spin" /> : <LayoutGrid size={16} />}
              איפוס לעיצוב מקורי
            </button>
          )}

          {isEditing ? (
            <button
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-emerald-600/30"
            >
              <Save size={16} />
              נשמר אוטומטית. סיים עריכה
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              <Edit3 size={16} />
              ערוך דאשבורד
            </button>
          )}
        </div>
      </div>

      {/* ── Edit Mode Banner ─────────────────────────────────────────── */}
      {isEditing && (
        <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 flex items-center gap-2">
          <Edit3 size={14} className="shrink-0" />
          מצב עריכה פעיל — גרור ושנה גודל ווידג'טים לפי רצונך, לאחר מכן לחץ <strong className="mr-1">"שמור עיצוב"</strong>.
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
          layouts={{ lg: currentLayout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 12, xs: 4, xxs: 2 }}
          rowHeight={80}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: isEditing, bounded: true }}
          resizeConfig={{ enabled: isEditing }}
          onLayoutChange={(layout: any) => handleLayoutChange(layout)}
        >
          {/* ─ KPI Cards ──────────────────────────────────────────── */}
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

              />
            </div>
          </div>

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

              />
            </div>
          </div>

          <div key="kpi_leads" dir="rtl" className={`overflow-hidden ${editRing}`}>
            <div className={innerWrap}>
              <KpiCard
                title="סה״כ לידים פעילים"
                value={leads.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length.toString()}
                rawValue={leads.filter(l => ['new', 'contacted', 'meeting_set'].includes(l.status)).length}
                target={50}
                change="+10%"
                positive
                subtitle="לידים חמים"
                icon="Users"
                color="emerald"

              />
            </div>
          </div>

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

          {/* ─ Row 2 ──────────────────────────────────────────────── */}
          <div key="inventory" dir="rtl" className={`overflow-hidden ${editRing}`}>
            <div className={innerWrap}><InventorySnapshot /></div>
          </div>

          <div key="financial" dir="rtl" className={`overflow-hidden ${editRing}`}>
            <div className={`${innerWrap} flex flex-col`}><FinancialChart /></div>
          </div>

          <div key="task_widget" dir="rtl" className={`overflow-hidden ${editRing}`}>
            <div className={`${innerWrap} flex flex-col`}>
              <TaskDashboardWidget
                tasks={tasks as any}
                onAddClick={() => setIsAddTaskModalOpen(true)}
              />
            </div>
          </div>

          {/* ─ Row 3 ──────────────────────────────────────────────── */}
          <div key="operations" dir="rtl" className={`overflow-hidden ${editRing}`}>
            <div className={`${innerWrap} flex flex-col`}><OperationsCenter /></div>
          </div>

          <div key="activity" dir="rtl" className={`overflow-hidden ${editRing}`}>
            <div className={`${innerWrap} flex flex-col`}><RecentActivity /></div>
          </div>

          <div key="leaderboard" dir="rtl" className={`overflow-hidden ${editRing}`}>
            <div className={`${innerWrap} flex flex-col`}><AgentLeaderboard /></div>
          </div>

          {/* ─ Row 4 ──────────────────────────────────────────────── */}
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

          <div key="ai_insights" dir="rtl" className={`overflow-hidden ${editRing}`}>
            <div className={`${innerWrap} flex flex-col`}><AIInsights /></div>
          </div>
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
