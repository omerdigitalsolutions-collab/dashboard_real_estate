import { useState, useEffect } from 'react';
import { UserPlus, MoreVertical, ShieldCheck, ShieldOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AppUser, UserRole } from '../../types';
import { getAgencyTeam, updateAgentRole, toggleAgentStatus } from '../../services/teamService';
import InviteAgentModal from './InviteAgentModal';

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
}: {
    member: AppUser;
    isSelf: boolean;
    onRoleChange: (uid: string, current: UserRole) => void;
    onStatusToggle: (uid: string, current: boolean) => void;
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
                            onClick={() => { onRoleChange(member.uid, member.role); setOpen(false); }}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <RefreshCw size={14} className="text-slate-400" />
                            שנה ל{member.role === 'admin' ? 'סוכן' : 'מנהל'}
                        </button>
                        <button
                            onClick={() => { onStatusToggle(member.uid, isActive); setOpen(false); }}
                            className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors ${isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                        >
                            {isActive ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                            {isActive ? 'השעה' : 'הפעל מחדש'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default function TeamManagement() {
    const { userData, currentUser } = useAuth();
    const [team, setTeam] = useState<AppUser[]>([]);
    const [showInvite, setShowInvite] = useState(false);
    const [toast, setToast] = useState('');
    const [loading, setLoading] = useState(true);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3500);
    };

    useEffect(() => {
        if (!userData?.agencyId) return;
        const unsub = getAgencyTeam(userData.agencyId, (members) => {
            setTeam(members);
            setLoading(false);
        });
        return unsub;
    }, [userData?.agencyId]);

    const handleRoleChange = async (docId: string, currentRole: UserRole) => {
        try {
            const newRole: UserRole = currentRole === 'admin' ? 'agent' : 'admin';
            await updateAgentRole(docId, newRole);
            showToast('התפקיד עודכן בהצלחה');
        } catch {
            showToast('עדכון התפקיד נכשל');
        }
    };

    const handleStatusToggle = async (docId: string, currentlyActive: boolean) => {
        try {
            await toggleAgentStatus(docId, !currentlyActive);
            showToast(currentlyActive ? 'הסוכן הושעה' : 'הסוכן הופעל מחדש');
        } catch {
            showToast('עדכון הסטטוס נכשל');
        }
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-bold text-slate-900">ניהול צוות</h2>
                    <p className="text-sm text-slate-400 mt-0.5">{team.length} חברי צוות</p>
                </div>
                <button
                    onClick={() => setShowInvite(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                >
                    <UserPlus size={16} />
                    הזמן סוכן
                </button>
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
                                    <tr key={member.uid || member.email} className="hover:bg-slate-50/50 transition-colors">
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
                                            <ActionMenu
                                                member={member}
                                                isSelf={isSelf}
                                                onRoleChange={handleRoleChange}
                                                onStatusToggle={handleStatusToggle}
                                            />
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

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl z-50 animate-fade-in">
                    {toast}
                </div>
            )}
        </div>
    );
}
