import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import { Bell, CheckCircle2, Loader2, Phone, User, Calendar, Tag, ExternalLink, Clock } from 'lucide-react';

interface SubscriptionRequest {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    plan: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: Timestamp;
    agencyId?: string;
    approvedBy?: string;
}

const PLAN_LABELS: Record<string, string> = {
    solo: 'Starter',
    starter: 'Starter',
    pro: 'Pro',
    boutique: 'Pro',
    enterprise: 'Enterprise',
};

const PLAN_COLORS: Record<string, string> = {
    solo: 'bg-cyan-900/40 text-cyan-400 border-cyan-500/30',
    starter: 'bg-cyan-900/40 text-cyan-400 border-cyan-500/30',
    pro: 'bg-purple-900/40 text-purple-400 border-purple-500/30',
    boutique: 'bg-purple-900/40 text-purple-400 border-purple-500/30',
    enterprise: 'bg-orange-900/40 text-orange-400 border-orange-500/30',
};

export default function SubscriptionRequestsManager() {
    const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activating, setActivating] = useState<string | null>(null);

    // agencyId input state per request
    const [agencyIdInputs, setAgencyIdInputs] = useState<Record<string, string>>({});
    const [durationInputs, setDurationInputs] = useState<Record<string, number>>({});

    useEffect(() => {
        const q = query(collection(db, 'subscription_requests'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as SubscriptionRequest)));
            setLoading(false);
        }, (err) => {
            console.error('SubscriptionRequestsManager error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleActivate = async (req: SubscriptionRequest) => {
        const agencyId = agencyIdInputs[req.id]?.trim();
        const duration = durationInputs[req.id] || 30;

        if (!agencyId) {
            alert('חובה להזין Agency ID לפני פתיחת גישה.');
            return;
        }

        if (!window.confirm(`לאשר גישה ל-${req.name} (${req.plan}) למשך ${duration} ימים?\nAgency ID: ${agencyId}`)) return;

        setActivating(req.id);
        try {
            const fn = httpsCallable<any, any>(functions, 'superadmin-superAdminSetPlan');
            await fn({
                agencyId,
                planId: req.plan === 'solo' ? 'starter' : req.plan,
                durationDays: duration,
                requestId: req.id,
            });
            alert(`✅ גישה אושרה ל-${req.name}!`);
        } catch (err: any) {
            console.error('Activate plan error:', err);
            alert('שגיאה בפתיחת הגישה: ' + err.message);
        } finally {
            setActivating(null);
        }
    };

    const pending = requests.filter(r => r.status === 'pending');
    const approved = requests.filter(r => r.status === 'approved');

    return (
        <div className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl border-emerald-500/20 shadow overflow-hidden" style={{ boxShadow: '0 0 30px rgba(16,185,129,0.05)' }} dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400" style={{ letterSpacing: '0.15em' }}>
                        SUBSCRIPTION REQUESTS — בקשות הרשמה
                    </h2>
                    {pending.length > 0 && (
                        <span className="bg-emerald-500 text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">
                            {pending.length}
                        </span>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-10">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
            ) : requests.length === 0 ? (
                <div className="text-center py-10 text-slate-600 text-sm">אין בקשות הרשמה עדיין</div>
            ) : (
                <div className="divide-y divide-slate-800/80">
                    {/* Pending */}
                    {pending.length > 0 && (
                        <div>
                            <div className="px-6 py-2 text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/5">⏳ ממתינות לאישור ({pending.length})</div>
                            {pending.map(req => (
                                <div key={req.id} className="px-6 py-5 hover:bg-slate-800/30 transition-colors">
                                    <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
                                        {/* Info */}
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-white flex items-center gap-1.5"><User className="w-4 h-4 text-slate-500" /> {req.name}</span>
                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${PLAN_COLORS[req.plan] ?? PLAN_COLORS.starter}`}>
                                                    {PLAN_LABELS[req.plan] ?? req.plan}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                                                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {req.phone}</span>
                                                {req.email && <span className="flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> {req.email}</span>}
                                                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {req.createdAt?.toDate?.().toLocaleDateString('he-IL') ?? '—'}</span>
                                            </div>
                                        </div>

                                        {/* Activation Controls */}
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full lg:w-auto">
                                            <div className="flex flex-col gap-1 w-full sm:w-auto">
                                                <label className="text-[10px] text-slate-500 font-bold uppercase">Agency ID</label>
                                                <input
                                                    type="text"
                                                    placeholder="הדבק Agency ID..."
                                                    value={agencyIdInputs[req.id] || ''}
                                                    onChange={e => setAgencyIdInputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                                                    className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500/50 w-48 font-mono"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1"><Clock className="w-3 h-3" /> ימים</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={365}
                                                    value={durationInputs[req.id] || 30}
                                                    onChange={e => setDurationInputs(prev => ({ ...prev, [req.id]: parseInt(e.target.value) || 30 }))}
                                                    className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500/50 w-20"
                                                />
                                            </div>
                                            <button
                                                onClick={() => handleActivate(req)}
                                                disabled={activating === req.id || !agencyIdInputs[req.id]?.trim()}
                                                className="mt-4 sm:mt-0 self-end px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] whitespace-nowrap"
                                            >
                                                {activating === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                                פתח גישה
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Approved */}
                    {approved.length > 0 && (
                        <div>
                            <div className="px-6 py-2 text-xs font-bold text-slate-600 uppercase tracking-widest bg-slate-800/30">✅ אושרו ({approved.length})</div>
                            {approved.slice(0, 5).map(req => (
                                <div key={req.id} className="px-6 py-3 flex items-center gap-4 opacity-50">
                                    <Tag className="w-4 h-4 text-slate-600 shrink-0" />
                                    <span className="text-sm text-slate-500 font-medium">{req.name}</span>
                                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${PLAN_COLORS[req.plan] ?? PLAN_COLORS.starter}`}>{PLAN_LABELS[req.plan] ?? req.plan}</span>
                                    <span className="text-xs text-slate-600 mr-auto">{req.createdAt?.toDate?.().toLocaleDateString('he-IL') ?? '—'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
