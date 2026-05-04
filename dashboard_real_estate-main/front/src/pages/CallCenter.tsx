import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Phone, PhoneOff, PhoneIncoming, Clock, TrendingUp,
    ChevronDown, ChevronUp, Play, Loader2, Pencil, Check,
    X, UserCircle, Plus, ExternalLink, BadgeCheck,
} from 'lucide-react';
import {
    collection, getDocs, onSnapshot, query,
    where, orderBy, limit, doc, updateDoc,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { CallLog } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentRow {
    id: string;
    name: string;
    email?: string;
    virtualPhone?: string | null;
    realPhone?: string | null;
    stats: { callsAnswered: number; callsMissed: number; totalCallMinutes: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatAvg(totalMinutes: number, answered: number): string {
    if (!answered) return '—';
    const avgSec = Math.round((totalMinutes * 60) / answered);
    return formatDuration(avgSec);
}

function formatTime(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function answerRate(a: number, m: number): number | null {
    return a + m > 0 ? Math.round((a / (a + m)) * 100) : null;
}

// ─── Stat Badge ───────────────────────────────────────────────────────────────

function StatBadge({ icon: Icon, value, label, color }: {
    icon: React.ElementType; value: string; label: string; color: string;
}) {
    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${color}`}>
            <Icon size={14} />
            <div>
                <p className="text-sm font-black leading-none">{value}</p>
                <p className="text-[10px] font-medium leading-none mt-0.5 opacity-70">{label}</p>
            </div>
        </div>
    );
}

// ─── Single Call Row ──────────────────────────────────────────────────────────

function CallRow({ log, leads }: { log: CallLog; leads: { id: string; name: string; phone: string }[] }) {
    const navigate = useNavigate();
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [loadingAudio, setLoadingAudio] = useState(false);
    const [showTranscription, setShowTranscription] = useState(false);

    const isMissed = ['missed', 'failed', 'busy'].includes(log.status);
    const lead = leads.find(l => l.id === log.leadId);

    const handlePlay = async () => {
        if (audioUrl || !log.storagePath) return;
        setLoadingAudio(true);
        try {
            const url = await getDownloadURL(ref(storage, log.storagePath));
            setAudioUrl(url);
        } catch {
            setAudioUrl('expired');
        } finally {
            setLoadingAudio(false);
        }
    };

    return (
        <div className={`rounded-xl border p-3 ${isMissed ? 'border-red-500/15 bg-red-500/5' : 'border-slate-700/40 bg-slate-800/30'}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                    {isMissed
                        ? <PhoneOff size={13} className="text-red-400 flex-shrink-0" />
                        : <Phone size={13} className="text-emerald-400 flex-shrink-0" />
                    }
                    <span className={`text-xs font-black ${isMissed ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isMissed ? 'לא נענתה' : 'נענתה'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono" dir="ltr">{log.from}</span>
                    {log.duration != null && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                            <Clock size={10} />
                            {formatDuration(log.duration)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Lead link */}
                    {lead && (
                        <button
                            onClick={() => navigate('/dashboard/leads', { state: { openId: lead.id } })}
                            className="flex items-center gap-1 text-[11px] font-black text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg transition-colors"
                        >
                            <UserCircle size={11} />
                            {lead.name === lead.phone ? lead.phone : lead.name}
                            <ExternalLink size={10} />
                        </button>
                    )}
                    {log.leadCreated && !lead && (
                        <span className="text-[11px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                            ליד חדש נוצר
                        </span>
                    )}
                    <span className="text-[11px] text-slate-500">{formatTime(log.createdAt)}</span>
                </div>
            </div>

            {/* AI Summary */}
            {log.summary && (
                <p className="mt-2 text-[12px] text-slate-300 leading-relaxed font-medium">
                    {log.summary}
                </p>
            )}

            {/* Audio + Transcription */}
            <div className="mt-2 flex items-center gap-3 flex-wrap">
                {!isMissed && (
                    <>
                        {audioUrl && audioUrl !== 'expired' ? (
                            <audio controls src={audioUrl} className="h-7 w-full max-w-xs" />
                        ) : audioUrl === 'expired' ? (
                            <span className="text-[11px] text-slate-500 italic">הקלטה נמחקה (&gt;30 יום)</span>
                        ) : log.storagePath ? (
                            <button
                                onClick={handlePlay}
                                disabled={loadingAudio}
                                className="flex items-center gap-1.5 text-[11px] font-black text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                {loadingAudio ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                {loadingAudio ? 'טוען...' : 'נגן הקלטה'}
                            </button>
                        ) : null}
                    </>
                )}
                {log.transcription && (
                    <button
                        onClick={() => setShowTranscription(v => !v)}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 font-black transition-colors"
                    >
                        {showTranscription ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        תמלול
                    </button>
                )}
            </div>
            {showTranscription && log.transcription && (
                <div className="mt-2 p-3 rounded-lg bg-slate-900/70 border border-slate-700/30 text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                    {log.transcription}
                </div>
            )}
        </div>
    );
}

// ─── Agent Section ────────────────────────────────────────────────────────────

function AgentSection({
    agent, callLogs, leads, agencyId, onRefresh
}: {
    agent: AgentRow;
    callLogs: CallLog[];
    leads: { id: string; name: string; phone: string }[];
    agencyId: string;
    onRefresh: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [editingPhone, setEditingPhone] = useState(false);
    const [realPhoneInput, setRealPhoneInput] = useState(agent.realPhone ?? '');
    const [savingPhone, setSavingPhone] = useState(false);
    const [purchasing, setPurchasing] = useState(false);

    const agentCalls = useMemo(
        () => callLogs.filter(l => l.agentId === agent.id),
        [callLogs, agent.id]
    );
    const rate = answerRate(agent.stats.callsAnswered, agent.stats.callsMissed);
    const avgDuration = formatAvg(agent.stats.totalCallMinutes, agent.stats.callsAnswered);

    const saveRealPhone = async () => {
        if (!realPhoneInput.trim()) return;
        setSavingPhone(true);
        try {
            await updateDoc(doc(db, 'users', agent.id), {
                realPhone: realPhoneInput.trim(),
            });
            setEditingPhone(false);
            onRefresh();
        } finally {
            setSavingPhone(false);
        }
    };

    const handlePurchase = async () => {
        setPurchasing(true);
        try {
            const fn = httpsCallable(functions, 'calls-purchaseVirtualNumber');
            await fn({ agentId: agent.id, isoCountry: 'IL' });
            onRefresh();
        } catch (err: any) {
            alert(err?.message ?? 'שגיאה ברכישת מספר');
        } finally {
            setPurchasing(false);
        }
    };

    const hasActivity = agent.stats.callsAnswered + agent.stats.callsMissed > 0;

    return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
            {/* Agent Header */}
            <div className="p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center font-black text-white text-sm flex-shrink-0 shadow-lg">
                        {(agent.name ?? '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-black text-white truncate">{agent.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{agent.email}</p>
                    </div>
                </div>

                {/* Numbers config */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Virtual number */}
                    {agent.virtualPhone ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                            <BadgeCheck size={11} />
                            {agent.virtualPhone}
                        </span>
                    ) : (
                        <button
                            onClick={handlePurchase}
                            disabled={purchasing}
                            className="flex items-center gap-1.5 text-[11px] font-black text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-full transition-colors disabled:opacity-60"
                        >
                            {purchasing ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                            {purchasing ? 'רוכש...' : 'הקצה מספר'}
                        </button>
                    )}

                    {/* Real phone editable */}
                    {editingPhone ? (
                        <div className="flex items-center gap-1">
                            <input
                                type="tel"
                                value={realPhoneInput}
                                onChange={e => setRealPhoneInput(e.target.value)}
                                placeholder="050-XXXXXXX"
                                className="text-[11px] font-mono bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white w-32 focus:outline-none focus:border-blue-500"
                                dir="ltr"
                            />
                            <button onClick={saveRealPhone} disabled={savingPhone} className="text-emerald-400 hover:text-emerald-300 p-1">
                                {savingPhone ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            </button>
                            <button onClick={() => setEditingPhone(false)} className="text-slate-500 hover:text-slate-300 p-1">
                                <X size={12} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setEditingPhone(true)}
                            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 border border-slate-700 px-2 py-1.5 rounded-full transition-colors"
                        >
                            <Phone size={10} />
                            {agent.realPhone ? (
                                <span className="font-mono" dir="ltr">{agent.realPhone}</span>
                            ) : (
                                <span className="text-slate-600">הגדר נייד</span>
                            )}
                            <Pencil size={10} className="opacity-50" />
                        </button>
                    )}
                </div>
            </div>

            {/* Stats row */}
            {hasActivity && (
                <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                    <StatBadge icon={Phone} value={String(agent.stats.callsAnswered)} label="נענו"
                        color="text-emerald-400 border-emerald-500/20 bg-emerald-500/5" />
                    <StatBadge icon={PhoneOff} value={String(agent.stats.callsMissed)} label="לא נענו"
                        color="text-red-400 border-red-500/20 bg-red-500/5" />
                    <StatBadge icon={Clock} value={avgDuration} label="ממוצע"
                        color="text-blue-400 border-blue-500/20 bg-blue-500/5" />
                    {rate !== null && (
                        <StatBadge icon={TrendingUp} value={`${rate}%`} label="מענה"
                            color={rate >= 70
                                ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                                : "text-amber-400 border-amber-500/20 bg-amber-500/5"
                            } />
                    )}
                </div>
            )}

            {/* Expand/collapse call logs */}
            {agentCalls.length > 0 && (
                <>
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-slate-700/40 text-[11px] font-black text-slate-400 hover:text-slate-200 hover:bg-slate-700/20 transition-colors"
                    >
                        <span className="flex items-center gap-1.5">
                            <PhoneIncoming size={12} />
                            {agentCalls.length} שיחות
                        </span>
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {expanded && (
                        <div className="px-4 pb-4 space-y-2 border-t border-slate-700/30">
                            <div className="pt-3 space-y-2 max-h-[500px] overflow-y-auto pr-1">
                                {agentCalls.map(log => (
                                    <CallRow key={log.id} log={log} leads={leads} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {!hasActivity && agentCalls.length === 0 && (
                <div className="px-4 pb-4 text-[11px] text-slate-600 font-medium">
                    אין שיחות עדיין — לאחר הקצאת מספר וירטואלי שיחות יופיעו כאן
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CallCenter() {
    const { userData } = useAuth();
    const agencyId = userData?.agencyId ?? '';

    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [callLogs, setCallLogs] = useState<CallLog[]>([]);
    const [leads, setLeads] = useState<{ id: string; name: string; phone: string }[]>([]);
    const [loadingAgents, setLoadingAgents] = useState(true);
    const [refresh, setRefresh] = useState(0);

    const onRefresh = useCallback(() => setRefresh(r => r + 1), []);

    const location = useLocation();
    const targetAgentId = location.state?.agentId;

    // Load agents
    useEffect(() => {
        if (!agencyId) return;
        setLoadingAgents(true);
        // Load all users in the agency with role admin/agent
        const q = query(
            collection(db, 'users'),
            where('agencyId', '==', agencyId),
            where('role', 'in', ['admin', 'agent'])
        );
        getDocs(q).then(snap => {
            const rows: AgentRow[] = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    name: data.name ?? '—',
                    email: data.email,
                    virtualPhone: data.virtualPhone ?? null,
                    realPhone: data.realPhone ?? null,
                    stats: {
                        callsAnswered: data.stats?.callsAnswered ?? 0,
                        callsMissed: data.stats?.callsMissed ?? 0,
                        totalCallMinutes: data.stats?.totalCallMinutes ?? 0,
                    },
                };
            });
            setAgents(rows);
            setLoadingAgents(false);
        });
    }, [agencyId, refresh]);

    // Live call logs subscription
    useEffect(() => {
        if (!agencyId) return;
        const q = query(
            collection(db, 'callLogs'),
            where('agencyId', '==', agencyId),
            orderBy('createdAt', 'desc'),
            limit(300)
        );
        return onSnapshot(q,
            snap => setCallLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as CallLog))),
            err => console.error('callLogs subscription error:', err.code)
        );
    }, [agencyId]);

    // Load leads for linking
    useEffect(() => {
        if (!agencyId) return;
        const leadIds = [...new Set(callLogs.map(l => l.leadId).filter(Boolean) as string[])];
        if (leadIds.length === 0) return;
        // Batch read leads referenced by call logs
        getDocs(query(collection(db, 'leads'), where('agencyId', '==', agencyId))).then(snap => {
            setLeads(snap.docs
                .filter(d => leadIds.includes(d.id))
                .map(d => ({ id: d.id, name: d.data().name ?? d.data().phone, phone: d.data().phone }))
            );
        });
    }, [agencyId, callLogs.length]);

    // Agency-wide KPIs
    const totalCalls = callLogs.length;
    const totalAnswered = agents.reduce((s, a) => s + a.stats.callsAnswered, 0);
    const totalMissed = agents.reduce((s, a) => s + a.stats.callsMissed, 0);
    const totalMinutes = agents.reduce((s, a) => s + a.stats.totalCallMinutes, 0);
    const overallRate = answerRate(totalAnswered, totalMissed);
    const avgOverall = formatAvg(totalMinutes, totalAnswered);

    // Scroll to target agent if provided
    useEffect(() => {
        if (targetAgentId && agents.length > 0) {
            const el = document.getElementById(`agent-section-${targetAgentId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Optional: add a temporary highlight class
                el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-4', 'ring-offset-slate-900');
                setTimeout(() => {
                    el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-4', 'ring-offset-slate-900');
                }, 3000);
            }
        }
    }, [targetAgentId, agents.length]);

    if (loadingAgents) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={24} className="animate-spin text-slate-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12" dir="rtl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-black text-white flex items-center gap-2">
                            <PhoneIncoming size={24} className="text-blue-400" />
                            מרכזיה
                        </h1>
                        <span className="bg-blue-500/20 text-blue-400 text-[10px] font-black px-2 py-1 rounded-lg border border-blue-500/30 uppercase tracking-wider animate-pulse">
                            בפיתוח
                        </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">ניהול מספרים וירטואליים + יומן שיחות לכל סוכן</p>
                </div>
            </div>

            {/* Feature Info Card */}
            <div className="bg-gradient-to-br from-blue-600/10 to-violet-600/10 border border-blue-500/20 rounded-3xl p-6 relative overflow-hidden group">
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 blur-[100px] rounded-full group-hover:bg-blue-500/20 transition-colors" />
                
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                            <Phone size={20} className="text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white">מה זה מרכזיה חכמה?</h3>
                            <p className="text-xs text-slate-400">כלים מתקדמים לניהול תקשורת ומעקב שיחות</p>
                        </div>
                    </div>
                    
                    <p className="text-sm text-slate-300 leading-relaxed mb-6 max-w-3xl">
                        מערכת המרכזיה מאפשרת לכם לנהל את כל התקשורת הטלפונית של הסוכנות במקום אחד. 
                        במקום להשתמש במספרים אישיים, כל סוכן מקבל מספר וירטואלי שמנתב את השיחות ישירות אליו, תוך תיעוד מלא, הקלטה וניתוח אוטומטי של תוכן השיחה.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 hover:border-blue-500/30 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                                <Plus size={14} className="text-blue-400" />
                                <p className="text-xs font-black text-white">הקצאת מספרים</p>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">מספר ישראלי (073/050) ייחודי לכל סוכן בלחיצת כפתור מהירה.</p>
                        </div>
                        
                        <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 hover:border-emerald-500/30 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                                <BadgeCheck size={14} className="text-emerald-400" />
                                <p className="text-xs font-black text-white">זיהוי לידים</p>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">שיחה ממספר לא מוכר? המערכת תפתח ליד חדש ותשייך אותו לסוכן.</p>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 hover:border-violet-500/30 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                                <Play size={14} className="text-violet-400" />
                                <p className="text-xs font-black text-white">תמלול AI</p>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">כל השיחות מוקלטות, מתומללות ומסוכמות אוטומטית ע"י בינה מלאכותית.</p>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 hover:border-amber-500/30 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                                <TrendingUp size={14} className="text-amber-400" />
                                <p className="text-xs font-black text-white">ניהול ביצועים</p>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">ניתוח זמני מענה, אחוז מענה ואיכות השיחות של כל סוכן בזמן אמת.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Agency-wide KPI bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center">
                    <PhoneIncoming size={18} className="text-blue-400 mx-auto mb-2" />
                    <p className="text-2xl font-black text-white">{totalCalls}</p>
                    <p className="text-[11px] text-slate-400 mt-1">סה״כ שיחות</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center">
                    <Phone size={18} className="text-emerald-400 mx-auto mb-2" />
                    <p className="text-2xl font-black text-white">{totalAnswered}</p>
                    <p className="text-[11px] text-slate-400 mt-1">נענו</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center">
                    <PhoneOff size={18} className="text-red-400 mx-auto mb-2" />
                    <p className="text-2xl font-black text-white">{totalMissed}</p>
                    <p className="text-[11px] text-slate-400 mt-1">לא נענו</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-center">
                    <Clock size={18} className="text-amber-400 mx-auto mb-2" />
                    <p className="text-2xl font-black text-white">{avgOverall}</p>
                    <p className="text-[11px] text-slate-400 mt-1">ממוצע שיחה</p>
                    {overallRate !== null && (
                        <p className={`text-[11px] font-black mt-1 ${overallRate >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {overallRate}% מענה
                        </p>
                    )}
                </div>
            </div>

            {/* Per-agent sections */}
            <div className="space-y-4">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-blue-500 rounded-full inline-block" />
                    ביצועים לפי סוכן
                </h2>
                {agents.length === 0 && (
                    <p className="text-sm text-slate-500">לא נמצאו סוכנים בסוכנות</p>
                )}
                {agents.map(agent => (
                    <div key={agent.id} id={`agent-section-${agent.id}`}>
                        <AgentSection
                            agent={agent}
                            callLogs={callLogs}
                            leads={leads}
                            agencyId={agencyId}
                            onRefresh={onRefresh}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
