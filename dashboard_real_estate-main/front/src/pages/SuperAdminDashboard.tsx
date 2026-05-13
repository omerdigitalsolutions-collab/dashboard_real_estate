import { useState, useEffect } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from 'recharts';
import {
    Building2,
    Users,
    Home,
    Contact,
    ShieldCheck,
    ShieldAlert,
    Shield,
    TrendingUp,
    Activity,
    Cpu,
    RefreshCw,
    DollarSign,
    ChevronLeft,
    ChevronRight,
    Search,
    UserMinus,
    UserCheck,
    LogIn,
    AlertTriangle,
    AlertCircle,
    PlayCircle,
    Timer,
    Bot,
} from 'lucide-react';
import { useGlobalStats, AgencyRow } from '../hooks/useGlobalStats';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SystemFinancesManager from '../components/superadmin/SystemFinancesManager';
import GlobalPropertyImport from '../components/superadmin/GlobalPropertyImport';
import AgencyUsageWidget from '../components/superadmin/AgencyUsageWidget';
import SubscriptionRequestsManager from '../components/superadmin/SubscriptionRequestsManager';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../config/firebase';
import { useAuthUsers } from '../hooks/useAuthUsers';
import ActiveTrialsWidget from '../components/superadmin/ActiveTrialsWidget';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

// ─── Tooltip customisation ───────────────────────────────────────────────────
const NeonBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900/95 border border-cyan-500/30 rounded-xl px-4 py-3 shadow-[0_0_20px_rgba(6,182,212,0.2)] backdrop-blur-xl text-sm">
            <p className="text-cyan-400 font-bold mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ color: p.fill }} className="font-semibold">
                    {p.name}: <span className="text-white">{p.value}</span>
                </p>
            ))}
        </div>
    );
};

const NeonPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const entry = payload[0];
    return (
        <div className="bg-slate-900/95 border border-purple-500/30 rounded-xl px-4 py-3 shadow-[0_0_20px_rgba(168,85,247,0.2)] backdrop-blur-xl text-sm">
            <p style={{ color: entry.payload.color }} className="font-bold">{entry.name}</p>
            <p className="text-white font-semibold">{entry.value} סוכנויות</p>
        </div>
    );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────
interface KpiCardProps {
    label: string;
    value: number | string;
    icon: React.ElementType;
    glowColor: string;         // raw rgba for box-shadow
    loading?: boolean;
    subtitle?: string;
}

function KpiCard({ label, value, icon: Icon, glowColor, loading, subtitle }: KpiCardProps) {
    return (
        <div
            className="relative overflow-hidden rounded-2xl border bg-slate-900/60 backdrop-blur-xl p-5 flex flex-col gap-4 transition-all duration-300 hover:scale-[1.02]"
            style={{
                borderColor: `${glowColor}40`,
                boxShadow: `0 0 30px ${glowColor}15, inset 0 0 20px ${glowColor}05`,
            }}
        >
            {/* Background orb */}
            <div
                className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ backgroundColor: glowColor }}
            />

            <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
                <div
                    className="p-2 rounded-lg"
                    style={{ background: `${glowColor}20`, boxShadow: `0 0 10px ${glowColor}30` }}
                >
                    <Icon className="w-4 h-4" style={{ color: glowColor }} />
                </div>
            </div>

            {loading ? (
                <div className="h-9 w-24 rounded-lg bg-slate-800 animate-pulse" />
            ) : (
                <p
                    className="text-3xl font-black tabular-nums"
                    style={{
                        color: glowColor,
                        textShadow: `0 0 20px ${glowColor}80`,
                    }}
                >
                    {value}
                </p>
            )}

            {subtitle ? (
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-semibold">{subtitle}</span>
                </div>
            ) : (
                <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-semibold">פעיל</span>
                    <span className="text-xs text-slate-600 mr-1">| מערכת מחוברת</span>
                </div>
            )}
        </div>
    );
}

// ─── Status badge ─────────────────────────────────────────────────────────────


// ─── Tier badge ──────────────────────────────────────────────────────────────
const TIER_STYLES: Record<string, string> = {
    basic: 'bg-cyan-900/40 text-cyan-400 border-cyan-500/30',
    advanced: 'bg-purple-900/40 text-purple-400 border-purple-500/30',
    premium: 'bg-orange-900/40 text-orange-400 border-orange-500/30',
    // Fallback for migration
    free: 'bg-cyan-900/40 text-cyan-400 border-cyan-500/30',
    starter: 'bg-cyan-900/40 text-cyan-400 border-cyan-500/30',
    pro: 'bg-purple-900/40 text-purple-400 border-purple-500/30',
    boutique: 'bg-purple-900/40 text-purple-400 border-purple-500/30',
    enterprise: 'bg-orange-900/40 text-orange-400 border-orange-500/30',
};
const TIER_LABELS: Record<string, string> = {
    basic: 'בסיסי',
    advanced: 'Advanced',
    premium: 'Premium',
    // Fallback for migration
    free: 'בסיסי',
    starter: 'בסיסי',
    pro: 'Advanced',
    boutique: 'Advanced',
    enterprise: 'Premium'
};

