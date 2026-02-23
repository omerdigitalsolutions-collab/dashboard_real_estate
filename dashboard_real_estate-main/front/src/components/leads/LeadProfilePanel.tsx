import React, { useState } from 'react';
import {
    X, Phone, Mail, MapPin, Wallet, BedDouble,
    Clock, Building2, Zap, UserCheck, Sparkles, ChevronDown,
} from 'lucide-react';
import { Lead, AppUser } from '../../types';
import { updateLead } from '../../services/leadService';

// ─── Labels ───────────────────────────────────────────────────────────────────

const conditionLabels: Record<string, string> = {
    new: 'חדש מקבלן',
    renovated: 'משופץ',
    needs_renovation: 'דורש שיפוץ',
    any: 'לא משנה',
};

const urgencyLabels: Record<string, string> = {
    immediate: 'מיידי',
    '1-3_months': '1–3 חודשים',
    '3-6_months': '3–6 חודשים',
    flexible: 'גמיש',
};

const urgencyColors: Record<string, string> = {
    immediate: 'text-red-600 bg-red-50 border-red-200',
    '1-3_months': 'text-amber-600 bg-amber-50 border-amber-200',
    '3-6_months': 'text-blue-600 bg-blue-50 border-blue-200',
    flexible: 'text-slate-600 bg-slate-50 border-slate-200',
};

const statusColors: Record<string, string> = {
    new: 'bg-sky-50 text-sky-600 border-sky-100',
    contacted: 'bg-amber-50 text-amber-600 border-amber-100',
    meeting_set: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    won: 'bg-green-50 text-green-600 border-green-100',
    lost: 'bg-slate-50 text-slate-600 border-slate-200',
};

const statusLabels: Record<string, string> = {
    new: 'חדש',
    contacted: 'בטיפול',
    meeting_set: 'נקבעה פגישה',
    won: 'נסגר הדיל',
    lost: 'אבוד',
};

// ─── Row ──────────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, color = 'text-slate-500' }: {
    icon: React.ElementType;
    label: string;
    value: React.ReactNode;
    color?: string;
}) {
    return (
        <div className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
            <div className={`mt-0.5 flex-shrink-0 ${color}`}>
                <Icon size={15} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                <div className="text-sm font-medium text-slate-800 mt-0.5">{value || <span className="text-slate-400 italic">לא צוין</span>}</div>
            </div>
        </div>
    );
}

