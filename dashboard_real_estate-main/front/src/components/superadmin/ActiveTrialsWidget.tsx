import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, Timestamp, doc, getDoc, getDocs, where, limit } from 'firebase/firestore';
import { db, functions } from '../../config/firebase';
import { Clock, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Search, PlayCircle, Timer } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';

interface ActiveTrial {
    id: string;
    agencyId: string;
    uid: string;
    agencyName?: string;
    adminEmail?: string;
    planId?: string;
    createdAt?: Timestamp; // Mapping to trialStartedAt
    trialEndsAt?: Timestamp;
    status?: string;
    [key: string]: any;
}

interface EnrichedData {
    name: string;
    email: string;
}

function getDaysLeft(endsAt?: Timestamp): number | null {
    if (!endsAt) return null;
    const now = new Date();
    const end = endsAt.toDate ? endsAt.toDate() : new Date(endsAt as any);
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function TrialStatusBadge({ daysLeft }: { daysLeft: number | null }) {
    if (daysLeft === null) return null;
    if (daysLeft < 0)
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/40 text-red-400 border border-red-500/30">
                <AlertTriangle className="w-3 h-3" /> פג תוקף
            </span>
        );
    if (daysLeft <= 3)
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-900/40 text-orange-400 border border-orange-500/30">
                <Clock className="w-3 h-3" /> {daysLeft} ימים
            </span>
        );
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3 h-3" /> {daysLeft} ימים
        </span>
    );
}