function TierBadge({ plan }: { plan?: string }) {
    const t = (plan ?? 'basic').toLowerCase();
    return (
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${TIER_STYLES[t] ?? TIER_STYLES.basic}`}>
            {TIER_LABELS[t] ?? plan}
        </span>
    );
}

// ─── Pulsing dot ──────────────────────────────────────────────────────────────
function LiveDot() {
    return (
        <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
    );
}

// ─── Timestamp ────────────────────────────────────────────────────────────────
function LiveClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <span className="font-mono text-cyan-400/80 text-xs">
            {now.toLocaleString('he-IL', {
                dateStyle: 'short',
                timeStyle: 'medium',
                hour12: false,
            })}
        </span>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SuperAdminDashboard() {
    const {
        totalAgencies,
        totalUsers,
        totalActiveProperties,
        totalLeads,
        allAgencies,
        allUsers,
        monthlyGrowth,
        subscriptionBreakdown,
        expenses,
        loading,
        error: statsError
    } = useGlobalStats();

    const [activeTab, setActiveTab] = useState<'agencies' | 'users'>('agencies');
    const [agencySearch, setAgencySearch] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [agencyPage, setAgencyPage] = useState(1);
    const [userPage, setUserPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const [selectedAgency, setSelectedAgency] = useState<AgencyRow | null>(null);
    const { setUserData, userData } = useAuth();
    const { authUsers, loading: authLoading, error: authError } = useAuthUsers();
    const navigate = useNavigate();

    // ─── Homer Sales Bot state ───────────────────────────────────────────────
    const [botSettings, setBotSettings] = useState<{ isActive: boolean; mode: 'agents' | 'demo'; updatedAt?: any } | null>(null);
    const [botLoading, setBotLoading] = useState(true);
    const [botSaving, setBotSaving] = useState(false);

    useEffect(() => {
        const ref = doc(db, 'homer_settings', 'salesBot');
        const unsub = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                const d = snap.data();
                setBotSettings({ isActive: d.isActive ?? false, mode: d.mode ?? 'agents', updatedAt: d.updatedAt });
            } else {
                setBotSettings({ isActive: false, mode: 'agents' });
            }
            setBotLoading(false);
        }, () => setBotLoading(false));
        return unsub;
    }, []);

    const handleToggleBot = async () => {
        if (botSaving || !botSettings) return;
        setBotSaving(true);
        try {
            const ref = doc(db, 'homer_settings', 'salesBot');
            await setDoc(ref, {
                ...botSettings,
                isActive: !botSettings.isActive,
                updatedAt: serverTimestamp(),
                updatedBy: userData?.uid ?? 'superadmin',
            }, { merge: true });
        } catch (err: any) {
            alert('שגיאה בעדכון סטטוס הבוט: ' + err.message);
        } finally {
            setBotSaving(false);
        }
    };

    const handleBotModeChange = async (mode: 'agents' | 'demo') => {
        if (botSaving || !botSettings) return;
        setBotSaving(true);
        try {
            const ref = doc(db, 'homer_settings', 'salesBot');
            await setDoc(ref, {
                ...botSettings,
                mode,
                updatedAt: serverTimestamp(),
                updatedBy: userData?.uid ?? 'superadmin',
            }, { merge: true });
        } catch (err: any) {
            alert('שגיאה בעדכון מצב הבוט: ' + err.message);
        } finally {
            setBotSaving(false);
        }
    };

    // DEBUG: Log counts to console for developer tracing
    console.log('[DEBUG] SuperAdminDashboard State:', {
        allAgencies: allAgencies.length,
        allUsers: allUsers.length,
        authUsers: authUsers.length,
        authError,
        loading
    });

    // ─── Filtering & Pagination ──────────────────────────────────────────────
    // Merge Firestore users with Auth users
    const mergedUsers = [...allUsers];
    
    // Add users from Auth that don't exist in Firestore
    authUsers.forEach(authUser => {
        // Use u.id as it's the document ID which matches authUser.uid
        const exists = allUsers.some(u => u.id === authUser.uid || u.email === authUser.email);
        if (!exists) {
            mergedUsers.push({
                id: authUser.uid,
                uid: authUser.uid,
                email: authUser.email,
                name: authUser.displayName || 'משתמש חדש',
                createdAt: { toDate: () => new Date(authUser.createdAt) } as any,
                isRegistrationPending: true,
                role: 'agent',
                isActive: !authUser.disabled
            });
        }
    });

    const filteredAgencies = allAgencies.filter((ag) =>
        (ag.name ?? '').toLowerCase().includes(agencySearch.toLowerCase()) ||
        (ag.adminEmail ?? '').toLowerCase().includes(agencySearch.toLowerCase())
    );

    const paginatedAgencies = filteredAgencies.slice(
        (agencyPage - 1) * ITEMS_PER_PAGE,
        agencyPage * ITEMS_PER_PAGE
    );

    const filteredUsers = mergedUsers.filter((u) =>
        (u.name ?? '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email ?? '').toLowerCase().includes(userSearch.toLowerCase())
    );

    const paginatedUsers = filteredUsers.slice(
        (userPage - 1) * ITEMS_PER_PAGE,
        userPage * ITEMS_PER_PAGE
    );

    const handleUpdatePlan = async (e: React.ChangeEvent<HTMLSelectElement>, agencyId: string, currentPlan: string) => {
        e.stopPropagation();
        const newPlan = e.target.value;
        if (!newPlan) return;

        if (!window.confirm(`האם אתה בטוח שברצונך לשנות את מנוי הסוכנות למסלול ${newPlan}?`)) {
            e.target.value = currentPlan;
            return;
        }

        try {
            const fn = httpsCallable<any, any>(functions, 'superadmin-superAdminUpdateAgencyPlan');
            await fn({ agencyId, newPlanId: newPlan.toLowerCase() });
            alert("המסלול עודכן בהצלחה!");
            window.location.reload();
        } catch (err: any) {
            console.error('Update Plan Error:', err);
            alert("שגיאה בעדכון המסלול: " + err.message);
        }
    };

    const handleSetAgencyStatus = async (agencyId: string, currentStatus: string, agencyName: string) => {
        const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
        const actionText = newStatus === 'suspended' ? 'להשעות' : 'להפעיל מחדש';
        
        if (!window.confirm(`האם אתה בטוח שברצונך ${actionText} את הסוכנות "${agencyName}"?${newStatus === 'suspended' ? '\nפעולה זו תשבית גם את כל המשתמשים המשויכים.' : ''}`)) {
            return;
        }

        try {
            const fn = httpsCallable<any, any>(functions, 'superadmin-superAdminSetAgencyStatus');
            await fn({ agencyId, status: newStatus });
            alert(`הסוכנות הועברה לסטטוס ${newStatus === 'active' ? 'פעיל' : 'מושהה'} בהצלחה!`);
            window.location.reload();
        } catch (err: any) {
            console.error('Set Agency Status Error:', err);
            alert("שגיאה בעדכון סטטוס סוכנות: " + err.message);
        }
    };

    const handleApproveAgency = async (agencyId: string, agencyName: string) => {
        if (!window.confirm(`האם אתה בטוח שברצונך לאשר כניסה לסוכנות החדשה "${agencyName}"? זו פעולה שתפתח להם גישה למערכת ותשלח להם אימייל פתיחה.`)) return;

        try {
            const fn = httpsCallable<any, any>(functions, 'superadmin-superAdminApproveAgency');
            await fn({ agencyId });
            alert(`הסוכנות ${agencyName} אושרה ומשתמשיה הופעלו בהצלחה! אימייל ברוכים הבאים נשלח.`);
            window.location.reload();
        } catch (err: any) {
            console.error('Approve Agency Error:', err);
            alert("שגיאה באישור סוכנות: " + err.message);
        }
    };

    const handleSetUserStatus = async (userId: string, currentIsActive: boolean, userName: string) => {
        const newIsActive = !currentIsActive;
        const actionText = newIsActive ? 'להפעיל' : 'להשבית';

        if (!window.confirm(`האם אתה בטוח שברצונך ${actionText} את המשתמש "${userName}"?`)) {
            return;
        }

        try {
            const fn = httpsCallable<any, any>(functions, 'superadmin-superAdminSetUserStatus');
            await fn({ userId, isActive: newIsActive });
            alert(`המשתמש הועבר לסטטוס ${newIsActive ? 'פעיל' : 'מושבת'} בהצלחה!`);
            window.location.reload();
        } catch (err: any) {
            console.error('Set User Status Error:', err);
            alert("שגיאה בעדכון סטטוס משתמש: " + err.message);
        }
    };

    const handleReactivateBilling = async (agencyId: string, agencyName: string, action: 'activate' | 'extend') => {
        const actionText = action === 'activate' ? 'להפעיל את המנוי לתמיד (יסיר חסימת ניסיון) עבור' : 'להאריך את תקופת הניסיון ב-7 ימים עבור';
        if (!window.confirm(`האם אתה בטוח שברצונך ${actionText} הסוכנות "${agencyName}"?`)) {
            return;
        }

        try {
            const fn = httpsCallable<any, any>(functions, 'superadmin-superAdminReactivateBilling');
            await fn({ agencyId, action });
            alert(`הפעולה בוצעה בהצלחה!`);
            window.location.reload();
        } catch (err: any) {
            console.error('Reactivate Billing Error:', err);
            alert("שגיאה בביצוע הפעולה: " + err.message);
        }
    };

    return (
        <div
            className="min-h-full space-y-8 pb-12"
            dir="rtl"
            style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
        >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div
                        className="p-3 rounded-2xl"
                        style={{
                            background: 'rgba(6,182,212,0.1)',
                            boxShadow: '0 0 20px rgba(6,182,212,0.3)',
                            border: '1px solid rgba(6,182,212,0.3)',
                        }}
                    >
                        <Shield className="w-7 h-7 text-cyan-400" />
                    </div>
                    <div>
                        <h1
                            className="text-2xl font-black uppercase tracking-widest"
                            style={{
                                background: 'linear-gradient(90deg, #06b6d4 0%, #a855f7 60%, #f97316 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                textShadow: 'none',
                                filter: 'drop-shadow(0 0 12px rgba(6,182,212,0.5))',
                            }}
                        >
                            SUPER ADMIN — CONTROL CENTER
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <LiveDot />
                            <span className="text-xs text-slate-500 font-medium">מחובר לפלטפורמה HOMER</span>
                            <span className="text-slate-700 mx-1">|</span>
                            <LiveClock />
                        </div>
                    </div>
                </div>

                {loading && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        טוען נתוני מערכת...
                    </div>
                )}
                <button
                    onClick={async () => {
                        if (!window.confirm('האם לעדכן הרשאות סופר אדמין?')) return;
                        try {
                            const { httpsCallable } = await import('firebase/functions');
                            const { functions } = await import('../config/firebase');
                            const setupFn = httpsCallable(functions, 'superadmin-superAdminHealSelf');
                            const res = await setupFn();
                            alert((res.data as any).message || 'ההרשאות עודכנו. אנא בצע התנתקות והתחברות מחדש.');
                            window.location.reload();
                        } catch (e: any) {
                            alert('שגיאה: ' + e.message);
                        }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500/20 transition-all ml-4"
                >
                    תיקון הרשאות סופר אדמין
                </button>
            </div>

            {/* ── KPI Cards ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="סה״כ סוכנויות"
                    value={totalAgencies}
                    icon={Building2}
                    glowColor="#06b6d4"
                    loading={loading}
                />
                <KpiCard
                    label="משתמשים פעילים"
                    value={totalUsers}
                    icon={Users}
                    glowColor="#a855f7"
                    loading={loading}
                />
                <KpiCard
                    label="נכסים פעילים"
                    value={totalActiveProperties}
                    icon={Home}
                    glowColor="#f97316"
                    loading={loading}
                />
                <KpiCard
                    label="סה״כ לידים"
                    value={totalLeads}
                    icon={Contact}
                    glowColor="#10b981"
                    loading={loading}
                />
                <KpiCard
                    label="הוצאות החודש"
                    value={expenses ? `$${expenses.total.toFixed(2)}` : '$0'}
                    icon={DollarSign}
                    glowColor="#f43f5e"
                    loading={loading}
                    subtitle={
                        expenses
                            ? `$${expenses.fixed} מנויים | $${expenses.variable} ענן | $${expenses.marketing} שיווק`
                            : ''
                    }
                />
            </div>

            {/* ── Subscription Requests ─────────────────────────────────────── */}
            <SubscriptionRequestsManager />

            {/* ── Active Trials ────────────────────────────────────────────── */}
            {/* Global Error Banner */}
            {(statsError || authError) && (
                <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-md flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                    </div>
                    <div className="flex-1 space-y-1">
                        <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider">Storage Error / שגיאת נתונים</h3>
                        <p className="text-sm text-slate-400">
                            {statsError && <span>Firestore: {statsError} </span>}
                            {authError && <span>Auth List: {authError}</span>}
                        </p>
                        <p className="text-xs text-slate-500 italic mt-2">
                           * וודא שביצעת deploy לפונקציות ה-superadmin ושיש לך הרשאות מתאימות.
                        </p>
                    </div>
                </div>
            )}

            <ActiveTrialsWidget />

            {/* ── Finances & Import ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                <SystemFinancesManager />
                <GlobalPropertyImport />
            </div>

            {/* ── Charts Row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bar Chart */}
                <div
                    className="lg:col-span-2 rounded-2xl border bg-slate-900/60 backdrop-blur-xl p-6"
                    style={{
                        borderColor: 'rgba(6,182,212,0.2)',
                        boxShadow: '0 0 30px rgba(6,182,212,0.05)',
                    }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <Activity className="w-5 h-5 text-cyan-400" />
                        <h2
                            className="text-xs font-bold uppercase tracking-widest text-slate-400"
                            style={{ letterSpacing: '0.15em' }}
                        >
                            SYSTEM GROWTH — 6 חודשים אחרונים
                        </h2>
                    </div>

                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlyGrowth} barGap={8}>
                            <XAxis
                                dataKey="month"
                                tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'inherit' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'inherit' }}
                                axisLine={false}
                                tickLine={false}
                                width={28}
                            />
                            <Tooltip content={<NeonBarTooltip />} cursor={{ fill: 'rgba(6,182,212,0.05)' }} />
                            <Bar
                                dataKey="agencies"
                                name="סוכנויות"
                                fill="#06b6d4"
                                radius={[6, 6, 0, 0]}
                                style={{ filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.6))' }}
                            />
                            <Bar
                                dataKey="users"
                                name="משתמשים"
                                fill="#a855f7"
                                radius={[6, 6, 0, 0]}
                                style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.6))' }}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Pie Chart */}
                <div
                    className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl p-6"
                    style={{
                        borderColor: 'rgba(168,85,247,0.2)',
                        boxShadow: '0 0 30px rgba(168,85,247,0.05)',
                    }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <Cpu className="w-5 h-5 text-purple-400" />
                        <h2
                            className="text-xs font-bold uppercase tracking-widest text-slate-400"
                            style={{ letterSpacing: '0.15em' }}
                        >
                            SUBSCRIPTION PLANS
                        </h2>
                    </div>

                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie
                                data={subscriptionBreakdown}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={85}
                                paddingAngle={4}
                                dataKey="value"
                                strokeWidth={0}
                            >
                                {subscriptionBreakdown.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.color}
                                        style={{ filter: `drop-shadow(0 0 8px ${entry.color}80)` }}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<NeonPieTooltip />} />
                            <Legend
                                formatter={(value) => (
                                    <span className="text-xs text-slate-400">{value}</span>
                                )}
                                wrapperStyle={{ paddingTop: '12px' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>

                    {/* Numeric legend */}
                    <div className="mt-4 space-y-2">
                        {subscriptionBreakdown.map((item) => (
                            <div key={item.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{
                                            backgroundColor: item.color,
                                            boxShadow: `0 0 6px ${item.color}`,
                                        }}
                                    />
                                    <span className="text-xs text-slate-500">{item.name}</span>
                                </div>
                                <span className="text-xs font-bold" style={{ color: item.color }}>
                                    {item.value}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Tabs & Content ────────────────────────────────────────── */}
            <div className="space-y-6">
                <div className="flex border-b border-slate-800">
                    <button
                        onClick={() => setActiveTab('agencies')}
                        className={`px-6 py-3 text-sm font-bold tracking-widest uppercase transition-all border-b-2 ${
                            activeTab === 'agencies'
                                ? 'text-cyan-400 border-cyan-400 shadow-[0_4px_12px_rgba(6,182,212,0.2)]'
                                : 'text-slate-500 border-transparent hover:text-slate-300'
                        }`}
                    >
                        ניהול סוכנויות
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-6 py-3 text-sm font-bold tracking-widest uppercase transition-all border-b-2 ${
                            activeTab === 'users'
                                ? 'text-purple-400 border-purple-400 shadow-[0_4px_12px_rgba(168,85,247,0.2)]'
                                : 'text-slate-500 border-transparent hover:text-slate-300'
                        }`}
                    >
                        ניהול משתמשים
                    </button>
                </div>

                {activeTab === 'agencies' ? (
                    <div
                        className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl overflow-hidden"
                        style={{
                            borderColor: 'rgba(6,182,212,0.2)',
                            boxShadow: '0 0 30px rgba(6,182,212,0.05)',
                        }}
                    >
                        {/* Agencies Table header */}
                        <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <Building2 className="w-5 h-5 text-cyan-400" />
                                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                    AGENCIES MANAGEMENT — ניהול סוכנויות
                                </h2>
                            </div>
                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="חיפוש סוכנות..."
                                    value={agencySearch}
                                    onChange={(e) => { setAgencySearch(e.target.value); setAgencyPage(1); }}
                                    className="w-full sm:w-64 pr-10 pl-4 py-2 text-sm rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right">
                                <thead>
                                    <tr className="border-b border-slate-800">
                                        {['סוכנות', 'מנהל', 'תחילת ניסיון', 'מנוי', 'סטטוס', 'פעולות'].map((h) => (
                                            <th key={h} className="px-6 py-3 text-right text-xs font-bold uppercase text-slate-600">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="border-b border-slate-800/50">
                                                {Array.from({ length: 6 }).map((__, j) => (
                                                    <td key={j} className="px-6 py-4"><div className="h-4 rounded bg-slate-800 animate-pulse" /></td>
                                                ))}
                                            </tr>
                                        ))
                                    ) : paginatedAgencies.length === 0 ? (
                                        <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-600">לא נמצאו סוכנויות</td></tr>
                                    ) : (
                                        paginatedAgencies.map((ag) => (
                                            <tr
                                                key={ag.id}
                                                className="group border-b border-slate-800/50 hover:bg-cyan-500/5 transition-colors cursor-pointer"
                                                onClick={() => setSelectedAgency(prev => prev?.id === ag.id ? null : ag)}
                                                style={selectedAgency?.id === ag.id ? { background: 'rgba(6,182,212,0.08)' } : undefined}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black bg-cyan-900/20 text-cyan-400 border border-cyan-500/20">
                                                            {(ag.name ?? 'A').charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="font-semibold text-slate-200">{ag.name ?? 'ללא שם'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-slate-500 font-mono text-xs">{ag.adminEmail ?? '—'}</td>
                                                <td className="px-6 py-4 text-slate-500 text-xs">{ag.createdAt?.toDate ? ag.createdAt.toDate().toLocaleDateString('he-IL') : '—'}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                        <TierBadge plan={ag.planId} />
                                                        <select
                                                            defaultValue={ag.planId || 'basic'}
                                                            onChange={(e) => handleUpdatePlan(e, ag.id, ag.planId || 'basic')}
                                                            className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 outline-none cursor-pointer"
                                                        >
                                                            <option value="basic">בסיסי</option>
                                                            <option value="advanced">Advanced</option>
                                                            <option value="premium">Premium</option>
                                                        </select>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {ag.status === 'pending_approval' ? (
                                                        <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-amber-900/40 text-amber-500 border border-amber-500/30 animate-pulse">ממתין לאישור</span>
                                                    ) : ag.status === 'suspended' ? (
                                                        <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-red-900/40 text-red-500 border border-red-500/30">מושהה</span>
                                                    ) : (
                                                        <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">פעיל</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                        {ag.status === 'pending_approval' && (
                                                            <button
                                                                onClick={() => handleApproveAgency(ag.id, ag.name ?? 'ללא שם')}
                                                                className="p-1.5 rounded-lg border transition-all bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:scale-110"
                                                                title="אשר סוכנות ופתח גישה למערכת"
                                                            >
                                                                <UserCheck className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleSetAgencyStatus(ag.id, ag.status || 'active', ag.name)}
                                                            className={`p-1.5 rounded-lg border transition-all ${
                                                                ag.status === 'suspended'
                                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                                                                    : 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20'
                                                            }`}
                                                            title={ag.status === 'suspended' ? 'הפעל סוכנות' : 'השהה סוכנות'}
                                                        >
                                                            {ag.status === 'suspended' ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm(`התחבר כמנהל לסוכנות "${ag.name}"?`)) {
                                                                    if (userData) {
                                                                        // @ts-ignore
                                                                        setUserData({ ...userData, agencyId: ag.id });
                                                                        navigate('/');
                                                                    }
                                                                }
                                                            }}
                                                            className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
                                                            title="התחבר כמנהל"
                                                        >
                                                            <LogIn className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReactivateBilling(ag.id, ag.name ?? 'ללא שם', 'extend')}
                                                            className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
                                                            title="הארך תקופת ניסיון (7 ימים)"
                                                        >
                                                            <Timer className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReactivateBilling(ag.id, ag.name ?? 'ללא שם', 'activate')}
                                                            className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
                                                            title="המשך לאחר תקופת ניסיון (הפעל מנוי גישה מלאה)"
                                                        >
                                                            <PlayCircle className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Agencies */}
                        {filteredAgencies.length > ITEMS_PER_PAGE && (
                            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
                                <span className="text-xs text-slate-500">מציג {paginatedAgencies.length} מתוך {filteredAgencies.length} סוכנויות</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={agencyPage === 1}
                                        onClick={() => setAgencyPage(prev => prev - 1)}
                                        className="p-1.5 rounded-lg border border-slate-700 text-slate-400 disabled:opacity-30"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <span className="text-xs font-bold text-slate-300 px-2">{agencyPage}</span>
                                    <button
                                        disabled={agencyPage >= Math.ceil(filteredAgencies.length / ITEMS_PER_PAGE)}
                                        onClick={() => setAgencyPage(prev => prev + 1)}
                                        className="p-1.5 rounded-lg border border-slate-700 text-slate-400 disabled:opacity-30"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl overflow-hidden"
                        style={{
                            borderColor: 'rgba(168,85,247,0.2)',
                            boxShadow: '0 0 30px rgba(168,85,247,0.05)',
                        }}
                    >
                        {/* Users Table header */}
                        <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <Users className="w-5 h-5 text-purple-400" />
                                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                    USERS MANAGEMENT — ניהול משתמשים
                                </h2>
                            </div>
                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="חיפוש משתמש..."
                                    value={userSearch}
                                    onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                                    className="w-full sm:w-64 pr-10 pl-4 py-2 text-sm rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right">
                                <thead>
                                    <tr className="border-b border-slate-800">
                                        {['משתמש', 'אימייל', 'סוכנות', 'הרשמה וניסיון', 'מנוי', 'תפקיד', 'סטטוס', 'פעולות'].map((h) => (
                                            <th key={h} className="px-6 py-3 text-right text-xs font-bold uppercase text-slate-600">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="border-b border-slate-800/50">
                                                {Array.from({ length: 8 }).map((__, j) => (
                                                    <td key={j} className="px-6 py-4"><div className="h-4 rounded bg-slate-800 animate-pulse" /></td>
                                                ))}
                                            </tr>
                                        ))
                                    ) : paginatedUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-10 text-center text-slate-600">
                                                לא נמצאו משתמשים. 
                                                <div className="text-xs mt-2 text-slate-700">
                                                    Firestore: {allUsers.length} | Auth: {authUsers.length}
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedUsers.map((u) => {
                                            const agency = allAgencies.find(a => a.id === u.agencyId);
                                            return (
                                                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-purple-500/5 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black bg-purple-900/20 text-purple-400 border border-purple-500/20">
                                                                {(u.name ?? 'U').charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-slate-200">{u.name ?? 'ללא שם'}</span>
                                                                {u.isRegistrationPending && (
                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Registration Pending</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">{u.email}</td>
                                                    <td className="px-6 py-4 text-slate-400 text-xs font-medium">{agency?.name ?? 'סוכנות לא ידועה'}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1 text-[11px]">
                                                            <span className="text-slate-300">
                                                                הרשמה: {u.createdAt && typeof u.createdAt.toDate === 'function' ? u.createdAt.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                                                            </span>
                                                            <span className="text-slate-500">
                                                                סיום נסיון: {agency?.billing?.trialEndsAt && typeof agency.billing.trialEndsAt.toDate === 'function' ? agency.billing.trialEndsAt.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col items-start gap-1.5">
                                                            <TierBadge plan={agency?.planId} />
                                                            {(() => {
                                                                if (u.isRegistrationPending) return <span className="text-[10px] bg-slate-800/80 text-slate-500 border border-slate-700/50 px-2 py-0.5 rounded font-bold">רישום בהמתנה</span>;

                                                                const isTrialing = agency?.billing?.status === 'trialing';
                                                                const trialEndsAt = agency?.billing?.trialEndsAt && typeof agency.billing.trialEndsAt.toDate === 'function' ? agency.billing.trialEndsAt.toDate() : null;
                                                                const isTrialExpired = trialEndsAt && new Date() > trialEndsAt;
                                                                
                                                                if (isTrialing && !isTrialExpired) return <span className="text-[10px] bg-blue-900/40 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-bold">בתקופת ניסיון</span>;
                                                                if (isTrialing && isTrialExpired) return <span className="text-[10px] bg-red-900/40 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-bold">ניסיון הסתיים</span>;
                                                                if (agency?.billing?.status === 'active' || agency?.billing?.status === 'paid') return <span className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">מנוי פעיל</span>;
                                                                if (agency?.billing?.status === 'canceled' || agency?.billing?.status === 'past_due') return <span className="text-[10px] bg-red-900/40 text-red-500 border border-red-500/30 px-2 py-0.5 rounded font-bold">מנוי מבוטל</span>;
                                                                return <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded font-bold">ללא נתונים</span>;
                                                            })()}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                            u.role === 'admin' ? 'bg-orange-900/30 text-orange-400 border-orange-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'
                                                        }`}>
                                                            {u.role === 'admin' ? 'ADMIN' : 'AGENT'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {u.isActive === false ? (
                                                            <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-red-900/40 text-red-500 border border-red-500/30">מושבת</span>
                                                        ) : (
                                                            <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">פעיל</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <button
                                                            onClick={() => handleSetUserStatus(u.id, u.isActive !== false, u.name)}
                                                            className={`p-1.5 rounded-lg border transition-all ${
                                                                u.isActive === false
                                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                                                                    : 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20'
                                                            }`}
                                                            title={u.isActive === false ? 'הפעל משתמש' : 'השבת משתמש'}
                                                        >
                                                            {u.isActive === false ? <UserCheck className="w-4 h-4" /> : <UserMinus className="w-4 h-4" />}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Users */}
                        {filteredUsers.length > ITEMS_PER_PAGE && (
                            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
                                <span className="text-xs text-slate-500">מציג {paginatedUsers.length} מתוך {filteredUsers.length} משתמשים</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={userPage === 1}
                                        onClick={() => setUserPage(prev => prev - 1)}
                                        className="p-1.5 rounded-lg border border-slate-700 text-slate-400 disabled:opacity-30"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <span className="text-xs font-bold text-slate-300 px-2">{userPage}</span>
                                    <button
                                        disabled={userPage >= Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)}
                                        onClick={() => setUserPage(prev => prev + 1)}
                                        className="p-1.5 rounded-lg border border-slate-700 text-slate-400 disabled:opacity-30"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Drill-down UI (only for agencies) */}
                {activeTab === 'agencies' && selectedAgency && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                        <AgencyUsageWidget agencyId={selectedAgency.id} agencyName={selectedAgency.name ?? undefined} />
                    </div>
                )}

                {/* ── Homer Sales Bot ─────────────────────────────────────── */}
                <div
                    className="rounded-2xl border p-6"
                    style={{
                        background: 'rgba(15,23,42,0.8)',
                        borderColor: 'rgba(6,182,212,0.2)',
                        boxShadow: '0 0 30px rgba(6,182,212,0.05)',
                    }}
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div
                            className="p-2.5 rounded-xl"
                            style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)' }}
                        >
                            <Bot className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">בוט מכירות הומר</h2>
                            <p className="text-xs text-slate-400">מנהל שיחות וואצפ עם בעלי משרדי תיווך שמתעניינים במערכת</p>
                        </div>
                    </div>

                    {botLoading ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>טוען...</span>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Mode selector */}
                            <div>
                                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">מצב בוט</p>
                                <div className="flex gap-3">
                                    {(['agents', 'demo'] as const).map((m) => (
                                        <button
                                            key={m}
                                            onClick={() => handleBotModeChange(m)}
                                            disabled={botSaving}
                                            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                                                botSettings?.mode === m
                                                    ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                                                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500'
                                            }`}
                                        >
                                            {m === 'agents' ? 'סוכני נדלן' : 'הדגמת מערכת'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Toggle */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-white">סטטוס</p>
                                    {botSettings?.updatedAt && (
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            עודכן לאחרונה:{' '}
                                            {botSettings.updatedAt.toDate?.().toLocaleString('he-IL', {
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            }) ?? '—'}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={handleToggleBot}
                                    disabled={botSaving}
                                    className={`relative inline-flex h-8 w-16 items-center rounded-full border-2 transition-all duration-300 ${
                                        botSettings?.isActive
                                            ? 'bg-cyan-500/30 border-cyan-500/60'
                                            : 'bg-slate-700/50 border-slate-600'
                                    } ${botSaving ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:opacity-90'}`}
                                    title={botSettings?.isActive ? 'כבה בוט' : 'הפעל בוט'}
                                >
                                    <span
                                        className={`inline-block h-5 w-5 transform rounded-full shadow-lg transition-transform duration-300 ${
                                            botSettings?.isActive
                                                ? 'translate-x-8 bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                                                : 'translate-x-1 bg-slate-400'
                                        }`}
                                    />
                                </button>
                            </div>

                            {/* Status badge */}
                            <div className="flex items-center gap-2">
                                {botSettings?.isActive ? (
                                    <>
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                                        </span>
                                        <span className="text-xs font-semibold text-cyan-400">פעיל — עונה להודעות נכנסות</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-500" />
                                        </span>
                                        <span className="text-xs font-semibold text-slate-500">כבוי</span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}
