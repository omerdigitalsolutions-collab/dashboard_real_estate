import React, { useState } from 'react';
import { X, Mail, Loader2, Send } from 'lucide-react';
import { sendAgentInvite } from '../../services/teamService';
import { isValidEmail } from '../../utils/validation';
import toast from 'react-hot-toast';

interface EmailInviteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function EmailInviteModal({ isOpen, onClose, onSuccess }: EmailInviteModalProps) {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setError('אנא הזן כתובת אימייל');
            return;
        }

        if (!isValidEmail(trimmedEmail)) {
            setError('כתובת האימייל אינה תקינה');
            return;
        }

        setLoading(true);
        try {
            await sendAgentInvite(trimmedEmail);
            toast.success(`הזמנה נשלחה בהצלחה ל-${trimmedEmail}`);
            onSuccess?.();
            onClose();
        } catch (err: any) {
            console.error('Invite error:', err);
            if (err.code === 'already-exists' || err.message?.includes('already registered')) {
                setError('הסוכן כבר רשום במערכת.');
            } else {
                setError('שגיאה בשליחת ההזמנה. נסה שוב מאוחר יותר.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
                onClick={onClose} 
            />
            
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200" dir="rtl">
                {/* Header Decoration */}
                <div className="h-2 bg-gradient-to-r from-blue-500 to-indigo-600" />
                
                <div className="p-8">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                            <Mail size={28} />
                        </div>
                        <button 
                            onClick={onClose} 
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-slate-900 mb-2">הזמנת סוכן למערכת</h2>
                        <p className="text-slate-500 text-sm leading-relaxed">
                            הזן כתובת אימייל והמערכת תשלח קישור הצטרפות אוטומטי המקושר למשרד שלך.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="invite-email" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 pr-1">
                                כתובת אימייל
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    id="invite-email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="agent@example.com"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pr-12 pl-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                    dir="ltr"
                                    autoFocus
                                />
                            </div>
                            {error && (
                                <p className="mt-2 text-xs font-bold text-red-500 flex items-center gap-1 pr-1">
                                    <span>⚠️</span> {error}
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98]"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <span>שלח הזמנה</span>
                                    <Send size={18} className="group-hover:translate-x-[-4px] group-hover:translate-y-[-2px] transition-transform duration-200 " />
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full py-3 text-slate-400 hover:text-slate-600 font-bold text-sm transition-colors"
                        >
                            ביטול
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
