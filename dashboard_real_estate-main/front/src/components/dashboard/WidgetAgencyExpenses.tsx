import { useState, useMemo } from 'react';
import { useExpenses } from '../../hooks/useExpenses';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { calculatePipelineStats } from '../../utils/analytics';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Timestamp } from 'firebase/firestore';
import { Plus, Wallet, Loader2, ChevronDown } from 'lucide-react';

export default function WidgetAgencyExpenses() {
    const { expenses, loading: expensesLoading, addExpense } = useExpenses();
    const { deals, loading: dataLoading } = useLiveDashboardData();
    const [timeRange, setTimeRange] = useState<'1' | '3' | '6' | '12'>('1');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Marketing');
    const [date, setDate] = useState(() => {
        const today = new Date();
        return today.toISOString().slice(0, 10); // YYYY-MM-DD
    });

    const CATEGORIES = ['Marketing', 'Rent', 'Salaries', 'Other'];
    const RANGE_OPTIONS = [
        { label: 'חודש', value: '1' },
        { label: '3 חודשים', value: '3' },
        { label: '6 חודשים', value: '6' },
        { label: 'שנה', value: '12' },
    ];

    const CATEGORY_COLORS: Record<string, string> = {
        'Marketing': '#f43f5e', // rose-500
        'Rent': '#8b5cf6', // violet-500
        'Salaries': '#0ea5e9', // py-sky-500
        'Other': '#64748b' // slate-500
    };

    const CATEGORY_HEBREW: Record<string, string> = {
        'Marketing': 'שיווק',
        'Rent': 'שכירות',
        'Salaries': 'משכורות',
        'Other': 'אחר'
    };

    const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-3 shadow-2xl border border-slate-700 text-right" dir="rtl">
                    <p className="text-sm font-bold text-white mb-1">{payload[0].name}</p>
                    <p className="text-xs text-slate-300">₪{payload[0].value.toLocaleString()}</p>
                </div>
            );
        }
        return null;
    };

    const loading = expensesLoading || dataLoading;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !amount) return;

        try {
            setIsSubmitting(true);
            const dt = new Date(date);
            await addExpense({
                title,
                amount: Number(amount),
                category,
                date: Timestamp.fromDate(dt),
            });
            // Reset form
            setTitle('');
            setAmount('');
            setCategory('Marketing');
        } catch (error) {
            console.error('Error adding expense:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredData = useMemo(() => {
        const now = new Date();
        const months = parseInt(timeRange);

        // Calculate start of the range (N months ago)
        const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
        startDate.setHours(0, 0, 0, 0);

        const rangeExpenses = expenses.filter(exp => {
            const expDate = exp.date?.toDate ? exp.date.toDate() : new Date();
            return expDate >= startDate;
        });

        const rangeDeals = deals.filter(deal => {
            const dealDateVal = deal.updatedAt || deal.createdAt;
            const dealDate = dealDateVal?.toDate ? dealDateVal.toDate() : new Date();
            return dealDate >= startDate;
        });

        const totalExpenses = rangeExpenses.reduce((sum, exp) => sum + exp.amount, 0);

        // calculatePipelineStats will naturally only sum `actualCommission` for "won" deals.
        const stats = calculatePipelineStats(rangeDeals);
        const income = stats.revenue || 0;

        const profit = income - totalExpenses;
        const margin = income > 0 ? (profit / income) * 100 : 0;

        const categoriesMap: Record<string, number> = {};
        rangeExpenses.forEach(exp => {
            categoriesMap[exp.category] = (categoriesMap[exp.category] || 0) + exp.amount;
        });

        const pieData = Object.entries(categoriesMap)
            .map(([name, value]) => ({
                name: CATEGORY_HEBREW[name] || name,
                value,
                color: CATEGORY_COLORS[name] || CATEGORY_COLORS['Other']
            }))
            .sort((a, b) => b.value - a.value);

        return {
            totalExpenses,
            monthlyIncome: income,
            grossMargin: margin,
            expensesPieData: pieData
        };
    }, [expenses, deals, timeRange]);

    const { totalExpenses, monthlyIncome, grossMargin, expensesPieData } = filteredData;

    const RADIAN = Math.PI / 180;
    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
        if (percent < 0.05) return null;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        return (
            <text
                x={x}
                y={y}
                fill="white"
                textAnchor="middle"
                dominantBaseline="central"
                className="text-[10px] font-bold pointer-events-none"
            >
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-4 lg:p-5 h-full flex flex-col">
            {/* Header & Totals */}
            <div className="flex justify-between items-start mb-4 shrink-0">
                <div className="flex flex-col gap-3 w-full">
                    <div className="flex justify-between items-center">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                            <Wallet size={18} className="text-pink-500" />
                            דוח רווח והפסד
                        </h2>

                        <div className="flex gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-700">
                            {RANGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setTimeRange(opt.value as any)}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${timeRange === opt.value
                                        ? 'bg-pink-500 text-white shadow-lg'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-6 justify-between bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400 font-medium">הכנסות</span>
                            <span className="text-lg font-bold text-emerald-400">₪{monthlyIncome.toLocaleString()}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-700"></div>
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400 font-medium">הוצאות</span>
                            <span className="text-lg font-bold text-pink-400">₪{totalExpenses.toLocaleString()}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-700"></div>
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400 font-medium">רווח גולמי</span>
                            <span className={`text-lg font-bold ${grossMargin >= 0 ? "text-cyan-400" : "text-rose-500"}`}>
                                {grossMargin.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 gap-4">
                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 shrink-0 flex flex-col gap-2.5">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            required
                            placeholder="תיאור ההוצאה"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 w-full"
                        />
                        <div className="relative w-32 shrink-0">
                            <input
                                type="number"
                                required
                                min="0"
                                placeholder="₪ סכום"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 w-full pr-6 text-left"
                                dir="ltr"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="appearance-none bg-slate-900 border border-slate-700 text-sm text-slate-300 rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-cyan-500 w-full"
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>
                                        {cat === 'Marketing' ? 'שיווק' : cat === 'Rent' ? 'שכירות' : cat === 'Salaries' ? 'משכורות' : 'אחר'}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        </div>
                        <div className="relative flex-1">
                            <input
                                type="date"
                                required
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-sm text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500 w-full"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-pink-500 hover:bg-pink-600 text-white rounded-lg px-3 py-1.5 flex items-center justify-center shrink-0 w-10 disabled:opacity-50 transition-colors"
                        >
                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        </button>
                    </div>
                </form>

                {/* Pie Chart & Legend */}
                <div className="flex-1 flex flex-col items-center bg-slate-900/30 rounded-xl border border-slate-800 p-2 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                        </div>
                    ) : expensesPieData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full p-6 text-slate-500 text-sm text-center">
                            <Wallet size={24} className="mb-2 opacity-50" />
                            אין הוצאות מתועדות לחודש זה
                        </div>
                    ) : (
                        <>
                            <div className="w-full flex-1 min-h-[140px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={expensesPieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={45}
                                            outerRadius={70}
                                            paddingAngle={2}
                                            dataKey="value"
                                            stroke="#0f172a"
                                            strokeWidth={2}
                                            labelLine={false}
                                            label={renderCustomizedLabel}
                                        >
                                            {expensesPieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="w-full mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 min-h-[50px] pr-1">
                                {expensesPieData.map(item => {
                                    const percentage = totalExpenses > 0 ? Math.round((item.value / totalExpenses) * 100) : 0;
                                    return (
                                        <div key={item.name} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                                                <span className="text-[10px] text-slate-300 font-medium truncate max-w-[60px]">{item.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-slate-200">₪{item.value.toLocaleString()}</span>
                                                <span className="text-[9px] font-medium text-slate-500 bg-slate-900 border border-slate-800 px-1 rounded">
                                                    {percentage}%
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