function BoolBadge({ active, label }: { active: boolean; label: string }) {
    if (!active) return null;
    return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full">
            {label}
        </span>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LeadProfilePanelProps {
    lead: Lead;
    agents: AppUser[];
    onClose: () => void;
    onUpdated: (msg: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeadProfilePanel({ lead, agents, onClose, onUpdated }: LeadProfilePanelProps) {
    const r = lead.requirements ?? {} as Lead['requirements'];
    const [assignedId, setAssignedId] = useState(lead.assignedAgentId ?? '');
    const [assigning, setAssigning] = useState(false);
    const [agentOpen, setAgentOpen] = useState(false);

    const assignedAgent = agents.find(a => a.uid === assignedId || a.id === assignedId);

    const handleAssignAgent = async (agentId: string) => {
        setAssignedId(agentId);
        setAgentOpen(false);
        setAssigning(true);
        try {
            await updateLead(lead.id, { assignedAgentId: agentId || null } as any);
            onUpdated('הסוכן שויך בהצלחה');
        } catch {
            onUpdated('שגיאה בשיוך הסוכן');
        } finally {
            setAssigning(false);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />

            {/* Panel */}
            <div
                dir="rtl"
                className="fixed top-0 left-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col overflow-hidden
                           animate-in slide-in-from-left duration-300"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-l from-blue-600 to-indigo-700 text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg font-bold">
                            {lead.name.charAt(0)}
                        </div>
                        <div>
                            <p className="font-bold text-base leading-tight">{lead.name}</p>
                            <p className="text-blue-100 text-xs mt-0.5" dir="ltr">{lead.phone}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Status + Type badges */}
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[lead.status] || statusColors.new}`}>
                        {statusLabels[lead.status] || lead.status}
                    </span>
                    <span className="inline-flex text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                        {lead.type === 'buyer' ? 'קונה / שוכר' : 'בעל נכס'}
                    </span>
                    <span className="inline-flex text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                        {lead.source}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Agent assignment */}
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <UserCheck size={13} />
                            סוכן מטפל
                        </p>
                        <div className="relative">
                            <button
                                onClick={() => setAgentOpen(o => !o)}
                                disabled={assigning}
                                className="w-full flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-400 transition-colors shadow-sm disabled:opacity-60"
                            >
                                <span className="flex items-center gap-2">
                                    {assignedAgent ? (
                                        <>
                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                                                {assignedAgent.name.charAt(0)}
                                            </div>
                                            {assignedAgent.name}
                                        </>
                                    ) : (
                                        <span className="text-slate-400">לא משויך</span>
                                    )}
                                </span>
                                {assigning
                                    ? <span className="text-xs text-blue-500 animate-pulse">שומר...</span>
                                    : <ChevronDown size={14} className="text-slate-400" />
                                }
                            </button>

                            {agentOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setAgentOpen(false)} />
                                    <div className="absolute top-full mt-1 right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                                        <button
                                            onClick={() => handleAssignAgent('')}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors border-b border-slate-100"
                                        >
                                            ללא שיוך
                                        </button>
                                        {agents.map(agent => (
                                            <button
                                                key={agent.id}
                                                onClick={() => handleAssignAgent(agent.uid ?? agent.id)}
                                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                                            >
                                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                                                    {agent.name.charAt(0)}
                                                </div>
                                                <div className="text-right">
                                                    <p>{agent.name}</p>
                                                    <p className="text-xs text-slate-400">{agent.role === 'admin' ? 'מנהל' : 'סוכן'}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Contact */}
                    <div className="px-5 pt-4 pb-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">פרטי קשר</p>
                        <InfoRow icon={Phone} label="טלפון" value={<a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline" dir="ltr">{lead.phone}</a>} color="text-blue-500" />
                        {lead.email && <InfoRow icon={Mail} label="אימייל" value={<a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>} color="text-violet-500" />}
                    </div>

                    {/* Requirements — only for buyers */}
                    {lead.type !== 'seller' && (
                        <div className="px-5 pt-3 pb-4">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                                <Sparkles size={12} />
                                קריטריוני חיפוש
                            </p>

                            {r.desiredCity?.length > 0 && (
                                <InfoRow icon={MapPin} label="עיר מבוקשת" color="text-emerald-500"
                                    value={
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                            {r.desiredCity.map(c => (
                                                <span key={c} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full">{c}</span>
                                            ))}
                                        </div>
                                    }
                                />
                            )}

                            <InfoRow icon={Wallet} label="תקציב מקסימלי" color="text-amber-500"
                                value={r.maxBudget ? `₪${r.maxBudget.toLocaleString()}` : null}
                            />

                            <InfoRow icon={BedDouble} label="מספר חדרים" color="text-indigo-500"
                                value={
                                    r.minRooms || r.maxRooms
                                        ? `${r.minRooms ?? '—'} – ${r.maxRooms ?? '—'} חדרים`
                                        : null
                                }
                            />

                            {r.propertyType?.length > 0 && (
                                <InfoRow icon={Building2} label="סוג נכס מבוקש" color="text-slate-500"
                                    value={
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                            {r.propertyType.map(t => (
                                                <span key={t} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                                                    {t === 'sale' ? 'למכירה' : t === 'rent' ? 'להשכרה' : t}
                                                </span>
                                            ))}
                                        </div>
                                    }
                                />
                            )}

                            <InfoRow icon={Building2} label="מצב נכס" color="text-slate-400"
                                value={conditionLabels[r.condition ?? 'any']}
                            />

                            <InfoRow icon={Zap} label="דחיפות" color="text-red-400"
                                value={
                                    <span className={`inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full border ${urgencyColors[r.urgency ?? 'flexible']}`}>
                                        {urgencyLabels[r.urgency ?? 'flexible']}
                                    </span>
                                }
                            />

                            {/* Must-haves */}
                            {(r.mustHaveParking || r.mustHaveElevator || r.mustHaveBalcony || r.mustHaveSafeRoom) && (
                                <div className="mt-3">
                                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">חובה שיהיה</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <BoolBadge active={r.mustHaveParking} label="🚗 חניה" />
                                        <BoolBadge active={r.mustHaveElevator} label="🛗 מעלית" />
                                        <BoolBadge active={r.mustHaveBalcony} label="☀️ מרפסת" />
                                        <BoolBadge active={r.mustHaveSafeRoom} label='🛡️ ממ"ד' />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    {lead.notes && (
                        <div className="px-5 pb-5">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">הערות</p>
                            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-slate-700 leading-relaxed">
                                {lead.notes}
                            </div>
                        </div>
                    )}

                    {/* Created */}
                    <div className="px-5 pb-6">
                        <InfoRow icon={Clock} label="נוצר בתאריך" color="text-slate-400"
                            value={lead.createdAt?.toDate().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}
