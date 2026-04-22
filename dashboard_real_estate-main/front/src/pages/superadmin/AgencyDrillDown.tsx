import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Agency, AppUser, Property, Lead } from '../../types';
import {
    ArrowRight,
    Building2,
    Users,
    Home,
    Contact,
    Mail,
    Phone,
    ShieldCheck,
    Briefcase,
    Activity,
    MapPin,
    AlertCircle,
    UserCircle2,
    Power,
    CalendarPlus
} from 'lucide-react';

import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

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
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${TIER_STYLES[t] ?? TIER_STYLES.starter}`}>
            {TIER_LABELS[t] ?? plan}
        </span>
    );
}

export default function AgencyDrillDown() {
    const { agencyId } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [agency, setAgency] = useState<Agency | null>(null);
    const [managers, setManagers] = useState<AppUser[]>([]);
    const [agents, setAgents] = useState<AppUser[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);

    useEffect(() => {
        if (!agencyId) return;

        let isMounted = true;
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                // 1. Fetch Agency doc
                const agencyRef = doc(db, 'agencies', agencyId);
                const agencySnap = await getDoc(agencyRef);

                if (!agencySnap.exists()) {
                    if (isMounted) {
                        setError('Agency not found');
                        setLoading(false);
                    }
                    return;
                }

                const agencyData = { id: agencySnap.id, ...agencySnap.data() } as Agency;

                // 2. Fetch Users (Admins & Agents)
                const usersRef = collection(db, 'users');
                const qUsers = query(usersRef, where('agencyId', '==', agencyId));

                // 3. Fetch Properties
                const qProps = collection(db, 'agencies', agencyId, 'properties');

                // 4. Fetch Leads
                const leadsRef = collection(db, 'leads');
                const qLeads = query(leadsRef, where('agencyId', '==', agencyId));

                const [usersSnap, propsSnap, leadsSnap] = await Promise.all([
                    getDocs(qUsers),
                    getDocs(qProps),
                    getDocs(qLeads)
                ]);

                if (isMounted) {
                    setAgency(agencyData);

                    const allUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
                    setManagers(allUsers.filter(u => u.role === 'admin'));
                    setAgents(allUsers.filter(u => u.role === 'agent'));

                    // In this version of the app, properties might not have createdAt.
                    // If they don't, we just skip sorting or sort by a fallback if available.
                    const allProps = propsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
                    // Optional sorting if createdAt gets added later
                    allProps.sort((a: any, b: any) => {
                        const timeA = a.createdAt?.toMillis?.() || 0;
                        const timeB = b.createdAt?.toMillis?.() || 0;
                        return timeB - timeA;
                    });
                    setProperties(allProps);

                    // Sort leads by createdAt desc
                    const allLeads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
                    allLeads.sort((a, b) => {
                        const timeA = (a.createdAt as any)?.toMillis?.() || 0;
                        const timeB = (b.createdAt as any)?.toMillis?.() || 0;
                        return timeB - timeA;
                    });
                    setLeads(allLeads);

                    setLoading(false);
                }
            } catch (err: any) {
                console.error('Error fetching drill-down data:', err);
                if (isMounted) {
                    setError('Failed to fetch agency data: ' + err.message);
                    setLoading(false);
                }
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [agencyId]);

    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-slate-400 gap-4" dir="rtl">
                <div className="w-10 h-10 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin"></div>
                <p className="font-medium animate-pulse">טוען נתוני סוכנות...</p>
            </div>
        );
    }

    if (error || !agency) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6" dir="rtl">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                    <AlertCircle className="w-10 h-10 text-red-400" />
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">שגיאה בטעינת נתונים</h2>
                    <p className="text-slate-400 max-w-sm mx-auto">{error || 'הסוכנות לא נמצאה'}</p>
                </div>
                <button
                    onClick={() => navigate('/dashboard/super-admin')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
                >
                    <ArrowRight className="w-4 h-4" />
                    חזרה ללוח הבקרה
                </button>
            </div>
        );
    }

    const handleUpdatePlan = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newPlan = e.target.value;
        if (!newPlan) return;

        if (!window.confirm(`האם אתה בטוח שברצונך לשנות את מנוי הסוכנות למסלול ${newPlan}?`)) {
            e.target.value = agency.planId || 'basic';
            return;
        }

        const validPlans = ['free', 'starter', 'pro', 'boutique', 'enterprise', 'basic', 'advanced', 'premium'];
        if (!validPlans.includes(newPlan.toLowerCase())) {
            alert("מסלול שגוי. יש להזין basic, advanced או premium.");
            return;
        }

        try {
            setLoading(true);
            const fn = httpsCallable<any, any>(functions, 'superadmin-superAdminUpdateAgencyPlan');
            await fn({ agencyId: agency.id, newPlanId: newPlan.toLowerCase() });
            alert("המסלול עודכן בהצלחה!");
            window.location.reload();
        } catch (err: any) {
            console.error('Update Plan Error:', err);
            alert("שגיאה בעדכון המסלול: " + err.message);
            setLoading(false);
        }
    };

    const handleReactivateBilling = async (action: 'activate' | 'extend') => {
        const confirmMsg = action === 'activate' 
            ? 'האם אתה בטוח שברצונך להפעיל את המערכת לסוכנות זו באופן קבוע?' 
            : 'האם אתה בטוח שברצונך להאריך את תקופת הניסיון ב-7 ימים נוספים?';
        
        if (!window.confirm(confirmMsg)) return;

        try {
            setLoading(true);
            const fn = httpsCallable<any, any>(functions, 'superadmin-superAdminReactivateBilling');
            await fn({ agencyId: agency.id, action });
            alert(action === 'activate' ? "המערכת הופעלה בהצלחה!" : "תקופת הניסיון הוארכה בהצלחה!");
            window.location.reload();
        } catch (err: any) {
            console.error('Billing Action Error:', err);
            alert("שגיאה בביצוע הפעולה: " + err.message);
            setLoading(false);
        }
    };

    const primaryManager = managers.length > 0 ? managers[0] : null;
    const activeProperties = properties.filter(p => p.status === 'active');

    // Fallbacks if formatting is missing
    const formatCurrency = (val: any) => {
        if (!val) return '₪0';
        return `₪${val.toLocaleString()}`;
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'לא נרשם';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.toLocaleDateString('he-IL');
    };

    return (
        <div className="min-h-full space-y-8 pb-12" dir="rtl" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
            {/* Header row with back button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/dashboard/super-admin')}
                    className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors group"
                >
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                </button>
                <div>
                    <h1 className="text-2xl font-black text-white">{agency.name || 'ללא שם'}</h1>
                    <div className="flex items-center gap-3 mt-1.5 text-sm font-medium flex-wrap">
                        <span className="text-cyan-400 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> סוכנות רשומה</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-slate-400">הוקם ב: {formatDate(agency.createdAt)}</span>
                        
                        {agency.billing?.status && (
                            <>
                                <span className="text-slate-600">|</span>
                                <span className={`flex items-center gap-1.5 ${agency.billing.status === 'active' || agency.billing.status === 'paid' ? 'text-emerald-400' : 'text-orange-400'}`}>
                                    {agency.billing.status === 'trialing' ? 'בתקופת ניסיון' : 
                                     agency.billing.status === 'active' ? 'פעיל' :
                                     agency.billing.status === 'past_due' ? 'חוב בפיגור' :
                                     agency.billing.status === 'canceled' ? 'מבוטל' : agency.billing.status}
                                </span>
                            </>
                        )}

                        {agency.billing?.trialEndsAt && (
                            <>
                                <span className="text-slate-600">|</span>
                                <span className="text-slate-400">סיום ניסיון: {formatDate(agency.billing.trialEndsAt)}</span>
                            </>
                        )}

                        {agency.planId && (
                            <>
                                <span className="text-slate-600">|</span>
                                <TierBadge plan={agency.planId} />
                                <select
                                    defaultValue={agency.planId || 'basic'}
                                    onChange={handleUpdatePlan}
                                    className="ml-2 bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 outline-none cursor-pointer hover:border-cyan-500/50 transition-colors"
                                    title="שנה מסלול מנוי"
                                >
                                    <option value="basic">בסיסי</option>
                                    <option value="advanced">Advanced</option>
                                    <option value="premium">Premium</option>
                                </select>
                            </>
                        )}
                    </div>
                </div>
                
                {/* Billing Actions */}
                <div className="mr-auto flex items-center gap-3" dir="rtl">
                    <button
                        onClick={() => handleReactivateBilling('extend')}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 text-sm font-bold transition-all disabled:opacity-50"
                    >
                        <CalendarPlus className="w-4 h-4" />
                        הארך ניסיון (7 ימים)
                    </button>
                    <button
                        onClick={() => handleReactivateBilling('activate')}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-sm font-bold transition-all disabled:opacity-50"
                    >
                        <Power className="w-4 h-4" />
                        הפעל מערכת
                    </button>
                </div>
            </div>

            {/* Manager Contact & KPIs Row */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* Manager Contact Card */}
                <div className="lg:col-span-1 border rounded-2xl bg-slate-900/60 backdrop-blur-xl p-6 relative overflow-hidden"
                    style={{
                        borderColor: 'rgba(6,182,212,0.2)',
                        boxShadow: '0 0 30px rgba(6,182,212,0.05)',
                    }}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full" />

                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-5">מנהל הסוכנות</h2>

                    {primaryManager ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                                    {primaryManager.photoURL ? (
                                        <img src={primaryManager.photoURL} alt={primaryManager.name} className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        <span className="text-cyan-400 font-bold text-lg">{primaryManager.name?.charAt(0) || 'מ'}</span>
                                    )}
                                </div>
                                <div>
                                    <p className="text-white font-bold">{primaryManager.name}</p>
                                    <p className="text-xs text-slate-400">{primaryManager.role === 'admin' ? 'מנהל ראשי' : primaryManager.role}</p>
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-slate-800">
                                <a href={`mailto:${primaryManager.email}`} className="flex items-center gap-3 text-sm text-slate-300 hover:text-cyan-400 transition-colors group">
                                    <Mail className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
                                    <span className="truncate">{primaryManager.email}</span>
                                </a>
                                {primaryManager.phone && (
                                    <a href={`tel:${primaryManager.phone}`} className="flex items-center gap-3 text-sm text-slate-300 hover:text-cyan-400 transition-colors group" dir="ltr">
                                        <Phone className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
                                        <span>{primaryManager.phone}</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-slate-500">
                            <UserCircle2 className="w-8 h-8 mb-2 opacity-50" />
                            <p className="text-sm">לא נמצא מנהל</p>
                        </div>
                    )}
                </div>

                {/* KPI Cards */}
                <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {/* Agents KPI */}
                    <div className="border rounded-2xl bg-slate-900/60 backdrop-blur-xl p-6 flex flex-col justify-center relative overflow-hidden"
                        style={{ borderColor: 'rgba(168,85,247,0.2)', boxShadow: '0 0 30px rgba(168,85,247,0.05)' }}>
                        <div className="absolute top-0 left-0 w-24 h-24 bg-purple-500/10 blur-3xl rounded-full" />
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">סה״כ סוכנים</span>
                            <div className="p-2 bg-purple-500/10 rounded-lg"><Users className="w-4 h-4 text-purple-400" /></div>
                        </div>
                        <p className="text-3xl font-black text-purple-400" style={{ textShadow: '0 0 20px rgba(168,85,247,0.4)' }}>
                            {agents.length}
                        </p>
                    </div>

                    {/* Properties KPI */}
                    <div className="border rounded-2xl bg-slate-900/60 backdrop-blur-xl p-6 flex flex-col justify-center relative overflow-hidden"
                        style={{ borderColor: 'rgba(249,115,22,0.2)', boxShadow: '0 0 30px rgba(249,115,22,0.05)' }}>
                        <div className="absolute top-0 left-0 w-24 h-24 bg-orange-500/10 blur-3xl rounded-full" />
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">נכסים פעילים</span>
                            <div className="p-2 bg-orange-500/10 rounded-lg"><Home className="w-4 h-4 text-orange-400" /></div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-3xl font-black text-orange-400" style={{ textShadow: '0 0 20px rgba(249,115,22,0.4)' }}>
                                {activeProperties.length}
                            </p>
                            <span className="text-xs text-slate-500 font-semibold">מתוך {properties.length} הוזנו</span>
                        </div>
                    </div>

                    {/* Leads KPI */}
                    <div className="border rounded-2xl bg-slate-900/60 backdrop-blur-xl p-6 flex flex-col justify-center relative overflow-hidden"
                        style={{ borderColor: 'rgba(16,185,129,0.2)', boxShadow: '0 0 30px rgba(16,185,129,0.05)' }}>
                        <div className="absolute top-0 left-0 w-24 h-24 bg-emerald-500/10 blur-3xl rounded-full" />
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">סה״כ לידים</span>
                            <div className="p-2 bg-emerald-500/10 rounded-lg"><Contact className="w-4 h-4 text-emerald-400" /></div>
                        </div>
                        <p className="text-3xl font-black text-emerald-400" style={{ textShadow: '0 0 20px rgba(16,185,129,0.4)' }}>
                            {leads.length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Detailed Data Tabs / Grids Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 1. Team List */}
                <div className="border rounded-2xl bg-slate-900/60 backdrop-blur-xl overflow-hidden flex flex-col h-[400px]" style={{ borderColor: 'rgba(148,163,184,0.1)' }}>
                    <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
                        <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-slate-400" />
                            <h3 className="text-sm font-bold text-white tracking-wide">צוות הסוכנות</h3>
                        </div>
                        <span className="text-xs font-bold text-slate-500 bg-slate-800 px-2 py-1 rounded-md">{agents.length} סוכנים</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 hide-scrollbar">
                        {agents.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-slate-500 text-sm">אין סוכנים רשומים בסוכנות זו</div>
                        ) : (
                            <div className="space-y-1">
                                {agents.map(ag => (
                                    <div key={ag.id} className="flex items-center gap-3 p-3 hover:bg-slate-800/50 rounded-xl transition-colors shrink-0">
                                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                                            {ag.photoURL ? (
                                                <img src={ag.photoURL} alt={ag.name} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                <span className="text-slate-400 text-sm font-bold">{ag.name?.charAt(0)}</span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-slate-200 truncate">{ag.name}</p>
                                            <p className="text-xs text-slate-500 truncate" dir="ltr">{ag.email}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. Latest Properties */}
                <div className="border rounded-2xl bg-slate-900/60 backdrop-blur-xl overflow-hidden flex flex-col h-[400px]" style={{ borderColor: 'rgba(249,115,22,0.1)' }}>
                    <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-orange-400" />
                            <h3 className="text-sm font-bold text-white tracking-wide">נכסים אחרונים</h3>
                        </div>
                        <span className="text-xs font-bold text-orange-400/80 bg-orange-500/10 px-2 py-1 rounded-md border border-orange-500/20">{properties.length} סה״כ</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 hide-scrollbar">
                        {properties.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-slate-500 text-sm">לא הוזנו נכסים</div>
                        ) : (
                            <div className="space-y-1">
                                {properties.slice(0, 5).map(p => (
                                    <div key={p.id} className="flex flex-col gap-1 p-3 hover:bg-slate-800/50 rounded-xl transition-colors">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-slate-200 truncate">{p.address?.fullAddress}</p>
                                            <span className="text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded shadow-sm">{formatCurrency(p.financials?.price ?? 0)}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.address?.city}</span>
                                            <span className="flex items-center gap-1"><Home className="w-3 h-3" /> {p.transactionType}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Latest Leads */}
                <div className="border rounded-2xl bg-slate-900/60 backdrop-blur-xl overflow-hidden flex flex-col h-[400px]" style={{ borderColor: 'rgba(16,185,129,0.1)' }}>
                    <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
                        <div className="flex items-center gap-2">
                            <Contact className="w-4 h-4 text-emerald-400" />
                            <h3 className="text-sm font-bold text-white tracking-wide">לידים אחרונים</h3>
                        </div>
                        <span className="text-xs font-bold text-emerald-400/80 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">{leads.length} סה״כ</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 hide-scrollbar">
                        {leads.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-slate-500 text-sm">לא הוזנו לידים</div>
                        ) : (
                            <div className="space-y-1">
                                {leads.slice(0, 5).map(l => (
                                    <div key={l.id} className="flex flex-col gap-1 p-3 hover:bg-slate-800/50 rounded-xl transition-colors">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-slate-200 truncate">{l.name}</p>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{l.status}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> <span dir="ltr">{l.phone}</span></span>
                                            {l.source && <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {l.source}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
