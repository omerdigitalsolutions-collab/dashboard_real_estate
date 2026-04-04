import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Sparkles, 
    Bot, 
    Zap, 
    ChevronLeft, 
    LayoutDashboard,
    MessageSquareMore
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { markWelcomeAsSeen } from '../../services/userService';

interface WelcomeExperienceProps {
    onStartTour: () => void;
    onClose: () => void;
}

const steps = [
    {
        id: 'hero',
        title: 'ברוכים הבאים ל-hOMER 👋',
        subtitle: 'הבית החדש של העסק שלך בנדל״ן',
        description: 'אנחנו שמחים שהצטרפת למשפחת hOMER. בואו נראה איך המערכת הולכת להזניק את העסק שלך קדימה.',
        icon: <Sparkles className="w-12 h-12 text-yellow-400" />,
        color: 'from-blue-600 to-indigo-600'
    },
    {
        id: 'ai',
        title: 'הבינה המלאכותית בשירותך 🤖',
        subtitle: 'הסייען האישי (Copilot) תמיד כאן',
        description: 'מניתוח לידים מהיר ועד לשליפת נתונים אוטומטית מטקסטים חופשיים - hOMER עושה את העבודה הקשה בשבילך.',
        icon: <Bot className="w-12 h-12 text-cyan-400" />,
        color: 'from-cyan-600 to-blue-600'
    },
    {
        id: 'automation',
        title: 'אוטומציות ושיווק חכם ✨',
        subtitle: 'WeBot והקטלוג הדיגיטלי',
        description: 'לידים מקבלים מענה בשניות, נכסים מותאמים אישית לכל לקוח, והכל מסתנכרן אוטומטית ל-CRM.',
        icon: <Zap className="w-12 h-12 text-purple-400" />,
        color: 'from-purple-600 to-indigo-600'
    },
    {
        id: 'final',
        title: 'מוכנים לצאת לדרך? 🚀',
        subtitle: 'איך תרצו להתחיל?',
        description: 'ניתן לעבור סיור קצר בממשק או לקפוץ ישר למים העמוקים.',
        icon: <LayoutDashboard className="w-12 h-12 text-emerald-400" />,
        color: 'from-emerald-600 to-teal-600'
    }
];

export default function WelcomeExperience({ onStartTour, onClose }: WelcomeExperienceProps) {
    const { userData } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [isExiting, setIsExiting] = useState(false);

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleFinalize = async (startTour: boolean) => {
        setIsExiting(true);
        if (userData?.uid) {
            try {
                await markWelcomeAsSeen(userData.uid);
            } catch (err) {
                console.error('Error marking welcome as seen:', err);
            }
        }
        
        setTimeout(() => {
            if (startTour) {
                onStartTour();
            } else {
                onClose();
            }
        }, 300);
    };

    const step = steps[currentStep];

    return (
        <AnimatePresence>
            {!isExiting && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                        onClick={() => handleFinalize(false)}
                    />

                    {/* Main Card */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 10 }}
                        className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] bg-slate-900 border border-slate-800 shadow-2xl"
                    >
                        {/* Background Decor */}
                        <div className={`absolute top-0 inset-x-0 h-48 bg-gradient-to-br ${step.color} opacity-20 blur-3xl`} />
                        
                        <div className="relative p-8 sm:p-12 text-center" dir="rtl">
                            {/* Icon Animation */}
                            <motion.div
                                key={`icon-${currentStep}`}
                                initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                className="mx-auto mb-8 w-24 h-24 rounded-3xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center shadow-xl backdrop-blur-sm"
                            >
                                {step.icon}
                            </motion.div>

                            {/* Text Content */}
                            <motion.div
                                key={`text-${currentStep}`}
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                className="space-y-4"
                            >
                                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                                    {step.title}
                                </h1>
                                <h2 className="text-xl font-bold text-slate-400">
                                    {step.subtitle}
                                </h2>
                                <p className="text-lg text-slate-300 leading-relaxed max-w-md mx-auto">
                                    {step.description}
                                </p>
                            </motion.div>

                            {/* Progress Dots */}
                            <div className="flex justify-center gap-2 mt-10">
                                {steps.map((_, i) => (
                                    <div 
                                        key={i}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${
                                            i === currentStep ? 'w-8 bg-blue-500' : 'w-2 bg-slate-700'
                                        }`}
                                    />
                                ))}
                            </div>

                            {/* Action Buttons */}
                            <div className="mt-12 flex flex-col sm:flex-row-reverse gap-4 justify-center">
                                {currentStep < steps.length - 1 ? (
                                    <button
                                        onClick={handleNext}
                                        className="group relative px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-600/25 transition-all active:scale-95 flex items-center gap-3 justify-center"
                                    >
                                        המשך להסבר
                                        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => handleFinalize(true)}
                                            className="px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-600/30 transition-all active:scale-95 flex items-center gap-3 justify-center"
                                        >
                                            <Sparkles className="w-5 h-5" />
                                            בואו נצא לסיור
                                        </button>
                                        <button
                                            onClick={() => handleFinalize(false)}
                                            className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-bold text-lg border border-slate-700 transition-all active:scale-95"
                                        >
                                            ישר למערכת
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Features Preview (Conditional) */}
                            {currentStep === 0 && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="mt-12 grid grid-cols-3 gap-4"
                                >
                                    {[
                                        { label: 'לוח בקרה', icon: <LayoutDashboard className="w-5 h-5" /> },
                                        { label: 'אוטומציות', icon: <Bot className="w-5 h-5" /> },
                                        { label: 'חיבור וואטסאפ', icon: <MessageSquareMore className="w-5 h-5" /> }
                                    ].map((f, i) => (
                                        <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-800/30 border border-slate-700/30">
                                            <div className="text-blue-400">{f.icon}</div>
                                            <span className="text-[10px] sm:text-xs font-medium text-slate-400">{f.label}</span>
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </div>

                        {/* Top Close Button */}
                        <button 
                            onClick={() => handleFinalize(false)}
                            className="absolute top-6 left-6 p-2 text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            <Zap className="w-5 h-5 rotate-180 opacity-50" />
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
