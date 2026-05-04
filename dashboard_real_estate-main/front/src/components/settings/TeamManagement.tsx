import { useState, useEffect } from 'react';
import { UserPlus, MoreVertical, ShieldCheck, ShieldOff, RefreshCw, Trash2, Percent, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAgency } from '../../hooks/useFirestoreData';
import { AppUser, UserRole } from '../../types';
import { getAgencyTeam, updateAgentRole, toggleAgentStatus, deleteAgent } from '../../services/teamService';
import { updateFranchiseSettings } from '../../services/agencyService';
import InviteAgentModal from './InviteAgentModal';
import AddAgentManuallyModal from './AddAgentManuallyModal';
import EditAgentModal from '../modals/EditAgentModal';
import toast from 'react-hot-toast';

const RoleBadge = ({ role }: { role: UserRole }) =>
    role === 'admin' ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
            <ShieldCheck size={11} />
            מנהל
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            סוכן
        </span>
    );

const StatusBadge = ({ isActive }: { isActive?: boolean }) =>
    isActive !== false ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
            פעיל
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
            מושעה
        </span>
    );

function ActionMenu({
    member,
    isSelf,
    onRoleChange,
    onStatusToggle,
    onDelete,
    onEdit,
}: {
    member: AppUser;
    isSelf: boolean;
    onRoleChange: (uid: string, current: UserRole) => void;
    onStatusToggle: (uid: string, current: boolean) => void;
    onDelete: (uid: string) => void;
    onEdit: (member: AppUser) => void;
}) {
    const [open, setOpen] = useState(false);
    const isActive = member.isActive !== false;

    if (isSelf) {
        return (
            <span className="text-xs text-slate-300 italic">הגדרות עצמיות</span>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
                <MoreVertical size={16} />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-8 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-[160px]">
                        <button
                            onClick={() => { onEdit(member); setOpen(false); }}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <RefreshCw size={14} className="text-slate-400" />
                            עריכת פרטים ועמלה
                        </button>
                        <div className="h-px bg-slate-100 my-1" />
                        <button
                            onClick={() => { if (member.id) onRoleChange(member.id, member.role); setOpen(false); }}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <RefreshCw size={14} className="text-slate-400" />
                            שנה ל{member.role === 'admin' ? 'סוכן' : 'מנהל'}
                        </button>
                        <button
                            onClick={() => { if (member.id) onStatusToggle(member.id, isActive); setOpen(false); }}
                            className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors ${isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                        >
                            {isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                            {isActive ? 'השעה' : 'הפעל מחדש'}
                        </button>
                        <div className="h-px bg-slate-100 my-1" />
                        <button
                            onClick={() => { if (member.id) onDelete(member.id); setOpen(false); }}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <Trash2 size={14} />
                            מחק לצמיתות
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default function TeamManagement() {
    const { userData, currentUser } = useAuth();
    const { agency } = useAgency();
    const [team, setTeam] = useState<AppUser[]>([]);
    const [showInvite, setShowInvite] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editingAgent, setEditingAgent] = useState<AppUser | null>(null);

    // Franchise settings state
    const [franchisePercent, setFranchisePercent] = useState<number>(0);
    const [monthlyFranchiseFee, setMonthlyFranchiseFee] = useState<number | ''>('');
    const [franchiseSaving, setFranchiseSaving] = useState(false);

    const showToast = (msg: string) => {
        toast.success(msg);
    };

    useEffect(() => {
        if (!userData?.agencyId) return;
        const unsub = getAgencyTeam(userData.agencyId, (members) => {
            setTeam(members);
            setLoading(false);
        });
        return unsub;
    }, [userData?.agencyId]);

    useEffect(() => {
        if (!agency) return;
        setFranchisePercent(agency.settings?.franchisePercent ?? 0);
        setMonthlyFranchiseFee(agency.settings?.monthlyFranchiseFee || '');
    }, [agency]);

    const handleRoleChange = async (docId: string, currentRole: UserRole) => {
        try {
            const newRole: UserRole = currentRole === 'admin' ? 'agent' : 'admin';
            await updateAgentRole(docId, newRole);
            showToast('התפקיד עודכן בהצלחה');
        } catch (err: any) {
            toast.error(err?.message || 'עדכון התפקיד נכשל');
        }
    };

    const handleStatusToggle = async (docId: string, currentlyActive: boolean) => {
        try {
            await toggleAgentStatus(docId, !currentlyActive);
            showToast(currentlyActive ? 'הסוכן הושעה' : 'הסוכן הופעל מחדש');
        } catch (err: any) {
            toast.error(err?.message || 'עדכון הסטטוס נכשל');
        }
    };

    const handleDelete = async (docId: string) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק את הסוכן? פעולה זו היא בלתי הפיכה.')) return;
        try {
            await deleteAgent(docId);
            showToast('הסוכן נמחק מהמערכת');
        } catch (err: any) {
            toast.error(err?.message || 'מחיקת הסוכן נכשלה');
        }
    };

    const handleFranchiseSave = async () => {
        if (!userData?.agencyId) return;
        setFranchiseSaving(true);
        try {
            await updateFranchiseSettings(
                userData.agencyId,
                franchisePercent,
                monthlyFranchiseFee === '' ? 0 : monthlyFranchiseFee
            );
            toast.success('הגדרות זכיינות נשמרו בהצלחה');
        } catch (err: any) {
            toast.error(err?.message || 'שגיאה בשמירת הגדרות זכיינות');
        } finally {
            setFranchiseSaving(false);
        }
    };

    return (
        <div className="space-y-5" dir="rtl">
            {/* Franchise / Commission Settings Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center">
                        <Percent size={16} className="text-amber-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">הגדרות עמלות</h3>
                        <p className="text-xs text-slate-400">הגדר את דמי הזכיינות — ינוכו אוטומטית בדוח רווח והפסד</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Franchise Percent */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            אחוז עמלת זכיינות (%)
                            <span className="text-slate-400 font-normal mr-1">— מתוך עמלת המשרד</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min={0}
                                max={100}
                                step={0.5}
                                value={franchisePercent}
                                onChange={e => setFranchisePercent(Number(e.target.value))}
                                className="flex-1 accent-amber-500"
                            />
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    value={franchisePercent}
                                    onChange={e => setFranchisePercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                                    className="w-16 border border-slate-200 rounded-xl px-2.5 py-2 text-sm text-slate-700 text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 bg-slate-50 focus:bg-white"
                                />
                                <span className="text-sm text-slate-500">%</span>
                            </div>
                        </div>
                    </div>

                    {/* Monthly Franchise Fee */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                            דמי זכיינות חודשיים (₪)
                            <span className="text-slate-400 font-normal mr-1">— לא חובה</span>
                        </label>
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min={0}
                                step={100}
                                placeholder="0"
                                value={monthlyFranchiseFee}
                                onChange={e => setMonthlyFranchiseFee(e.target.value === '' ? '' : Number(e.target.value))}
                                className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 bg-slate-50 focus:bg-white"
                            />
                            <span className="text-sm text-slate-500">₪</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-400">ברירת מחדל: 0%. מנוכה אוטומטית מרווח המשרד בדוח רווח והפסד.</p>
                    <button
                        onClick={handleFranchiseSave}
                        disabled={franchiseSaving}
                        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                    >
                        {franchiseSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                        שמור הגדרות
                    </button>
                </div>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-bold text-slate-900">ניהול צוות</h2>
                    <p className="text-sm text-slate-400 mt-0.5">{team.length} חברי צוות</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowManual(true)}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                        <UserPlus size={16} />
                        הוסף ידנית
                    </button>
                    <button
                        onClick={() => setShowInvite(true)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                        <UserPlus size={16} />
                        הזמן סוכן
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="py-16 text-center text-sm text-slate-400">טוען חברי צוות...</div>
                ) : team.length === 0 ? (
                    <div className="py-16 text-center">
                        <p className="text-sm font-medium text-slate-600">אין חברי צוות עדיין</p>
                        <p className="text-xs text-slate-400 mt-1">הזמן את הסוכן הראשון שלך</p>
                    </div>
                ) : (
                    <table className="w-full text-right" dir="rtl">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 text-right">שם</th>
                                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 text-right">אימייל</th>
                                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 text-right">תפקיד</th>
                                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 text-right">סטטוס</th>
                                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 text-right">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {team.map((member) => {
                                const isSelf = member.uid === currentUser?.uid || member.email === currentUser?.email;
                                const isLinked = !!member.uid;

                                return (
                                    <tr key={member.id || member.email} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                    {member.name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800">{member.name}</p>
                                                    {!isLinked && (
                                                        <p className="text-[10px] text-amber-600 font-medium mt-0.5">ממתין לחיבור</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-500" dir="ltr">{member.email}</td>
                                        <td className="px-5 py-4"><RoleBadge role={member.role} /></td>
                                        <td className="px-5 py-4"><StatusBadge isActive={member.isActive} /></td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2">
                                                {member.commissionPercent !== undefined && (
                                                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">
                                                        {member.commissionPercent}%
                                                    </span>
                                                )}
                                                <ActionMenu
                                                    member={member}
                                                    isSelf={isSelf}
                                                    onRoleChange={handleRoleChange}
                                                    onStatusToggle={handleStatusToggle}
                                                    onDelete={handleDelete}
                                                    onEdit={setEditingAgent}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modals */}
            {showInvite && (
                <InviteAgentModal
                    onClose={() => setShowInvite(false)}
                    onSuccess={() => {
                        setShowInvite(false);
                        showToast('הסוכן הוזמן בהצלחה! 🎉');
                    }}
                />
            )}

            {showManual && (
                <AddAgentManuallyModal
                    onClose={() => setShowManual(false)}
                    onSuccess={() => {
                        showToast('הסוכן נוסף בהצלחה! 🎉');
                    }}
                />
            )}

            {editingAgent && (
                <EditAgentModal
                    agent={editingAgent}
                    isOpen={true}
                    onClose={() => setEditingAgent(null)}
                    onSuccess={(msg) => { showToast(msg); setEditingAgent(null); }}
                />
            )}

        </div>
    );
}
