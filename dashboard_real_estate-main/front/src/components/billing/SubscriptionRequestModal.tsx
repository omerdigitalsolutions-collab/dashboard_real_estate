import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Phone, User, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface SubscriptionRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    planName: string; // 'pro', 'boutique', 'enterprise'
    userData?: {
        uid: string | null;
        name: string;
        email: string | null;
        phone?: string;
    } | null;
}

const SubscriptionRequestModal: React.FC<SubscriptionRequestModalProps> = ({ isOpen, onClose, planName, userData }) => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [name, setName] = useState(userData?.name || '');
    const [phone, setPhone] = useState(userData?.phone || '');

    const PLAN_LABELS: Record<string, string> = {
        'solo': 'Starter',
        'pro': 'Pro (349 ₪)',
        'boutique': 'Boutique (899 ₪)',
        'enterprise': 'Enterprise'
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');

        try {
            // Save request to Firestore
            await addDoc(collection(db, 'subscription_requests'), {
                uid: userData?.uid || null,
                name,
                phone,
                email: userData?.email || null,
                plan: planName,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            // Cloud Functions will listen for this document creation and send SMS & Email to the Admin.
            setStatus('success');

        } catch (error) {
            console.error('Error saving subscription request:', error);
            setStatus('error');
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && status !== 'loading') {
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-[#020b18]/80 backdrop-blur-md z-[9998]"
                        onClick={handleBackdropClick}
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4" dir="rtl">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden pointer-events-auto border border-slate-100"
                        >
                            {/* Header Gradient */}
                            <div className="relative h-32 bg-gradient-to-br from-blue-600 to-indigo-700 overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                                <button
                                    onClick={onClose}
                                    className="absolute top-4 left-4 p-2 bg-black/10 hover:bg-black/20 text-white rounded-full transition-colors backdrop-blur-sm"
                                    disabled={status === 'loading'}
                                >
                                    <X className="w-5 h-5" />
                                </button>

                                <div className="absolute bottom-[-24px] right-8">
                                    <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center border-4 border-white rotate-3">
                                        <Sparkles className="w-8 h-8 text-indigo-600" />
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 pt-10">
                                {status === 'success' ? (
                                    <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 py-6">
                                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                        </div>
                                        <h3 className="text-2xl font-black text-slate-800">הבקשה התקבלה!</h3>
                                        <p className="text-slate-500 leading-relaxed">
                                            מנהל המערכת יעבור עליה ויצור איתך קשר. בינתיים, תוכל להרשם ולהתחיל את <b>7 ימי הניסיון החינמיים</b> שלך עכשיו!
                                        </p>
                                        <button
                                            onClick={() => { onClose(); navigate('/register'); }}
                                            className="mt-6 w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-3 text-lg shadow-lg shadow-emerald-500/30"
                                        >
                                            המשך לניסיון חינם של 7 ימים
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={onClose}
                                            className="mt-2 w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl transition-colors"
                                        >
                                            סגור
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-6">
                                            <h2 className="text-2xl font-black text-slate-800 mb-2">
                                                הצטרפות למסלול {PLAN_LABELS[planName]?.split(' ')[0] || planName}
                                            </h2>
                                            <p className="text-sm text-slate-500 leading-relaxed">
                                                השאר את הפרטים ומנהל אישי יחזור אליך תוך מספר דקות להסדרת מנוי פרימיום.
                                            </p>
                                        </div>

                                        <form onSubmit={handleSubmit} className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">שם מלא</label>
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                                        <User className="h-4 w-4 text-slate-400" />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={name}
                                                        onChange={e => setName(e.target.value)}
                                                        placeholder="ישראל ישראלי"
                                                        className="w-full pl-4 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all font-medium"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">מספר טלפון לאימות</label>
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                                                        <Phone className="h-4 w-4 text-slate-400" />
                                                    </div>
                                                    <input
                                                        type="tel"
                                                        required
                                                        value={phone}
                                                        onChange={e => setPhone(e.target.value)}
                                                        placeholder="050-0000000"
                                                        dir="ltr"
                                                        className="w-full pl-4 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all font-medium"
                                                    />
                                                </div>
                                            </div>

                                            {status === 'error' && (
                                                <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                                                    אירעה שגיאה בשליחת הבקשה. אנא נסה שוב.
                                                </div>
                                            )}

                                            <button
                                                type="submit"
                                                disabled={status === 'loading' || !name || !phone}
                                                className="w-full mt-2 group relative overflow-hidden rounded-xl bg-blue-600 px-6 py-4 text-white font-bold transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.2)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)]"
                                            >
                                                <span className="relative z-10 flex items-center justify-center gap-2">
                                                    {status === 'loading' ? (
                                                        'שולח בקשה...'
                                                    ) : (
                                                        <>
                                                            שלח בקשה עכשיו <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                                                        </>
                                                    )}
                                                </span>
                                            </button>

                                            <p className="text-[11px] text-center text-slate-400 mt-3 flex items-center justify-center gap-1.5">
                                                <span>🔒</span> הפרטים מאובטחים ולא מועברים לצד שלישי
                                            </p>
                                        </form>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

export default SubscriptionRequestModal;
