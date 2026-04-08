import React, { useState, useEffect, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    X, Phone, Mail, MapPin, Wallet, BedDouble,
    Clock, Building2, Zap, UserCheck, Sparkles, ChevronDown,
    MessageSquare, Send, Loader2, Heart, Link, Copy, Check, ExternalLink,
    ArrowRightLeft, Calendar
} from 'lucide-react';
import { Lead, AppUser, Property } from '../../types';
import { updateLead } from '../../services/leadService';
import { getCatalogsByLeadId } from '../../services/catalogService';
import { getPropertiesByIds } from '../../services/propertyService';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import BotToggle from './BotToggle';
import AddDealModal from '../modals/AddDealModal';
import { AddMeetingModal } from '../modals/AddMeetingModal';

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
    import: 'bg-sky-50 text-sky-600 border-sky-100',
};

const statusLabels: Record<string, string> = {
    new: 'חדש',
    contacted: 'בטיפול',
    meeting_set: 'נקבעה פגישה',
    won: 'נסגר הדיל',
    lost: 'אבוד',
    import: 'חדש (ייבוא)',
};

// ─── Row ──────────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, color = 'text-slate-500' }: {
    icon: React.ElementType;
    label: string;
    value: React.ReactNode;
    color?: string;
}) {
    return (
        <div className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
            <div className={`mt-0.5 flex-shrink-0 ${color}`}>
                <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.05em] leading-none mb-1.5">{label}</p>
                <div className="text-sm font-bold text-slate-200 leading-tight">{value || <span className="text-slate-600 italic font-medium">לא צוין</span>}</div>
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
    direction: 'inbound' | 'outbound' | 'system';
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
    const [showAddDealModal, setShowAddDealModal] = useState(false);
    const [showAddMeetingModal, setShowAddMeetingModal] = useState(false);
    
    // Sync local state when lead prop changes
    useEffect(() => {
        setAssignedId(lead.assignedAgentId ?? '');
    }, [lead.assignedAgentId]);

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
    const [likedProperties, setLikedProperties] = useState<Property[]>([]);
    const [loadingLikes, setLoadingLikes] = useState(false);

    // Fetch catalogs for this lead and extract liked properties
    useEffect(() => {
        if (!lead.id || !lead.agencyId) return;
        setLoadingLikes(true);
        getCatalogsByLeadId(lead.id, lead.agencyId)
            .then(async (catalogs) => {
                const likedIds = new Set<string>();
                for (const catalog of catalogs) {
                    (catalog.likedPropertyIds ?? []).forEach(id => likedIds.add(id));
                }

                if (likedIds.size > 0) {
                    const properties = await getPropertiesByIds(lead.agencyId, Array.from(likedIds));
                    setLikedProperties(properties);
                } else {
                    setLikedProperties([]);
                }
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

    // Trigger history sync when opening the Lead Profile panel
    useEffect(() => {
        if (lead.id && lead.phone) {
            console.log('[LeadProfilePanel] Initializing WhatsApp sync for lead:', lead.id);
            const fns = getFunctions(undefined, 'europe-west1');
            const syncFn = httpsCallable<any, any>(fns, 'whatsapp-syncLeadChat');
            syncFn({ agencyId: lead.agencyId, leadId: lead.id, phone: lead.phone })
                .then(res => {
                    console.log('[LeadProfilePanel] Sync calling success:', res.data);
                })
                .catch(e => {
                    console.error('[LeadProfilePanel] Failed to manually sync chat:', e);
                });
        }
    }, [lead.id, lead.phone, lead.agencyId]);

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
            <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] transition-opacity animate-in fade-in duration-300" 
                onClick={onClose} 
            />

            <div
                dir="rtl"
                className="fixed inset-4 md:inset-x-auto md:inset-y-10 md:left-[calc(50%-8rem)] md:-translate-x-1/2 w-full md:max-w-4xl bg-slate-900 border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[100] flex flex-col overflow-hidden rounded-[2rem] animate-in zoom-in-95 fade-in duration-300"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900 text-white shrink-0">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-xl font-black text-blue-400 border border-blue-500/20 shrink-0 shadow-lg">
                            {lead.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <p className="font-black text-lg leading-tight truncate">{lead.name}</p>
                            <p className="text-slate-500 text-xs mt-1 font-medium" dir="ltr">{lead.phone}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 transition-all text-slate-400 hover:text-white border border-transparent hover:border-slate-700">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Tab bar (Mobile only) */}
                <div className="md:hidden flex border-b border-slate-800 bg-slate-900/50 p-1 shrink-0">
                    <button
                        onClick={() => setActiveSection('details')}
                        className={`flex-1 py-3 text-sm font-black transition-all rounded-xl ${activeSection === 'details' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20 shadow-lg' : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        פרטי ליד
                    </button>
                    <button
                        onClick={() => setActiveSection('whatsapp')}
                        className={`flex-1 py-3 text-sm font-black transition-all rounded-xl flex items-center justify-center gap-2 ${activeSection === 'whatsapp' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-lg' : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        <MessageSquare size={16} />
                        ווטסאפ {messages.length > 0 && <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/20">{messages.length}</span>}
                    </button>
                </div>

                {/* Status + Type badges */}
                <div className="px-6 py-3 border-b border-slate-800 flex items-center gap-2 flex-wrap shrink-0">
                    <span className={`inline-flex text-[11px] font-black px-3 py-1 rounded-full border ${statusColors[lead.status] || statusColors.new} uppercase tracking-wider`}>
                        {statusLabels[lead.status] || lead.status}
                    </span>
                    <span className="inline-flex text-[11px] font-black px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase tracking-wider">
                        {lead.type === 'buyer' ? 'קונה / שוכר' : 'בעל נכס'}
                    </span>
                    <span className="inline-flex text-[11px] font-bold px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {lead.source}
                    </span>
                </div>

                {/* WhatsApp Tab (Mobile only) */}
                {activeSection === 'whatsapp' && (
                    <div className="flex md:hidden flex-col flex-1 h-0">
                        {/* Bot Toggle — available for all leads */}
                        <BotToggle
                            leadId={lead.id}
                            isBotActive={lead.isBotActive !== false}
                        />
                        {/* Messages list */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
                            {messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-10">
                                    <MessageSquare size={36} className="mb-3 opacity-40" />
                                    <p className="text-sm font-medium">אין הודעות עדיין</p>
                                </div>
                            ) : (
                                messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.direction === 'system' ? 'justify-center' : msg.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}>
                                        <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed ${
                                            msg.direction === 'system'
                                            ? 'bg-rose-500/10 border border-rose-500/20 text-rose-600 font-bold text-center'
                                            : msg.direction === 'outbound'
                                            ? 'bg-white border border-slate-200 text-slate-800 rounded-tr-sm'
                                            : 'bg-emerald-500 text-white rounded-tl-sm'
                                            }`}>
                                            <p>{msg.text}</p>
                                            {msg.timestamp?.toDate && msg.direction !== 'system' && (
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
                        <div className="border-t border-slate-100 bg-white px-3 pt-3 pb-6 sm:pb-3 flex items-center gap-2 shrink-0">
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

                {/* Content Area - Dual Panes on Desktop */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-slate-900">
                    
                    {/* Details Section */}
                    <div className={`flex-[1.2] overflow-y-auto border-l border-slate-800/50 scrollbar-hide ${activeSection === 'details' ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
                        {/* Quick Action: Convert to Deal */}
                        <div className="px-6 py-4 bg-blue-500/5 border-b border-blue-500/10 flex flex-col gap-3">
                            <button
                                onClick={() => setShowAddDealModal(true)}
                                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-2xl font-black text-sm shadow-xl shadow-blue-500/20 transition-all active:scale-95 group"
                            >
                                <ArrowRightLeft size={16} className="group-hover:rotate-12 transition-transform" />
                                המר ליד זה לעסקה (דיל)
                            </button>
                            <button
                                onClick={() => setShowAddMeetingModal(true)}
                                className="w-full flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 hover:border-blue-500/50 text-slate-200 hover:text-blue-400 py-3 px-4 rounded-2xl font-black text-sm shadow-lg transition-all active:scale-95 group"
                            >
                                <Calendar size={16} className="group-hover:scale-110 transition-transform" />
                                קבע פגישה ביומן
                            </button>
                        </div>

                        {/* Agent assignment */}
                        <div className="px-6 py-5 border-b border-slate-800/50 bg-slate-800/20">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <UserCheck size={14} className="text-blue-400" />
                                סוכן מטפל
                            </p>
                            <div className="relative">
                                <button
                                    onClick={() => setAgentOpen(o => !o)}
                                    disabled={assigning}
                                    className="w-full flex items-center justify-between gap-3 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-100 hover:border-blue-500/50 transition-all shadow-inner disabled:opacity-60"
                                >
                                    <span className="flex items-center gap-3">
                                        {assignedAgent ? (
                                            <>
                                                <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center text-sm font-black text-blue-400 border border-blue-500/20">
                                                    {assignedAgent.name.charAt(0)}
                                                </div>
                                                {assignedAgent.name}
                                            </>
                                        ) : (
                                            <span className="text-slate-500">לא משויך</span>
                                        )}
                                    </span>
                                    {assigning
                                        ? <Loader2 size={16} className="text-blue-400 animate-spin" />
                                        : <ChevronDown size={18} className="text-slate-500" />
                                    }
                                </button>

                                {agentOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setAgentOpen(false)} />
                                        <div className="absolute top-full mt-2 right-0 left-0 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                            <button
                                                onClick={() => handleAssignAgent('')}
                                                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-400 hover:bg-slate-700 transition-colors border-b border-slate-700/50 font-bold"
                                            >
                                                ללא שיוך
                                            </button>
                                            <div className="max-h-[300px] overflow-y-auto scrollbar-hide">
                                            {(() => {
                                                const scoredAgents = agents.map(agent => {
                                                    let score = 0;
                                                    const leadCities = lead.requirements?.desiredCity || [];
                                                    const transactionType = lead.requirements?.propertyType?.includes('rent') ? 'rent' : 'sale';
                                                    if (agent.specializations?.includes(transactionType)) score += 2;
                                                    const agentAreas = (agent.serviceAreas ?? []).map(a => a.toLowerCase());
                                                    const areaMatch = leadCities.some(city => agentAreas.includes(city.toLowerCase()));
                                                    if (areaMatch) score += 3;
                                                    return { agent, score };
                                                }).sort((a, b) => b.score - a.score);

                                                return scoredAgents.map(({ agent, score }) => {
                                                    const isRecommended = score >= 2;
                                                    return (
                                                        <button
                                                            key={agent.id}
                                                            onClick={() => handleAssignAgent(agent.uid ?? agent.id)}
                                                            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold transition-all border-b border-slate-700/30 last:border-0 ${isRecommended ? 'bg-blue-500/5 hover:bg-blue-500/10 text-slate-100' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${isRecommended ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' : 'bg-slate-700 text-slate-400'
                                                                    }`}>
                                                                    {agent.name.charAt(0)}
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="flex items-center gap-2">
                                                                        {agent.name}
                                                                        {isRecommended && <Sparkles size={14} className="text-blue-400" />}
                                                                    </p>
                                                                    <p className="text-[10px] text-slate-500 font-medium">
                                                                        {agent.role === 'admin' ? 'מנהל' : 'סוכן'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {isRecommended && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-lg font-black tracking-wider shadow-sm">מומלץ</span>}
                                                        </button>
                                                    );
                                                });
                                            })()}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Contact & Requirements Scrollable Area */}
                        <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8">
                            {/* Contact */}
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">פרטי קשר</p>
                                <div className="space-y-4 bg-slate-800/30 rounded-2xl p-4 border border-slate-800/50">
                                    <InfoRow icon={Phone} label="טלפון" value={<a href={`tel:${lead.phone}`} className="text-blue-400 hover:text-blue-300 transition-colors font-bold" dir="ltr">{lead.phone}</a>} color="text-blue-400" />
                                    {lead.email && <InfoRow icon={Mail} label="אימייל" value={<a href={`mailto:${lead.email}`} className="text-blue-400 hover:text-blue-300 transition-colors font-bold">{lead.email}</a>} color="text-violet-400" />}
                                </div>
                            </div>

                            {/* Requirements — only for buyers */}
                            {lead.type !== 'seller' && (
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Sparkles size={14} className="text-amber-400" />
                                        קריטריוני חיפוש
                                    </p>
                                    <div className="space-y-4 bg-slate-800/30 rounded-2xl p-4 border border-slate-800/50">
                                        {r.desiredCity?.length > 0 && (
                                            <InfoRow icon={MapPin} label="עיר מבוקשת" color="text-emerald-400"
                                                value={
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        {r.desiredCity.map((c: string) => (
                                                            <span key={c} className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-xl font-bold">{c}</span>
                                                        ))}
                                                    </div>
                                                }
                                            />
                                        )}

                                        <InfoRow icon={Wallet} label="תקציב מקסימלי" color="text-amber-400"
                                            value={r.maxBudget ? <span className="text-amber-400 font-black tracking-tight">₪{r.maxBudget.toLocaleString()}</span> : null}
                                        />

                                        <InfoRow icon={BedDouble} label="מספר חדרים" color="text-indigo-400"
                                            value={
                                                r.minRooms || r.maxRooms
                                                    ? <span className="text-slate-200 font-bold">{r.minRooms ?? '—'} – {r.maxRooms ?? '—'} חדרים</span>
                                                    : null
                                            }
                                        />

                                        {r.propertyType?.length > 0 && (
                                            <InfoRow icon={Building2} label="סוג נכס מבוקש" color="text-slate-400"
                                                value={
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        {r.propertyType.map((t: string) => (
                                                            <span key={t} className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-xl font-bold">
                                                                {t === 'sale' ? 'למכירה' : t === 'rent' ? 'להשכרה' : t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                }
                                            />
                                        )}

                                        <InfoRow icon={Building2} label="מצב נכס" color="text-slate-500"
                                            value={<span className="text-slate-200 font-bold">{conditionLabels[r.condition ?? 'any']}</span>}
                                        />

                                        <InfoRow icon={Zap} label="דחיפות" color="text-red-400"
                                            value={
                                                <span className={`inline-flex text-[11px] font-black px-3 py-1 rounded-xl border ${urgencyColors[r.urgency ?? 'flexible']} uppercase tracking-wider`}>
                                                    {urgencyLabels[r.urgency ?? 'flexible']}
                                                </span>
                                            }
                                        />
                                    </div>

                                    {/* Must-haves */}
                                    {(r.mustHaveParking || r.mustHaveElevator || r.mustHaveBalcony || r.mustHaveSafeRoom) && (
                                        <div className="mt-6">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">חובה שיהיה</p>
                                            <div className="flex flex-wrap gap-2.5">
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
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Link size={14} className="text-blue-400" />
                                        קטלוג נכסים אישי
                                    </p>
                                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-4 shadow-inner">
                                        <span className="text-xs text-slate-400 font-mono truncate bg-slate-900/50 px-3 py-2 rounded-xl" dir="ltr">{lead.catalogUrl}</span>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={handleCopyCatalogLink}
                                                className={`flex-1 flex items-center justify-center gap-2 text-xs font-black px-4 py-3 rounded-xl transition-all border ${copied ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600 hover:text-white'}`}
                                            >
                                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                                {copied ? 'הועתק!' : 'העתק'}
                                            </button>
                                            <a
                                                href={lead.catalogUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 flex items-center justify-center gap-2 text-xs font-black px-4 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                                            >
                                                <ExternalLink size={14} />
                                                צפה
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Liked Properties from catalog */}
                            {(loadingLikes || likedProperties.length > 0) && (
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Heart size={14} className="text-rose-400 shadow-sm" />
                                        נכסים שאהב בקטלוג
                                        {likedProperties.length > 0 && (
                                            <span className="bg-rose-500/20 text-rose-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-rose-500/20">{likedProperties.length}</span>
                                        )}
                                    </p>
                                    {loadingLikes ? (
                                        <div className="flex items-center gap-2 text-xs text-slate-500 font-bold py-4">
                                            <Loader2 size={14} className="animate-spin text-rose-400" />
                                            טוען נתונים...
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {likedProperties.map(prop => (
                                                <RouterLink
                                                    key={prop.id}
                                                    to={`/properties?id=${prop.id}`}
                                                    className="flex items-center gap-4 bg-slate-800/40 border border-slate-800 hover:border-rose-500/30 rounded-2xl p-3 hover:bg-slate-800 transition-all group"
                                                >
                                                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700">
                                                        {(prop.images?.[0]) ? (
                                                            <img
                                                                src={prop.images[0]}
                                                                alt={prop.address}
                                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                                <Building2 size={24} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-black text-slate-100 truncate mb-1">{prop.address}</p>
                                                        <p className="text-xs font-black text-rose-400 tracking-tight">₪{prop.price.toLocaleString()}</p>
                                                    </div>
                                                    <div className="text-slate-600 group-hover:text-rose-400 transition-colors bg-slate-800 p-2 rounded-xl border border-slate-700">
                                                        <ArrowRightLeft size={16} />
                                                    </div>
                                                </RouterLink>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                             {/* Notes */}
                             {lead.notes && (
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">הערות</p>
                                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl px-5 py-4 text-sm text-slate-300 leading-relaxed font-medium shadow-inner">
                                        {lead.notes}
                                    </div>
                                </div>
                            )}

                             {/* Created */}
                            <div className="pt-4 border-t border-slate-800/50">
                                <InfoRow icon={Clock} label="נוצר בתאריך" color="text-slate-500"
                                    value={<span className="text-slate-400 font-bold">{lead.createdAt?.toDate().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                                />
                            </div>
                        </div>
                    </div>

                    {/* WhatsApp Section */}
                    <div className={`flex-1 overflow-hidden flex flex-col bg-slate-900/50 ${activeSection === 'whatsapp' ? 'flex' : 'hidden md:flex'}`}>
                        {/* Bot Toggle — available for all leads */}
                        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
                            <BotToggle
                                leadId={lead.id}
                                isBotActive={lead.isBotActive !== false}
                            />
                        </div>
                        
                        {/* Messages list */}
                        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-slate-900/30 scrollbar-hide">
                            {messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-slate-600 space-y-4">
                                    <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-2 border border-slate-800 shadow-inner">
                                        <MessageSquare size={40} className="text-slate-700" />
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-slate-500">אין הודעות עדיין</p>
                                        <p className="text-sm text-slate-600 font-medium">התחל שיחה עם הליד דרך המערכת</p>
                                    </div>
                                </div>
                            ) : (
                                messages.map(msg => (
                                    <div key={msg.id} className={`flex ${msg.direction === 'system' ? 'justify-center' : msg.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}>
                                        <div className={`max-w-[85%] px-4 py-3 rounded-[1.25rem] text-sm leading-relaxed shadow-xl ${
                                            msg.direction === 'system'
                                            ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold text-center'
                                            : msg.direction === 'outbound'
                                            ? 'bg-slate-800 border border-slate-700 text-slate-100 rounded-tr-none'
                                            : 'bg-emerald-600 text-white rounded-tl-none shadow-emerald-900/20'
                                            }`}>
                                            <p className="font-medium">{msg.text}</p>
                                            {msg.timestamp?.toDate && msg.direction !== 'system' && (
                                                <p className={`text-[10px] mt-2 font-bold flex items-center gap-1.5 ${msg.direction === 'outbound' ? 'text-slate-500 justify-end' : 'text-emerald-200 justify-end'}`} dir="ltr">
                                                    {msg.timestamp.toDate().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                                    {msg.direction === 'inbound' && <Check size={10} />}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Compose bar */}
                        <div className="border-t border-slate-800 bg-slate-900 p-6 flex items-center gap-4 shrink-0">
                            <div className="flex-1 relative">
                                <textarea
                                    value={msgText}
                                    onChange={e => setMsgText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendWaMessage(); } }}
                                    placeholder="כתוב הודעה לוואטסאפ..."
                                    rows={1}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-[1.25rem] px-5 py-3.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all shadow-inner scrollbar-hide resize-none"
                                    dir="rtl"
                                />
                            </div>
                            <button
                                onClick={handleSendWaMessage}
                                disabled={sending || !msgText.trim()}
                                className="w-12 h-12 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-all disabled:opacity-50 disabled:grayscale shrink-0 shadow-lg shadow-emerald-600/20 hover:scale-105 active:scale-95"
                            >
                                {sending ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} className="mr-1" />}
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {showAddDealModal && (
                <AddDealModal
                    isOpen={showAddDealModal}
                    onClose={() => setShowAddDealModal(false)}
                    prefilledLead={lead}
                />
            )}

            {showAddMeetingModal && (
                <AddMeetingModal
                    isOpen={showAddMeetingModal}
                    onClose={() => setShowAddMeetingModal(false)}
                    initialData={{
                        summary: `פגישה עם ${lead.name}`,
                        description: `פגישה עם הליד: ${lead.name}\nטלפון: ${lead.phone}`,
                        relatedEntityType: 'lead',
                        relatedEntityId: lead.id,
                        relatedEntityName: lead.name
                    }}
                />
            )}
        </>
    );
}
