import React, { useState, useEffect, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    X, Phone, Mail, MapPin, Wallet, BedDouble,
    Clock, Building2, Zap, UserCheck, Sparkles, ChevronDown,
    MessageSquare, Send, Loader2, Heart, Link, Copy, Check, ExternalLink
} from 'lucide-react';
import { Lead, AppUser, SharedCatalog } from '../../types';
import { updateLead } from '../../services/leadService';
import { getCatalogsByLeadId } from '../../services/catalogService';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

interface Message {
    id: string;
    text: string;
    direction: 'inbound' | 'outbound';
    timestamp: any;
}

export default function LeadProfilePanel({ lead, agents, onClose, onUpdated }: LeadProfilePanelProps) {
    const r = lead.requirements ?? {} as Lead['requirements'];
    const [assignedId, setAssignedId] = useState(lead.assignedAgentId ?? '');
    const [assigning, setAssigning] = useState(false);
    const [agentOpen, setAgentOpen] = useState(false);
    const [activeSection, setActiveSection] = useState<'details' | 'whatsapp'>('details');
    const [messages, setMessages] = useState<Message[]>([]);
    const [msgText, setMsgText] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);

    const handleCopyCatalogLink = async () => {
        if (!lead.catalogUrl) return;
        try {
            await navigator.clipboard.writeText(lead.catalogUrl);
        } catch {
            const input = document.createElement('input');
            input.value = lead.catalogUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Liked properties from catalogs
    type LikedPropertySnapshot = SharedCatalog['properties'][0];
    const [likedProperties, setLikedProperties] = useState<LikedPropertySnapshot[]>([]);
    const [loadingLikes, setLoadingLikes] = useState(false);

    // Fetch catalogs for this lead and extract liked properties
    useEffect(() => {
        if (!lead.id || !lead.agencyId) return;
        setLoadingLikes(true);
        getCatalogsByLeadId(lead.id, lead.agencyId)
            .then(catalogs => {
                const likedIds = new Set<string>();
                for (const catalog of catalogs) {
                    (catalog.likedPropertyIds ?? []).forEach(id => likedIds.add(id));
                }
                // We'll need to fetch these properties by ID if we want to show their cards
                // For now, let's keep the logic consistent with the UI
                setLikedProperties([]); // We will need a follow-up to fetch these live
            })
            .catch(err => console.warn('[LeadProfilePanel] Could not load liked properties:', err))
            .finally(() => setLoadingLikes(false));
    }, [lead.id, lead.agencyId]);

    const assignedAgent = agents.find(a => a.uid === assignedId || a.id === assignedId);

    // Load WhatsApp messages from Firestore subcollection
    useEffect(() => {
        if (!lead.id) return;
        const q = query(
            collection(db, `leads/${lead.id}/messages`),
            orderBy('timestamp', 'asc')
        );
        const unsub = onSnapshot(q, (snap) => {
            setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        });
        return () => unsub();
    }, [lead.id]);

    // Format WhatsApp phone number (unused for now, kept logic inside if needed later)

    const handleSendWaMessage = async () => {
        if (!msgText.trim() || sending) return;
        setSending(true);

        try {
            const fns = getFunctions(undefined, 'europe-west1');
            const sendFn = httpsCallable<{ phone: string, message: string }, { success: boolean }>(fns, 'whatsapp-sendWhatsappMessage');
            await sendFn({ phone: lead.phone, message: msgText.trim() });

            // Only save outbound message to Firestore AFTER successful send
            await addDoc(collection(db, `leads/${lead.id}/messages`), {
                text: msgText.trim(),
                direction: 'outbound',
                timestamp: serverTimestamp(),
                isRead: true,
            });

            setMsgText('');
        } catch (e: any) {
            console.error('Failed to send WhatsApp message:', e);
            let userMsg = `שגיאה בשליחת ההודעה: ${e.message}`;
            if (e.message?.toLowerCase().includes('not connected')) {
                userMsg = 'הווצאפ לא מחובר במערכת. יש לחבר אותו בהגדרות כדי לשלוח הודעות.';
            }
            onUpdated?.(userMsg);
        } finally {
            setSending(false);
        }
    };

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
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-slate-100 bg-slate-50">
                    <button
                        onClick={() => setActiveSection('details')}
                        className={`flex-1 py-2.5 text-xs font-bold transition-colors ${activeSection === 'details' ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        פרטי ליד
                    </button>
                    <button
                        onClick={() => setActiveSection('whatsapp')}
                        className={`flex-1 py-2.5 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${activeSection === 'whatsapp' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-white' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <MessageSquare size={13} />
                        ווטסאפ {messages.length > 0 && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{messages.length}</span>}
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

                {/* WhatsApp Tab */}
                {activeSection === 'whatsapp' && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* Messages list */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
                            {messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-10">
                                    <MessageSquare size={36} className="mb-3 opacity-40" />
                                    <p className="text-sm font-medium">אין הודעות עדיין</p>
                                    <p className="text-xs mt-1">הודעות נכנסות מ-Green API יופיעו כאן</p>
                                </div>
                            ) : (
                                messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}>
                                        <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${msg.direction === 'outbound'
                                            ? 'bg-white border border-slate-200 text-slate-800 rounded-tr-sm'
                                            : 'bg-emerald-500 text-white rounded-tl-sm'
                                            }`}>
                                            <p>{msg.text}</p>
                                            {msg.timestamp?.toDate && (
                                                <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-slate-400' : 'text-emerald-100'}`} dir="ltr">
                                                    {msg.timestamp.toDate().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                        {/* Compose bar */}
                        <div className="border-t border-slate-100 bg-white px-3 py-3 flex items-center gap-2">
                            <input
                                value={msgText}
                                onChange={e => setMsgText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendWaMessage(); } }}
                                placeholder="כתוב הודעה..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                                dir="rtl"
                            />
                            <button
                                onClick={handleSendWaMessage}
                                disabled={sending || !msgText.trim()}
                                className="p-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors disabled:opacity-50 shrink-0"
                            >
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </div>
                    </div>
                )}

                {/* Details Tab */}
                {activeSection === 'details' && <div className="flex-1 overflow-y-auto">
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

                    {/* Catalog Link */}
                    {lead.catalogUrl && (
                        <div className="px-5 pb-5">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Link size={13} className="text-blue-500" />
                                קטלוג נכסים אישי
                            </p>

                            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex flex-col gap-2.5">
                                <span className="text-xs text-slate-600 font-mono truncate" dir="ltr">{lead.catalogUrl}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCopyCatalogLink}
                                        className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold px-2 py-1.5 rounded-lg transition-colors border ${copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                        {copied ? 'הועתק!' : 'העתק'}
                                    </button>
                                    <a
                                        href={lead.catalogUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold px-2 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                                    >
                                        <ExternalLink size={12} />
                                        צפה
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Liked Properties from catalog */}
                    {(loadingLikes || likedProperties.length > 0) && (
                        <div className="px-5 pb-5">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Heart size={13} className="text-rose-400" />
                                נכסים שאהב בקטלוג
                                {likedProperties.length > 0 && (
                                    <span className="bg-rose-100 text-rose-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{likedProperties.length}</span>
                                )}
                            </p>
                            {loadingLikes ? (
                                <div className="text-xs text-slate-400 py-2">טוען...</div>
                            ) : (
                                <div className="space-y-2">
                                    {likedProperties.map(prop => (
                                        <RouterLink
                                            key={prop.id}
                                            to={`/properties?id=${prop.id}`}
                                            className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-xl p-2.5 hover:bg-rose-100/50 transition-colors group"
                                        >
                                            {/* Thumbnail */}
                                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-rose-100 shrink-0">
                                                {(prop.images?.[0]) ? (
                                                    <img
                                                        src={prop.images[0]}
                                                        alt={prop.address}
                                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-rose-300">
                                                        <Building2 size={18} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-bold text-slate-800 truncate">{prop.address}</p>
                                                <p className="text-[11px] font-medium text-rose-600">₪{prop.price.toLocaleString()}</p>
                                            </div>
                                            <div className="text-rose-300 group-hover:text-rose-500 transition-colors">
                                                <ExternalLink size={14} />
                                            </div>
                                        </RouterLink>
                                    ))}
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
                </div>}
            </div>
        </>
    );
}
