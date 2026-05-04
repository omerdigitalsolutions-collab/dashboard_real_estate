import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAgentPerformance, useAgency } from '../hooks/useFirestoreData';
import InviteAgentModal from '../components/settings/InviteAgentModal';
import InviteAgentBlock from '../components/settings/InviteAgentBlock';
import ShareInviteModal from '../components/modals/ShareInviteModal';
import EditAgentGoalsModal from '../components/modals/EditAgentGoalsModal';
import EditAgentModal from '../components/modals/EditAgentModal';
import EmailInviteModal from '../components/modals/EmailInviteModal';
import { Star, UserPlus, Pencil, UserCog, Trash2, Share2, Mail, Phone } from 'lucide-react';
import { AppUser } from '../types';
import { deleteAgent, sendAgentInvite } from '../services/teamService';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Agents() {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { data: agentsData, loading: agentsLoading } = useAgentPerformance();
  const { agency, loading: agencyLoading } = useAgency();
  const [showInvite, setShowInvite] = useState(false);
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AppUser | null>(null);
  const [editingAgentDetails, setEditingAgentDetails] = useState<AppUser | null>(null);
  const [sharingAgent, setSharingAgent] = useState<AppUser | null>(null);
  const [toast, setToast] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [isSendingBulk, setIsSendingBulk] = useState(false);

  if (agentsLoading || agencyLoading) {
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

  const stubsWithEmail = agentsData.filter(a => a.isStub && a.agentDoc?.email);
  const isAllStubsSelected = stubsWithEmail.length > 0 && stubsWithEmail.every(a => selectedAgents.has(a.id));

  const toggleAgentSelection = (docId: string) => {
    const newSet = new Set(selectedAgents);
    if (newSet.has(docId)) {
      newSet.delete(docId);
    } else {
      newSet.add(docId);
    }
    setSelectedAgents(newSet);
  };

  const handleSelectAllStubs = () => {
    if (isAllStubsSelected) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(stubsWithEmail.map(a => a.id)));
    }
  };

  const handleBulkInvite = async () => {
    if (selectedAgents.size === 0) return;
    setIsSendingBulk(true);
    let successCount = 0;
    let failCount = 0;

    for (const agentId of selectedAgents) {
      const agent = agentsData.find(a => a.id === agentId);
      if (agent && agent.agentDoc?.email) {
        try {
          await sendAgentInvite(agent.agentDoc.email);
          successCount++;
        } catch (e) {
          console.error('Failed to send invite to', agent.agentDoc.email, e);
          failCount++;
        }
      }
    }

    setIsSendingBulk(false);
    setSelectedAgents(new Set());
    if (failCount === 0) {
      setToast(`נשלחו ${successCount} הזמנות בהצלחה!`);
    } else {
      setToast(`נשלחו ${successCount} הזמנות. ${failCount} נכשלו.`);
    }
    setTimeout(() => setToast(''), 3500);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">סוכנים</h1>
            {stubsWithEmail.length > 0 && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                <input
                  type="checkbox"
                  id="selectAll"
                  checked={isAllStubsSelected}
                  onChange={handleSelectAllStubs}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="selectAll" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                  בחר הכל ({stubsWithEmail.length})
                </label>
              </div>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{agentsData.length} סוכנים פעילים בצוות</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedAgents.size > 0 && (
            <button
              onClick={handleBulkInvite}
              disabled={isSendingBulk}
              className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              {isSendingBulk ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              שלח ל-{selectedAgents.size} נבחרים
            </button>
          )}
          <button
            onClick={() => setShowEmailInvite(true)}
            className="inline-flex items-center gap-2 bg-transparent border border-slate-300 hover:bg-slate-50 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Mail size={15} />
            שליחת הזמנה במייל
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <UserPlus size={15} />
            הזמן סוכן
          </button>
        </div>
      </div>

      <InviteAgentBlock />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agentsData.length > 0 ? (
          agentsData.map((agent) => (
            <div
              key={agent.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {agent.isStub && !!agent.agentDoc?.email && (
                    <div className="flex items-center justify-center p-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={selectedAgents.has(agent.id)}
                        onChange={() => toggleAgentSelection(agent.id)}
                      />
                    </div>
                  )}
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

              {/* Specialization & Area badges */}
              {((agent.agentDoc?.specializations?.length ?? 0) > 0 || (agent.agentDoc?.serviceAreas?.length ?? 0) > 0) && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">תחומי ואזורי התמחות</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(agent.agentDoc?.specializations ?? []).map((s: string) => {
                      const map: Record<string, { label: string; cls: string }> = {
                        sale: { label: '🏡 מכירה', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                        rent: { label: '🔑 השכרה', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                        commercial: { label: '🏢 מסחרי', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                      };
                      const info = map[s] ?? { label: s, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
                      return (
                        <span key={s} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${info.cls}`}>
                          {info.label}
                        </span>
                      );
                    })}
                    {(agent.agentDoc?.serviceAreas ?? []).slice(0, 3).map((area: string) => (
                      <span key={area} className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                        📍 {area}
                      </span>
                    ))}
                    {(agent.agentDoc?.serviceAreas?.length ?? 0) > 3 && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                        +{(agent.agentDoc?.serviceAreas?.length ?? 0) - 3}
                      </span>
                    )}
                  </div>
                </div>
              )}

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
                  {userData?.role === 'admin' && (
                    <>
                      {agent.isStub && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSharingAgent(agent.agentDoc);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="שתף קישור הצטרפות"
                        >
                          <Share2 size={16} />
                        </button>
                      )}
                      {agent.isStub && agent.agentDoc?.email && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!agent.agentDoc?.email) return;
                            try {
                              await sendAgentInvite(agent.agentDoc.email);
                              setToast(`הזמנה נשלחה בהצלחה ל-${agent.agentDoc.email}`);
                            } catch (err: any) {
                              if (err.code === 'already-exists' || err.message?.includes('already registered')) {
                                setToast('הסוכן כבר רשום במערכת.');
                              } else {
                                setToast('שגיאה בשליחת ההזמנה. נסה שוב מאוחר יותר.');
                              }
                            }
                            setTimeout(() => setToast(''), 3500);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="שלח הזמנה במייל"
                        >
                          <Mail size={16} />
                        </button>
                      )}
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
                            navigate('/dashboard/callcenter', { state: { agentId: agent.id } });
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="ניהול מספר וירטואלי (מרכזיה)"
                        >
                          <Phone size={16} />
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

      {showEmailInvite && (
        <EmailInviteModal
          isOpen={true}
          onClose={() => setShowEmailInvite(false)}
          onSuccess={() => {
             // The modal handles its own toast, but we can do extra stuff here if needed
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

      {sharingAgent && (
        <ShareInviteModal
          agent={sharingAgent}
          agencyName={agency?.name}
          onClose={() => setSharingAgent(null)}
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
