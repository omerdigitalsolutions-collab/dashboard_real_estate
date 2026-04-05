import React from 'react';
import { X, Copy, MessageCircle, Mail, Check } from 'lucide-react';
import { AppUser } from '../../types';

interface ShareInviteModalProps {
    agent: AppUser;
    onClose: () => void;
    agencyName?: string;
}

export default function ShareInviteModal({ agent, onClose, agencyName = 'הסוכנות' }: ShareInviteModalProps) {
    const [copied, setCopied] = React.useState(false);
    
    const joinLink = `https://homer.management/join?token=${agent.inviteToken || agent.id}`;
    const message = `שלום ${agent.name}! 👋\nהוזמנת להצטרף ל${agencyName} כסוכן נדל"ן.\nלחץ על הקישור כדי להצטרף: ${joinLink}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(joinLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleWhatsApp = () => {
        const phone = agent.phone?.replace(/\D/g, '');
        const intl = (phone && phone.startsWith('0')) ? `972${phone.slice(1)}` : phone;
        const url = phone 
            ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const handleEmail = () => {
        const subject = encodeURIComponent(`🏠 הזמנה להצטרף ל${agencyName} 🏠`);
        const body = encodeURIComponent(message);
        window.open(`mailto:${agent.email || ''}?subject=${subject}&body=${body}`);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
            
            {/* Modal Content */}
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" dir="rtl">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-slate-900">שתף הזמנה</h2>
                        <button 
                            onClick={onClose} 
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-5">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">קישור הצטרפות אישי</p>
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-2 pr-3">
                                <span className="text-xs text-slate-500 truncate flex-1 block" dir="ltr" title={joinLink}>
                                    {joinLink}
                                </span>
                                <button
                                    onClick={handleCopy}
                                    className={`p-2 rounded-lg transition-all ${copied ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400 hover:text-slate-600 active:scale-95'}`}
                                >
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                            {copied && (
                                <p className="text-[10px] text-emerald-600 font-bold mt-1.5 animate-in fade-in slide-in-from-top-1">
                                    ✅ הקישור הועתק ללוח!
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={handleWhatsApp}
                                className="flex flex-col items-center gap-2 p-4 bg-emerald-50 text-emerald-700 rounded-2xl hover:bg-emerald-100 transition-all border border-emerald-100 active:scale-95 group"
                            >
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                    <MessageCircle size={22} />
                                </div>
                                <span className="text-xs font-bold">WhatsApp</span>
                            </button>
                            <button
                                onClick={handleEmail}
                                className="flex flex-col items-center gap-2 p-4 bg-blue-50 text-blue-700 rounded-2xl hover:bg-blue-100 transition-all border border-blue-100 active:scale-95 group"
                            >
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                    <Mail size={22} />
                                </div>
                                <span className="text-xs font-bold">אימייל</span>
                            </button>
                        </div>
                    </div>
                    
                    <p className="mt-6 text-[11px] text-slate-400 text-center leading-relaxed">
                        הסוכן יוכל להצטרף לסוכנות באמצעות התחברות עם חשבון ה-Google שלו לאחר לחיצה על הקישור.
                    </p>
                </div>
            </div>
        </div>
    );
}
