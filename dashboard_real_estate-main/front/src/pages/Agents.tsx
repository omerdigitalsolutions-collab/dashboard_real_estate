import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAgentPerformance } from '../hooks/useFirestoreData';
import InviteAgentModal from '../components/settings/InviteAgentModal';
import EditAgentGoalsModal from '../components/modals/EditAgentGoalsModal';
import EditAgentModal from '../components/modals/EditAgentModal';
import { Star, UserPlus, Pencil, UserCog, Trash2 } from 'lucide-react';
import { AppUser } from '../types';
import { deleteAgent } from '../services/teamService';

export default function Agents() {
  const { userData } = useAuth();
  const { data: agentsData, loading } = useAgentPerformance();
  const [showInvite, setShowInvite] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AppUser | null>(null);
  const [editingAgentDetails, setEditingAgentDetails] = useState<AppUser | null>(null);
  const [toast, setToast] = useState('');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[400px]">
        <div className="animate-pulse flex gap-2"><div className="w-2 h-2 bg-blue-500 rounded-full"></div></div>
      </div>
    );
  }

  const handleDeleteCall = async (docId: string) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את הסוכן? פעולה זו היא בלתי הפיכה.')) return;
    try {
      await deleteAgent(docId);
      setToast('הסוכן נמחק מהמערכת');
      setTimeout(() => setToast(''), 3500);
    } catch {
      setToast('מחיקת הסוכן נכשלה');
      setTimeout(() => setToast(''), 3500);
    }
  };

  const formatSales = (v: number) => {
    if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `₪${(v / 1_000).toFixed(0)}K`;
    return `₪${v}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">סוכנים</h1>
          <p className="text-sm text-slate-500 mt-0.5">{agentsData.length} סוכנים פעילים בצוות</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <UserPlus size={15} />
          הזמן סוכן
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agentsData.length > 0 ? (
          agentsData.map((agent) => (
            <div
              key={agent.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${agent.avatarColor}`}>
                    {agent.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{agent.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{agent.role === 'admin' ? 'מנהל משרד' : 'סוכן נדל"ן'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg">
                  <Star size={11} className="text-amber-500 fill-amber-500" />
                  <span className="text-xs font-bold text-amber-600">4.9</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: 'היקף סגירות', value: formatSales(agent.sales) },
                  { label: 'עסקאות (חוזה)', value: agent.deals.toString() },
                  { label: 'יעד חודשי', value: formatSales(agent.monthlyTarget) },
                  { label: '% עמידה ביעד', value: agent.monthlyTarget > 0 ? `${Math.round((agent.sales / agent.monthlyTarget) * 100)}%` : 'לא הוגדר' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 font-medium">{stat.label}</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-50">
                {agent.isStub ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    ממתין לחיבור
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    פעיל
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium font-mono">{(agent.id ?? '').slice(0, 8).toUpperCase()}</span>
                  {userData?.role === 'admin' && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAgentDetails(agent.agentDoc);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                        title="ערוך פרטי סוכן"
                      >
                        <UserCog size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAgent(agent.agentDoc);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="עריכת יעדים אישיים"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (agent.id) handleDeleteCall(agent.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="מחק סוכן"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-slate-500 text-sm">לא נמצאו סוכנים מוגדרים במערכת</div>
        )}
      </div>
      {showInvite && (
        <InviteAgentModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => {
            setShowInvite(false);
            setToast('הסוכן הוזמן בהצלחה! 🎉');
            setTimeout(() => setToast(''), 3500);
          }}
        />
      )}

      {editingAgent && (
        <EditAgentGoalsModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onSuccess={() => {
            setEditingAgent(null);
            setToast('היעדים עודכנו בהצלחה! 🎯');
            setTimeout(() => setToast(''), 3500);
          }}
        />
      )}

      {editingAgentDetails && (
        <EditAgentModal
          agent={editingAgentDetails}
          isOpen={true}
          onClose={() => setEditingAgentDetails(null)}
          onSuccess={(msg) => {
            setEditingAgentDetails(null);
            setToast(msg);
            setTimeout(() => setToast(''), 3500);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
