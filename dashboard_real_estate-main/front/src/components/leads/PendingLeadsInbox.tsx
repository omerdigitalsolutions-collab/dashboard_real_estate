import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { MessageCircle, Check, X, Clock, Loader2, Sparkles } from 'lucide-react';

interface PendingLead {
    id: string;
    agencyId: string;
    phone: string;
    initialMessage: string;
    aiSummary?: string;
    aiIntent?: 'buy' | 'rent' | 'sell' | 'inquiry';
    createdAt: any;
    expiresAt: number;
}

export default function PendingLeadsInbox() {
    const { userData } = useAuth();
    const { agencyId } = userData || {};
    const [pendingLeads, setPendingLeads] = useState<PendingLead[]>([]);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [approveModal, setApproveModal] = useState<PendingLead | null>(null);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<'buyer' | 'seller'>('buyer');

    useEffect(() => {
        if (!agencyId) return;

        const q = query(
            collection(db, 'pending_leads'),
            where('agencyId', '==', agencyId)
        );

        const unsub = onSnapshot(q, (snap) => {
            const leads = snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingLead));
            // Sort by newest first (handling firestore timestamp lag)
            leads.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            setPendingLeads(leads);
        });

        return () => unsub();
    }, [agencyId]);

    const handleReject = async (id: string) => {
        if (!window.confirm('למחוק הודעה זו? הפעולה בלתי הפיכה.')) return;
        setProcessingId(id);
        try {
            await deleteDoc(doc(db, 'pending_leads', id));
        } catch (e) {
            console.error('Error rejecting pending lead:', e);
            alert('שגיאה במחיקה');
        } finally {
            setProcessingId(null);
        }
    };

    const handleApproveSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!approveModal || !newName.trim() || !agencyId) return;

        setProcessingId(approveModal.id);
        try {
            // 1. Create the lead
            const leadRef = await addDoc(collection(db, 'leads'), {
                agencyId,
                name: newName.trim(),
                phone: approveModal.phone,
                type: newType,
                status: 'new',
                source: 'whatsapp',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // 2. Move the initial message to their chat subcollection
            await addDoc(collection(db, `leads/${leadRef.id}/messages`), {
                text: approveModal.initialMessage,
                direction: 'inbound',
                senderPhone: approveModal.phone,
                timestamp: serverTimestamp(),
                isRead: true, // we just read it by approving
            });

            // 3. Delete from pending_leads
            await deleteDoc(doc(db, 'pending_leads', approveModal.id));

            setApproveModal(null);
            setNewName('');
        } catch (error) {
            console.error('Error approving pending lead:', error);
            alert('שגיאה ביצירת הליד');
        } finally {
            setProcessingId(null);
        }
    };

    if (pendingLeads.length === 0) return null;

    return (
        <div className="mb-6 animate-in slide-in-from-top-4 duration-500">
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-0.5 shadow-xl shadow-blue-900/20">
                <div className="bg-[#0a0f1c]/90 backdrop-blur-xl rounded-[15px] p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                            <MessageCircle className="text-blue-400" size={20} />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg flex items-center gap-2">
                                הודעות נכנסות חדשות
                                <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                                    {pendingLeads.length} ממתינים
                                </span>
                            </h2>
                            <p className="text-slate-400 text-sm">הודעות ממספרים לא מוכרים שזוהו כלידים פוטנציאליים (מכילים מילות מפתח נדל"ן).</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {pendingLeads.map(lead => (
                            <div key={lead.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex flex-col transition-all hover:bg-slate-800 hover:border-blue-500/30">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <p className="font-mono text-emerald-400 font-bold text-sm tracking-wide" dir="ltr">{lead.phone}</p>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                                            <Clock size={12} />
                                            <span>
                                                {lead.createdAt?.toDate()
                                                    ? lead.createdAt.toDate().toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
                                                    : 'עכשיו'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="bg-blue-500/10 p-1.5 rounded-lg border border-blue-500/20 text-blue-400">
                                        <Sparkles size={14} />
                                    </div>
                                </div>

                                <div className="bg-slate-900/50 rounded-lg p-3 text-sm text-slate-300 mb-4 flex-1 line-clamp-3 leading-relaxed border border-slate-800 relative group/msg">
                                    {lead.aiSummary && (
                                        <div className="flex items-center gap-1.5 mb-2 py-1 px-2 bg-blue-500/10 border border-blue-500/20 rounded-md">
                                            <Sparkles size={12} className="text-blue-400 shrink-0" />
                                            <span className="text-[11px] font-bold text-blue-300 leading-tight">סיכום AI: {lead.aiSummary}</span>
                                        </div>
                                    )}
                                    <span className="italic opacity-80">"{lead.initialMessage}"</span>

                                    {lead.aiIntent && (
                                        <div className="absolute -top-2 -right-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border shadow-lg ${lead.aiIntent === 'buy' ? 'bg-emerald-500 border-emerald-400 text-white' :
                                                    lead.aiIntent === 'rent' ? 'bg-amber-500 border-amber-400 text-white' :
                                                        lead.aiIntent === 'sell' ? 'bg-blue-600 border-blue-500 text-white' :
                                                            'bg-slate-600 border-slate-500 text-white'
                                                }`}>
                                                {lead.aiIntent === 'buy' ? 'רכישה' :
                                                    lead.aiIntent === 'rent' ? 'שכירות' :
                                                        lead.aiIntent === 'sell' ? 'מכירה' : 'בירור'}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 mt-auto">
                                    <button
                                        onClick={() => handleReject(lead.id)}
                                        disabled={processingId === lead.id}
                                        className="flex-1 h-9 rounded-lg bg-slate-800 text-slate-400 font-medium text-sm hover:bg-rose-500/20 hover:text-rose-400 transition-colors flex items-center justify-center gap-1.5 border border-slate-700 disabled:opacity-50"
                                    >
                                        <X size={16} /> דחה
                                    </button>
                                    <button
                                        onClick={() => { setApproveModal(lead); setNewName(''); }}
                                        disabled={processingId === lead.id}
                                        className="flex-1 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-sm hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-1.5 border border-emerald-500/30 disabled:opacity-50 shadow-lg shadow-emerald-500/10"
                                    >
                                        <Check size={16} /> אשר לליד
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Approve Modal */}
            {approveModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setApproveModal(null)}>
                    <div className="bg-[#0f1523] border border-slate-800 shadow-2xl rounded-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                                <Check size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">אישור ליד חדש שממתין</h3>
                                <p className="text-slate-400 text-sm font-mono tracking-widest mt-0.5" dir="ltr">{approveModal.phone}</p>
                            </div>
                        </div>

                        <form onSubmit={handleApproveSave}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">הזן שם עבור הליד</label>
                                    <input
                                        type="text"
                                        required
                                        autoFocus
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                                        placeholder="שם מלא של הלקוח..."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3 pb-2">
                                    <button
                                        type="button"
                                        onClick={() => setNewType('buyer')}
                                        className={`h-11 rounded-xl border font-bold text-sm transition-all ${newType === 'buyer' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        מעוניין בקנייה
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewType('seller')}
                                        className={`h-11 rounded-xl border font-bold text-sm transition-all ${newType === 'seller' ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        בעל נכס (מוכר)
                                    </button>
                                </div>
                            </div>

                            <div className="mt-8 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setApproveModal(null)}
                                    className="flex-1 h-11 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                                >
                                    ביטול
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newName.trim() || processingId === approveModal.id}
                                    className="flex-[2] h-11 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {processingId === approveModal.id ? <Loader2 size={18} className="animate-spin" /> : 'שמור והעבר ללידים'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
