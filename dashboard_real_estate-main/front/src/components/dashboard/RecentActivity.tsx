import { UserPlus, CheckCircle, Megaphone, FileCheck, ArrowRight } from 'lucide-react';
import { useRecentActivityFeed } from '../../hooks/useFirestoreData';

const iconMap: Record<string, any> = {
  lead: UserPlus,
  deal: CheckCircle,
  campaign: Megaphone,
  contract: FileCheck,
};

const colorMap: Record<string, string> = {
  lead: 'bg-blue-100 text-blue-600',
  deal: 'bg-emerald-100 text-emerald-600',
  campaign: 'bg-amber-100 text-amber-600',
  contract: 'bg-violet-100 text-violet-600',
};

export default function RecentActivity() {
  const { data: recentActivity, loading } = useRecentActivityFeed();

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-full flex flex-col justify-center items-center">
        <div className="animate-pulse flex gap-2"><div className="w-2 h-2 bg-slate-200 rounded-full"></div></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">פעילות אחרונה</h2>
          <p className="text-sm text-slate-500 mt-0.5">עדכונים שוטפים מהצוות (בזמן אמת)</p>
        </div>
        <button className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
          הכל
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="space-y-6 overflow-y-auto max-h-[320px] pr-1 custom-scrollbar flex-1">
        {recentActivity.length > 0 ? (
          recentActivity.map((item, idx) => {
            const Icon = iconMap[item.type] || UserPlus;
            const colorClass = colorMap[item.type] || 'bg-slate-100 text-slate-600';

            return (
              <div key={`${item.id}-${idx}`} className="flex gap-4 relative">
                {/* Timeline line */}
                <div className="absolute top-10 bottom-[-24px] right-[19px] w-[2px] bg-slate-100 last:hidden" />

                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 z-10 ${colorClass}`}>
                  <Icon size={20} />
                </div>

                <div className="flex-1 pt-0.5">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-bold text-slate-900">{item.message}</p>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{item.time}</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{item.detail}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 font-medium text-sm pt-10">
            אין פעילות לדיווח
          </div>
        )}
      </div>
    </div>
  );
}
