import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Lock, CheckCircle2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    featureName?: string; // איזה פיצ'ר הלקוח ניסה להפעיל? (למשל: "יבוא נכסים ב-AI")
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, featureName = "פיצ'ר מתקדם" }) => {
    const navigate = useNavigate();

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop (רקע כהה ומטושטש) */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-40 bg-[#020b18]/80 backdrop-blur-sm"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none" dir="rtl">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: "spring", duration: 0.5 }}
                            className="w-full max-w-md bg-[#0a192f] border border-cyan-500/30 rounded-3xl shadow-[0_0_40px_rgba(6,182,212,0.15)] overflow-hidden pointer-events-auto relative"
                        >
                            {/* כפתור סגירה */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>

                            {/* Header עם אפקט זוהר */}
                            <div className="relative pt-8 pb-6 px-8 text-center overflow-hidden">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-cyan-500/20 blur-[40px] rounded-full" />

                                <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700 mb-6 shadow-inner">
                                    <Lock className="absolute text-slate-400" size={24} />
                                    <Sparkles className="absolute top-2 right-2 text-cyan-400" size={14} />
                                </div>

                                <h2 className="text-2xl font-bold text-white mb-2">
                                    הפיצ'ר הזה נעול
                                </h2>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    השימוש ב-<strong className="text-cyan-400">{featureName}</strong> זמין במסלול ה-Pro בלבד. הגיע הזמן לתת ל-AI לעבוד בשבילך.
                                </p>
                            </div>

                            {/* גוף המודל - למה כדאי לשדרג? */}
                            <div className="px-8 pb-8">
                                <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800/50 mb-8">
                                    <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
                                        מה מקבלים במסלול ה-Pro?
                                    </h3>
                                    <ul className="space-y-3">
                                        <li className="flex items-start gap-3">
                                            <CheckCircle2 size={18} className="text-cyan-500 shrink-0 mt-0.5" />
                                            <span className="text-slate-300 text-sm">בוט AI שעונה ללידים בווצאפ 24/7.</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <CheckCircle2 size={18} className="text-cyan-500 shrink-0 mt-0.5" />
                                            <span className="text-slate-300 text-sm">יבוא נכסים חכם (העתק-הדבק מיד2).</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <CheckCircle2 size={18} className="text-cyan-500 shrink-0 mt-0.5" />
                                            <span className="text-slate-300 text-sm">הודעות תפוצה לעשרות לקוחות בלחיצה.</span>
                                        </li>
                                    </ul>
                                </div>

                                {/* כפתורי הנעה לפעולה */}
                                <div className="space-y-3">
                                    <button
                                        onClick={() => {
                                            onClose();
                                            navigate('/billing');
                                        }}
                                        className="w-full relative group bg-cyan-500 hover:bg-cyan-400 text-[#020b18] font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 overflow-hidden"
                                    >
                                        <div className="absolute inset-0 w-full h-full bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                                        <Zap size={18} className="relative z-10" />
                                        <span className="relative z-10">שדרג למסלול Pro עכשיו</span>
                                    </button>

                                    <button
                                        onClick={onClose}
                                        className="w-full py-3 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                                    >
                                        אולי בפעם אחרת
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

export default UpgradeModal;
