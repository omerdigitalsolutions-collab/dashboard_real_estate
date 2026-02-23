import { useState } from 'react';
import { X, Loader2, Target, CalendarDays, BarChart4 } from 'lucide-react';
import { AppUser } from '../../types';
import { updateUserProfile } from '../../services/userService';

// Helper component for styled number inputs
const GoalInput = ({
    label, value, onChange, icon: Icon
}: {
    label: string,
    value: number | '',
    onChange: (v: number | '') => void,
    icon: any
}) => (
    <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
        <div className="relative">
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <input
                type="number"
                min="0"
                value={value}
                onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
                className="appearance-none block w-full px-4 py-3 pr-10 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-slate-50 transition-all text-sm"
                dir="ltr"
            />
        </div>
    </div>
);

interface EditAgentGoalsModalProps {
    agent: AppUser;
    onClose: () => void;
    onSuccess: () => void;
}

export default function EditAgentGoalsModal({ agent, onClose, onSuccess }: EditAgentGoalsModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [monthlyRevenue, setMonthlyRevenue] = useState<number | ''>(agent.goals?.monthly?.revenue ?? '');
    const [monthlyDeals, setMonthlyDeals] = useState<number | ''>(agent.goals?.monthly?.deals ?? '');
    const [yearlyRevenue, setYearlyRevenue] = useState<number | ''>(agent.goals?.yearly?.revenue ?? '');
    const [yearlyDeals, setYearlyDeals] = useState<number | ''>(agent.goals?.yearly?.deals ?? '');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const docId = agent.id || agent.uid;
            if (!docId) throw new Error('שגיאה: חסר מזהה סוכן');

            await updateUserProfile(docId, {
                goals: {
                    monthly: {
                        revenue: monthlyRevenue === '' ? 0 : monthlyRevenue,
                        deals: monthlyDeals === '' ? 0 : monthlyDeals,
                    },
                    yearly: {
                        revenue: yearlyRevenue === '' ? 0 : yearlyRevenue,
                        deals: yearlyDeals === '' ? 0 : yearlyDeals,
                    }
                }
            });
            onSuccess();
        } catch (err) {
            console.error('Failed to update agent goals:', err);
            setError('שגיאה בעדכון יעדי הסוכן. אנא נסה שוב.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200" dir="rtl">
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-br from-blue-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex flex-shrink-0 items-center justify-center border border-blue-200">
                            <Target size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 leading-tight">יעדים אישיים</h2>
                            <p className="text-sm text-slate-500 mt-0.5">{agent.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Monthly Goals */}
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <CalendarDays size={16} className="text-blue-500" />
                            יעדי חודש נוכחי
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <GoalInput
                                label="יעד הכנסות (₪)"
                                value={monthlyRevenue}
                                onChange={setMonthlyRevenue}
                                icon={BarChart4}
                            />
                            <GoalInput
                                label="יעד עסקאות"
                                value={monthlyDeals}
                                onChange={setMonthlyDeals}
                                icon={Target}
                            />
                        </div>
                    </div>

                    {/* Yearly Goals */}
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <CalendarDays size={16} className="text-violet-500" />
                            יעדים שנתיים
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <GoalInput
                                label="יעד הכנסות (₪)"
                                value={yearlyRevenue}
                                onChange={setYearlyRevenue}
                                icon={BarChart4}
                            />
                            <GoalInput
                                label="יעד עסקאות"
                                value={yearlyDeals}
                                onChange={setYearlyDeals}
                                icon={Target}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl flex items-center gap-2">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
                        >
                            {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</> : 'שמור יעדים'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