function ProgressBar({ daysLeft, totalDays = 14 }: { daysLeft: number | null; totalDays?: number }) {
    if (daysLeft === null) return null;
    const pct = Math.max(0, Math.min(100, (daysLeft / totalDays) * 100));
    const color = daysLeft < 0 ? '#ef4444' : daysLeft <= 3 ? '#f97316' : '#10b981';
    return (
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}60` }}
            />
        </div>
    );
}

export default function ActiveTrialsWidget() {
    const [trials, setTrials] = useState<ActiveTrial[]>([]);
    const [enrichedMap, setEnrichedMap] = useState<Record<string, EnrichedData>>({});
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);
    const [search, setSearch] = useState('');
    const navigate = useNavigate();

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
            alert("שגיאה בביצוע הפעולה: " + (err as any).message);
        }
    };

    useEffect(() => {
        const q = query(
            collection(db, 'activeTrials'),
            orderBy('trialEndsAt', 'asc')
        );
        const unsub = onSnapshot(q, async (snap) => {
            const rawTrials = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActiveTrial));
            setTrials(rawTrials);
            setLoading(false);

            // Enrichment Phase: Join missing names/emails
            const newEnriched: Record<string, EnrichedData> = { ...enrichedMap };
            let updated = false;

            for (const trial of rawTrials) {
                if (!newEnriched[trial.agencyId] && (trial.agencyId)) {
                    try {
                        const agencySnap = await getDoc(doc(db, 'agencies', trial.agencyId));
                        let email = trial.adminEmail || '';
                        let name = trial.agencyName || '';

                        if (agencySnap.exists()) {
                            const data = agencySnap.data();
                            name = name || data.name || data.agencyName || trial.agencyId;
                        }

                        if (!email && trial.uid) {
                            const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', trial.uid), limit(1)));
                            if (!userSnap.empty) {
                                email = userSnap.docs[0].data().email || '';
                            }
                        }

                        newEnriched[trial.agencyId] = { name: name || trial.agencyId, email: email || '—' };
                        updated = true;
                    } catch (e) {
                        console.error('Enrichment error for', trial.agencyId, e);
                    }
                }
            }

            if (updated) {
                setEnrichedMap(newEnriched);
            }
        }, (err) => {
            console.error('ActiveTrials fetch error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const getEnriched = (trial: ActiveTrial): EnrichedData => {
        const data = enrichedMap[trial.agencyId];
        return {
            name: trial.agencyName || data?.name || trial.agencyId || '—',
            email: trial.adminEmail || data?.email || '—'
        };
    };

    const filtered = trials.filter((t) => {
        const { name, email } = getEnriched(t);
        return name.toLowerCase().includes(search.toLowerCase()) || 
               email.toLowerCase().includes(search.toLowerCase()) ||
               t.agencyId.toLowerCase().includes(search.toLowerCase());
    });

    const expiring = trials.filter((t) => {
        const d = getDaysLeft(t.trialEndsAt);
        return d !== null && d <= 3 && d >= 0;
    }).length;

    const expired = trials.filter((t) => {
        const d = getDaysLeft(t.trialEndsAt);
        return d !== null && d < 0;
    }).length;

    return (
        <div
            className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl overflow-hidden mt-8"
            style={{
                borderColor: 'rgba(251,146,60,0.25)',
                boxShadow: '0 0 30px rgba(251,146,60,0.06)',
            }}
            dir="rtl"
        >
            {/* Header */}
            <button
                className="w-full px-6 py-4 border-b border-slate-800 flex items-center justify-between hover:bg-orange-500/5 transition-colors"
                onClick={() => setExpanded((p) => !p)}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="p-2 rounded-lg"
                        style={{ background: 'rgba(251,146,60,0.12)', boxShadow: '0 0 10px rgba(251,146,60,0.2)' }}
                    >
                        <Clock className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="text-right">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                            מנטור תקופות ניסיון (Active Trials)
                        </h2>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                            {loading ? 'טוען...' : `${trials.length} סוכנויות`}
                            {expiring > 0 && (
                                <span className="mr-2 text-orange-400 font-bold">{expiring} פגים בקרוב</span>
                            )}
                            {expired > 0 && (
                                <span className="mr-2 text-red-400 font-bold">{expired} פגו תוקף</span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-xs font-bold border bg-orange-900/30 text-orange-400 border-orange-500/30">
                        {trials.length} trials
                    </span>
                    {expanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                </div>
            </button>

            {expanded && (
                <>
                    {/* Search */}
                    <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-900/40">
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                            <input
                                type="text"
                                placeholder="חיפוש סוכנות, אימייל או מזהה..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full sm:w-80 pr-10 pl-4 py-2 text-sm rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all font-sans"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right" dir="rtl">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    {['סוכנות', 'אימייל', 'מסלול', 'תחילת ניסיון', 'סיום ניסיון', 'זמן שנותר', ''].map((h) => (
                                        <th
                                            key={h}
                                            className="px-6 py-3 text-right text-xs font-bold uppercase text-slate-600"
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <tr key={i} className="border-b border-slate-800/50">
                                            {Array.from({ length: 7 }).map((__, j) => (
                                                <td key={j} className="px-6 py-4">
                                                    <div className="h-4 rounded bg-slate-800 animate-pulse" />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-10 text-center text-slate-600">
                                            {trials.length === 0 ? 'אין ניסיונות פעילים' : 'לא נמצאו תוצאות'}
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((trial) => {
                                        const daysLeft = getDaysLeft(trial.trialEndsAt);
                                        const { name, email } = getEnriched(trial);
                                        return (
                                            <tr
                                                key={trial.id}
                                                className="group border-b border-slate-800/40 hover:bg-orange-500/5 transition-colors"
                                            >
                                                {/* Agency name */}
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black bg-orange-900/20 text-orange-400 border border-orange-500/20">
                                                            {name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-slate-200">
                                                                {name}
                                                            </span>
                                                            <span className="text-[10px] text-slate-600 font-mono">
                                                                {trial.agencyId}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Email */}
                                                <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                                                    {email}
                                                </td>
                                                {/* Plan */}
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold border bg-cyan-900/30 text-cyan-400 border-cyan-500/30 uppercase tracking-tighter">
                                                        {trial.planId || 'Starter'}
                                                    </span>
                                                </td>
                                                {/* Start date */}
                                                <td className="px-6 py-4 text-slate-500 text-xs">
                                                    {trial.createdAt?.toDate
                                                        ? trial.createdAt.toDate().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                                        : '—'}
                                                </td>
                                                {/* End date */}
                                                <td className="px-6 py-4 text-slate-500 text-xs">
                                                    {trial.trialEndsAt?.toDate
                                                        ? trial.trialEndsAt.toDate().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                                        : '—'}
                                                </td>
                                                {/* Days left + progress */}
                                                <td className="px-6 py-4 min-w-[120px]">
                                                    <div className="flex flex-col gap-1.5">
                                                        <TrialStatusBadge daysLeft={daysLeft} />
                                                        <ProgressBar daysLeft={daysLeft} totalDays={14} />
                                                    </div>
                                                </td>
                                                {/* Quick info from raw doc */}
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleReactivateBilling(trial.agencyId, name, 'extend')}
                                                            className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-all"
                                                            title="הארך תקופת ניסיון (7 ימים)"
                                                        >
                                                            <Timer className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReactivateBilling(trial.agencyId, name, 'activate')}
                                                            className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-all shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                                                            title="הפעל מנוי מלא - הסר חסימת ניסיון"
                                                        >
                                                            <PlayCircle className="w-3.5 h-3.5" />
                                                        </button>
                                                        {daysLeft !== null && daysLeft <= 1 && daysLeft >= 0 && (
                                                            <span className="text-[10px] font-bold text-red-500 animate-pulse mr-2">
                                                                ⚠ דחוף
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer summary */}
                    {!loading && trials.length > 0 && (
                        <div className="px-6 py-4 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800">
                            <span>מציג {filtered.length} מתוך {trials.length} ניסיונות</span>
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                                    {trials.filter((t) => { const d = getDaysLeft(t.trialEndsAt); return d !== null && d > 3; }).length} פעילים
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316]" />
                                    {expiring} פגים בקרוב
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                                    {expired} פגו
                                </span>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
