import { useState, useMemo, useEffect } from 'react';
import { useExpenses } from '../hooks/useExpenses';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useAuth } from '../context/AuthContext';
import { useAgency } from '../hooks/useFirestoreData';
import { calculatePipelineStats } from '../utils/analytics';
import { Wallet, ChevronDown, ChevronUp, UploadCloud, PieChart as PieChartIcon, TrendingDown, TrendingUp, FileText, FileSpreadsheet, Plus, X, RefreshCw, Tag, Trash2, Pencil } from 'lucide-react';
import AiExpenseImporter from '../components/dashboard/AiExpenseImporter';
import { exportPnLToExcel, exportPnLToPDF, PnLReportData } from '../utils/pnlExport';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'react-hot-toast';
import { collection, addDoc, onSnapshot, serverTimestamp, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const CATEGORY_HEBREW: Record<string, string> = {
    'Marketing': 'שיווק',
    'Rent': 'שכירות',
    'Salaries': 'משכורות',
    'Other': 'אחר',
    'שיווק': 'שיווק',
    'תפעול משרד': 'תפעול משרד',
    'שכר': 'שכר',
    'רכבים': 'רכבים',
    'שונות': 'שונות'
};

const CATEGORY_COLORS: Record<string, string> = {
    'Marketing': '#f43f5e',
    'שיווק': '#f43f5e',
    'Rent': '#8b5cf6',
    'תפעול משרד': '#8b5cf6',
    'Salaries': '#0ea5e9',
    'שכר': '#0ea5e9',
    'רכבים': '#f59e0b',
    'Other': '#64748b',
    'שונות': '#64748b'
};

const RANGE_OPTIONS = [
    { label: 'חודש', value: '1' },
    { label: '3 חודשים', value: '3' },
    { label: 'חצי שנה', value: '6' },
    { label: 'שנה', value: '12' },
    { label: '5 שנים', value: '60' },
    { label: 'תקופה חופשית', value: 'custom' },
];

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function formatDateLabel(start: Date, end: Date, months: number, isCustom: boolean): string {
    const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
    if (!isCustom && months === 1) {
        // Exact calendar month
        return `חודש ${HEBREW_MONTHS[end.getMonth()]} ${end.getFullYear()}`;
    }
    return `${fmt(start)}–${fmt(end)}`;
}

const DEFAULT_EXPENSE_CATEGORIES = ['שיווק', 'תפעול משרד', 'שכר', 'רכבים', 'שונות'];
const DEFAULT_INCOME_CATEGORIES = ['עמלה', 'דמי ניהול', 'ייעוץ', 'אחר'];

interface ManualIncome {
    id: string;
    title: string;
    amount: number;
    category: string;
    date: Timestamp;
    isRecurring?: boolean;
}

const FALLBACK_COLOR = '#64748b';

export default function ProfitAndLossDashboard() {
    const { expenses, loading: expensesLoading, addExpense, deleteExpense, updateExpense } = useExpenses();
    const { deals, loading: dataLoading } = useLiveDashboardData();
    const { userData } = useAuth();
    const { agency } = useAgency();
    const [timeRange, setTimeRange] = useState<'1' | '3' | '6' | '12' | '60' | 'custom'>('1');
    const today = new Date();
    const [customRange, setCustomRange] = useState({
        from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
    });
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
    const [showImporter, setShowImporter] = useState(false);

    // ── Add-Entry Panel state ──────────────────────────────────────────────────
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [entryType, setEntryType] = useState<'expense' | 'income'>('expense');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [customCategoryInput, setCustomCategoryInput] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    // Persisted custom categories (per type), start with defaults
    const [customExpenseCategories, setCustomExpenseCategories] = useState<string[]>([]);
    const [customIncomeCategories, setCustomIncomeCategories] = useState<string[]>([]);

    const [form, setForm] = useState({
        title: '',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        isRecurring: false,
    });

    // ── Manual incomes listener ────────────────────────────────────────────────
    const [manualIncomes, setManualIncomes] = useState<ManualIncome[]>([]);
    useEffect(() => {
        if (!userData?.agencyId) return;
        const ref = collection(db, 'agencies', userData.agencyId, 'incomes');
        const unsub = onSnapshot(ref, snap => {
            setManualIncomes(snap.docs.map(d => ({ id: d.id, ...d.data() } as ManualIncome)));
        });
        return () => unsub();
    }, [userData?.agencyId]);

    // Merged category lists
    const expenseCategories = [...DEFAULT_EXPENSE_CATEGORIES, ...customExpenseCategories];
    const incomeCategories = [...DEFAULT_INCOME_CATEGORIES, ...customIncomeCategories];
    const activeCategories = entryType === 'expense' ? expenseCategories : incomeCategories;

    const resetForm = () => {
        setForm({ title: '', amount: '', category: '', date: new Date().toISOString().split('T')[0], isRecurring: false });
        setShowCustomInput(false);
        setCustomCategoryInput('');
        setEditingId(null);
    };

    const handleEdit = (item: any, type: 'expense' | 'income') => {
        const itemDate = item.date?.toDate ? item.date.toDate() : (item.date ? new Date(item.date) : new Date());
        setEntryType(type);
        setEditingId(item.id);
        setForm({
            title: item.title || item.description || '',
            amount: item.amount.toString(),
            category: item.category || '',
            date: itemDate.toISOString().split('T')[0],
            isRecurring: item.isRecurring || false
        });
        setShowAddPanel(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSave = async () => {
        const amount = parseFloat(form.amount);
        if (!form.title.trim() || isNaN(amount) || amount <= 0 || !form.category) {
            toast.error('אנא מלא את כל השדות הנדרשים');
            return;
        }
        setSaving(true);
        try {
            const dateTs = Timestamp.fromDate(new Date(form.date));
            if (entryType === 'expense') {
                if (editingId) {
                    await updateExpense(editingId, {
                        title: form.title.trim(),
                        amount,
                        category: form.category,
                        date: dateTs,
                        isRecurring: form.isRecurring,
                    });
                    toast.success('ההוצאה עודכנה בהצלחה!');
                } else {
                    await addExpense({
                        title: form.title.trim(),
                        amount,
                        category: form.category,
                        date: dateTs,
                        isRecurring: form.isRecurring,
                    });
                    toast.success('ההוצאה נשמרה בהצלחה!');
                }
            } else {
                if (editingId) {
                    const ref = doc(db, 'agencies', userData!.agencyId, 'incomes', editingId);
                    await updateDoc(ref, {
                        title: form.title.trim(),
                        amount,
                        category: form.category,
                        date: dateTs,
                        isRecurring: form.isRecurring,
                        updatedAt: serverTimestamp(),
                    });
                    toast.success('ההכנסה עודכנה בהצלחה!');
                } else {
                    const ref = collection(db, 'agencies', userData!.agencyId, 'incomes');
                    await addDoc(ref, {
                        title: form.title.trim(),
                        amount,
                        category: form.category,
                        date: dateTs,
                        isRecurring: form.isRecurring,
                        createdAt: serverTimestamp(),
                        createdBy: userData!.uid,
                    });
                    toast.success('ההכנסה נשמרה בהצלחה!');
                }
            }
            resetForm();
            setShowAddPanel(false);
        } catch (e: any) {
            toast.error('שגיאה בשמירה: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAddCustomCategory = () => {
        const trimmed = customCategoryInput.trim();
        if (!trimmed) return;
        if (entryType === 'expense') {
            setCustomExpenseCategories(prev => [...new Set([...prev, trimmed])]);
        } else {
            setCustomIncomeCategories(prev => [...new Set([...prev, trimmed])]);
        }
        setForm(f => ({ ...f, category: trimmed }));
        setShowCustomInput(false);
        setCustomCategoryInput('');
    };

    const handleDeleteIncome = async (id: string) => {
        if (!userData?.agencyId) return;
        if (!window.confirm('למחוק את ההכנסה הידנית?')) return;
        try {
            await deleteDoc(doc(db, 'agencies', userData.agencyId, 'incomes', id));
            toast.success('ההכנסה הידנית נמחקה');
        } catch (e) {
            console.error(e);
            toast.error('שגיאה בתהליך המחיקה');
        }
    };

    const toggleCategory = (category: string) => {
        setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
    };

    const loading = expensesLoading || dataLoading;

    const dashboardData = useMemo(() => {
        const now = new Date();
        const isCustom = timeRange === 'custom';
        const months = isCustom ? 1 : parseInt(timeRange);

        // Start / End Date Boundary
        let startDate: Date;
        let endDate: Date;
        if (isCustom) {
            startDate = new Date(customRange.from);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(customRange.to);
            endDate.setHours(23, 59, 59, 999);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = now;
        }
        const dateRangeLabel = formatDateLabel(startDate, endDate, months, isCustom);

        // 1. Gather all deals in range to calculate income and list for report
        const incomesList: any[] = [];
        const rangeDeals = deals.filter(deal => {
            const dealDateVal = deal.updatedAt || deal.createdAt;
            const dealDate = dealDateVal?.toDate ? dealDateVal.toDate() : new Date();

            if (dealDate >= startDate && dealDate <= endDate) {
                const stageNorm = ((deal.stage as string) || '').toLowerCase();
                if (stageNorm === 'won') {
                    // Prefer actual commission (set on close), fallback to projected, then 2% of value
                    const amount =
                        (deal as any).actualCommission ||
                        deal.projectedCommission ||
                        ((deal as any).value ? (deal as any).value * 0.02 : 0);
                    if (amount > 0) {
                        incomesList.push({
                            agentName: (deal as any).assignedAgentName || 'לא משויך',
                            propertyName: (deal as any).propertyName || (deal as any).title || 'עסקה',
                            date: dealDate.toLocaleDateString('he-IL'),
                            amount,
                            source: 'deal'
                        });
                    }
                }
                return true;
            }
            return false;
        });

        const stats = calculatePipelineStats(rangeDeals);
        // Always use incomesList (deals with commission > 0) as the source of truth.
        // stats.revenue is a fallback if incomesList is somehow empty.
        const dealIncome = incomesList.length > 0
            ? incomesList.reduce((acc, curr) => acc + curr.amount, 0)
            : (stats.revenue || 0);

        // Manual incomes in range
        const manualIncomeInRange = manualIncomes
            .filter(mi => {
                const d = mi.date?.toDate ? mi.date.toDate() : new Date();
                if (mi.isRecurring) return true;
                return d >= startDate && d <= endDate;
            })
            .reduce((sum, mi) => {
                if (mi.isRecurring) {
                    const d = mi.date?.toDate ? mi.date.toDate() : new Date();
                    const mDiff = d < startDate
                        ? months
                        : Math.max(1, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) + 1);
                    return sum + mi.amount * mDiff;
                }
                return sum + mi.amount;
            }, 0);

        const income = dealIncome + manualIncomeInRange;

        // 2. Gather expenses.
        let totalExpenses = 0;
        const categoriesMap: Record<string, { total: number, items: any[] }> = {};
        const expensesListForReport: any[] = [];

        expenses.forEach(exp => {
            const expDate = exp.date?.toDate ? exp.date.toDate() : new Date();
            const catKey = CATEGORY_HEBREW[exp.category as string] || exp.category;

            if (!categoriesMap[catKey]) {
                categoriesMap[catKey] = { total: 0, items: [] };
            }

            if (exp.isRecurring) {
                let applicableMonths = 1;
                if (expDate < startDate) {
                    applicableMonths = months;
                } else {
                    const monthDiff = (now.getFullYear() - expDate.getFullYear()) * 12 + (now.getMonth() - expDate.getMonth());
                    applicableMonths = Math.max(1, monthDiff + 1);
                }

                const calculatedAmount = exp.amount * applicableMonths;
                totalExpenses += calculatedAmount;
                categoriesMap[catKey].total += calculatedAmount;
                const formattedItem = { ...exp, displayAmount: calculatedAmount, timesMultiplied: applicableMonths };
                categoriesMap[catKey].items.push(formattedItem);
                expensesListForReport.push({
                    category: catKey,
                    description: exp.title || (exp as any).description || 'הוצאה',
                    date: expDate.toLocaleDateString('he-IL'),
                    amount: calculatedAmount,
                    isRecurring: true,
                    timesMultiplied: applicableMonths
                });

            } else {
                if (expDate >= startDate && expDate <= endDate) {
                    totalExpenses += exp.amount;
                    categoriesMap[catKey].total += exp.amount;
                    categoriesMap[catKey].items.push({ ...exp, displayAmount: exp.amount, timesMultiplied: 1 });
                    expensesListForReport.push({
                        category: catKey,
                        description: exp.title || (exp as any).description || 'הוצאה',
                        date: expDate.toLocaleDateString('he-IL'),
                        amount: exp.amount,
                        isRecurring: false,
                        timesMultiplied: 1
                    });
                }
            }
        });

        expensesListForReport.sort((a, b) => b.amount - a.amount);

        // 3. Profit calculations
        const profit = income - totalExpenses;
        const margin = income > 0 ? (profit / income) * 100 : 0;

        // 4. Pie chart data
        const pieData = Object.entries(categoriesMap)
            .filter(([_, data]) => data.total > 0)
            .map(([name, data]) => ({
                name,
                value: data.total,
                color: CATEGORY_COLORS[name] || CATEGORY_COLORS['Other']
            }))
            .sort((a, b) => b.value - a.value);

        // 5. Sorted categories list for accordion
        const accordionData = Object.entries(categoriesMap)
            .filter(([_, data]) => data.items.length > 0)
            .sort((a, b) => b[1].total - a[1].total);

        // 6. Build the PnLReportData payload (combine deal incomes + manual incomes)
        const allIncomesForReport = [
            ...incomesList.map(i => ({ ...i, category: 'עמלת עסקאות' })),
            ...manualIncomes
                .filter(mi => {
                    const d = mi.date?.toDate ? mi.date.toDate() : new Date();
                    return mi.isRecurring ? true : d >= startDate;
                })
                .map(mi => ({
                    agentName: '-',
                    propertyName: mi.title,
                    date: mi.date?.toDate ? mi.date.toDate().toLocaleDateString('he-IL') : '',
                    amount: mi.isRecurring
                        ? (() => {
                            const d = mi.date?.toDate ? mi.date.toDate() : new Date();
                            const mDiff = d < startDate ? months : Math.max(1, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) + 1);
                            return mi.amount * mDiff;
                        })()
                        : mi.amount,
                    category: mi.category,
                    source: 'manual'
                }))
        ];

        const reportData: PnLReportData = {
            // @ts-ignore
            agencyName: agency?.agencyName || userData?.agencyName || 'homer Real Estate',
            // @ts-ignore
            agencyLogo: agency?.settings?.logoUrl || userData?.agencyLogo || '',
            userLogo: userData?.photoURL || '',
            dateRangeLabel,
            totalRevenue: income,
            totalExpenses,
            netProfit: profit,
            profitMargin: margin,
            incomes: allIncomesForReport,
            expenses: expensesListForReport,
            expenseCategories: accordionData.map(a => ({ category: a[0], total: a[1].total, itemsCount: a[1].items.length }))
        };

        return {
            totalExpenses,
            monthlyIncome: income,
            grossMargin: margin,
            profit,
            expensesPieData: pieData,
            accordionData,
            reportData,
            incomesList
        };
    }, [expenses, deals, timeRange, customRange, userData, manualIncomes]);

    const { totalExpenses, monthlyIncome, grossMargin, profit, expensesPieData, accordionData, reportData, incomesList } = dashboardData;

    const handleDownload = async (type: 'pdf' | 'excel') => {
        const toastId = toast.loading('מייצר דוח...');
        try {
            const fileName = `homer_pnl_report_${reportData.dateRangeLabel.replace(/ /g, '_')}_${new Date().getTime()}`;
            if (type === 'excel') {
                exportPnLToExcel(reportData, fileName);
            } else {
                await exportPnLToPDF(reportData, fileName);
            }
            toast.success('הדוח הופק והורד בהצלחה!', { id: toastId });
        } catch (error) {
            console.error('Export error', error);
            toast.error('שגיאה בהפקת הדוח.', { id: toastId });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[500px]">
                <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500" dir="rtl">

            {/* ── Header ─────────────────────────────────────── */}
            <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl shadow-xl">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-black text-white flex items-center gap-3">
                                <Wallet className="w-8 h-8 text-pink-500" />
                                דוח רווח והפסד
                            </h1>
                            <p className="text-slate-400 mt-1">ניהול פיננסי חכם, מעקב הוצאות וחישוב רווחיות</p>
                        </div>

                        {/* Split Add Buttons + Export */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                onClick={() => {
                                    setEntryType('expense');
                                    setShowAddPanel(true);
                                    setShowImporter(false);
                                    resetForm();
                                }}
                                className="flex items-center gap-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 hover:border-rose-400 text-rose-300 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg whitespace-nowrap"
                            >
                                <Plus className="w-4 h-4" />
                                הוצאה חדשה
                            </button>
                            <button
                                onClick={() => {
                                    setEntryType('income');
                                    setShowAddPanel(true);
                                    setShowImporter(false);
                                    resetForm();
                                }}
                                className="flex items-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 hover:border-emerald-400 text-emerald-300 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg whitespace-nowrap"
                            >
                                <Plus className="w-4 h-4" />
                                הכנסה חדשה
                            </button>
                            <button
                                onClick={() => handleDownload('pdf')}
                                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg whitespace-nowrap"
                            >
                                <FileText className="w-4 h-4 shrink-0" />
                                PDF
                            </button>
                            <button
                                onClick={() => handleDownload('excel')}
                                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg whitespace-nowrap"
                            >
                                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                                Excel
                            </button>
                        </div>
                    </div>

                    {/* Time range filter */}
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex bg-slate-800/60 p-1.5 rounded-xl border border-slate-700 flex-wrap gap-1">
                            {RANGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setTimeRange(opt.value as any)}
                                    className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${timeRange === opt.value
                                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        {timeRange === 'custom' && (
                            <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                                <span className="text-slate-400 text-sm font-medium">מ-</span>
                                <input
                                    type="date"
                                    value={customRange.from}
                                    onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
                                    className="bg-transparent text-white text-sm font-medium border-none outline-none cursor-pointer"
                                />
                                <span className="text-slate-400 text-sm font-medium">עד-</span>
                                <input
                                    type="date"
                                    value={customRange.to}
                                    onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
                                    className="bg-transparent text-white text-sm font-medium border-none outline-none cursor-pointer"
                                />
                            </div>
                        )}
                        <span className="text-slate-500 text-sm font-medium hidden md:block">
                            תקופה: <span className="text-pink-400 font-bold">{reportData.dateRangeLabel}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* ── KPI Cards ──────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-6 flex items-center gap-5 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                        <TrendingUp className="w-7 h-7 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400 font-medium mb-1">הכנסות ממומשות</p>
                        <p className="text-3xl font-black text-white">₪{monthlyIncome.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-slate-900/60 border border-rose-500/20 rounded-2xl p-6 flex items-center gap-5 shadow-[0_0_15px_rgba(244,63,94,0.05)]">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 shrink-0">
                        <TrendingDown className="w-7 h-7 text-rose-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400 font-medium mb-1">סך הוצאות</p>
                        <p className="text-3xl font-black text-rose-400">₪{totalExpenses.toLocaleString()}</p>
                    </div>
                </div>

                <div className={`bg-slate-900/60 border rounded-2xl p-6 flex items-center justify-between shadow-xl ${profit >= 0 ? 'border-cyan-500/30' : 'border-rose-500/30'}`}>
                    <div>
                        <p className="text-sm text-slate-400 font-medium mb-1">
                            {profit >= 0 ? 'רווח נקי (לפני מס)' : 'הפסד (לפני מס)'}
                        </p>
                        <p className={`text-3xl font-black ${profit >= 0 ? 'text-cyan-400' : 'text-rose-500'}`}>
                            ₪{Math.abs(profit).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500 mt-2 bg-slate-800/50 inline-block px-2 py-1 rounded-md">
                            שולי {profit >= 0 ? 'רווח' : 'הפסד'}: <span className={grossMargin >= 0 ? 'text-cyan-400 font-bold' : 'text-rose-400 font-bold'}>{Math.abs(grossMargin).toFixed(1)}%</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Add Entry Panel ─────────────────────────────── */}
            {showAddPanel && (
                <div className="bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-6 shadow-2xl shadow-cyan-500/10 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-black text-white flex items-center gap-2">
                            {editingId ? <Pencil className="w-5 h-5 text-cyan-400" /> : <Plus className="w-5 h-5 text-cyan-400" />}
                            {editingId ? 'עריכת רשומה' : 'הוספת רשומה חדשה'}
                        </h3>
                        <button onClick={() => { setShowAddPanel(false); resetForm(); }} className="text-slate-400 hover:text-white transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Type Toggle - Hide if editing */}
                    {!editingId && (
                        <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 w-max mb-6">
                            <button
                                onClick={() => { setEntryType('expense'); setForm(f => ({ ...f, category: '' })); }}
                                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${entryType === 'expense'
                                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                <TrendingDown className="w-4 h-4" /> הוצאה
                            </button>
                            <button
                                onClick={() => { setEntryType('income'); setForm(f => ({ ...f, category: '' })); }}
                                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${entryType === 'income'
                                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                                    : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                <TrendingUp className="w-4 h-4" /> הכנסה
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Title */}
                        <div className="lg:col-span-1">
                            <label className="text-xs font-bold text-slate-400 mb-1.5 block">תיאור *</label>
                            <input
                                type="text"
                                placeholder={entryType === 'expense' ? 'למשל: שכירות משרד' : 'למשל: עמלת עסקה'}
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                            />
                        </div>

                        {/* Amount */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 mb-1.5 block">סכום (₪) *</label>
                            <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={form.amount}
                                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                                dir="ltr"
                            />
                        </div>

                        {/* Date */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 mb-1.5 block">תאריך *</label>
                            <input
                                type="date"
                                value={form.date}
                                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                                dir="ltr"
                            />
                        </div>

                        {/* Category */}
                        <div className="sm:col-span-2 lg:col-span-2">
                            <label className="text-xs font-bold text-slate-400 mb-1.5 block flex items-center gap-1">
                                <Tag className="w-3 h-3" /> קטגוריה *
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={showCustomInput ? '__custom__' : form.category}
                                    onChange={e => {
                                        if (e.target.value === '__custom__') {
                                            setShowCustomInput(true);
                                            setForm(f => ({ ...f, category: '' }));
                                        } else {
                                            setShowCustomInput(false);
                                            setForm(f => ({ ...f, category: e.target.value }));
                                        }
                                    }}
                                    className="flex-1 bg-slate-800 border border-slate-700 focus:border-cyan-500 text-white rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                                >
                                    <option value="" disabled>בחר קטגוריה...</option>
                                    {activeCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="__custom__">➕ הוסף קטגוריה חדשה</option>
                                </select>
                            </div>
                            {/* Custom category input */}
                            {showCustomInput && (
                                <div className="flex gap-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="שם הקטגוריה החדשה..."
                                        value={customCategoryInput}
                                        onChange={e => setCustomCategoryInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddCustomCategory(); }}
                                        className="flex-1 bg-slate-800 border border-cyan-500/50 focus:border-cyan-500 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm outline-none"
                                    />
                                    <button
                                        onClick={handleAddCustomCategory}
                                        className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-white rounded-xl text-sm font-bold transition-colors"
                                    >
                                        הוסף
                                    </button>
                                    <button
                                        onClick={() => { setShowCustomInput(false); setCustomCategoryInput(''); }}
                                        className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Recurring toggle */}
                        <div className="flex items-center">
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <div
                                    onClick={() => setForm(f => ({ ...f, isRecurring: !f.isRecurring }))}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${form.isRecurring ? 'bg-purple-500' : 'bg-slate-700'
                                        }`}
                                >
                                    <div className={`absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${form.isRecurring ? 'translate-x-0' : '-translate-x-5'
                                        }`} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white flex items-center gap-1">
                                        <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                                        {entryType === 'expense' ? 'הוצאה קבועה חודשית' : 'הכנסה חוזרת'}
                                    </p>
                                    <p className="text-[11px] text-slate-500">מוסיפה אוטומטית לכל חודש בטווח</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Save button */}
                    <div className="flex justify-end mt-5 pt-5 border-t border-slate-800">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-black text-sm transition-all shadow-lg shadow-cyan-500/20"
                        >
                            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : (editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
                            {saving ? 'שומר...' : (editingId ? 'עדכן רשומה' : `שמור ${entryType === 'expense' ? 'הוצאה' : 'הכנסה'}`)}
                        </button>
                    </div>
                </div>
            )}

            {/* ── AI Importer Toggle ─────────────────────────── */}
            <div className="flex justify-start">
                <button
                    onClick={() => { setShowImporter(!showImporter); setShowAddPanel(false); }}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg"
                >
                    <UploadCloud className="w-5 h-5 text-blue-400" />
                    הוסף הוצאות מאקסל (AI)
                </button>
            </div>
            {showImporter && (
                <div className="animate-in slide-in-from-top-4 duration-300">
                    <AiExpenseImporter onImported={() => setShowImporter(false)} />
                </div>
            )}

            {/* ── Main Content: Charts & Accordion ───────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Right col: Expense + Income Accordion Breakdown */}
                <div className="lg:col-span-2 space-y-8">

                    {/* ── Expense Breakdown ── */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingDown className="w-5 h-5 text-rose-400" />
                            פירוט הוצאות לפי קטגוריה
                        </h3>
                        {accordionData.length === 0 ? (
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                                אין הוצאות מתועדות לטווח הזמן שנבחר.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {accordionData.map(([categoryName, data]) => {
                                    const isExpanded = expandedCategories[categoryName];
                                    const catColor = CATEGORY_COLORS[categoryName] || FALLBACK_COLOR;
                                    return (
                                        <div key={categoryName} className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-md hover:border-slate-700 transition-all">
                                            <div onClick={() => toggleCategory(categoryName)} className="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-slate-800/30 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: catColor }} />
                                                    <div>
                                                        <h4 className="text-lg font-bold text-white">{categoryName}</h4>
                                                        <span className="text-xs text-slate-400">{data.items.length} רשומות</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-black text-lg text-rose-400" dir="ltr">₪{data.total.toLocaleString()}</span>
                                                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div className="border-t border-slate-800 bg-slate-950/50 p-4 animate-in slide-in-from-top-2 duration-200">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-right text-sm">
                                                            <thead className="text-slate-500 border-b border-slate-800">
                                                                <tr>
                                                                    <th className="pb-2 font-medium">תיאור</th>
                                                                    <th className="pb-2 font-medium">תאריך</th>
                                                                    <th className="pb-2 font-medium text-center">קבועה</th>
                                                                    <th className="pb-2 font-medium">סכום</th>
                                                                    <th className="pb-2 font-medium">מחושב לתקופה</th>
                                                                    <th className="pb-2"></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-800 text-slate-300">
                                                                {data.items.sort((a: any, b: any) => b.amount - a.amount).map((item: any, idx: number) => (
                                                                    <tr key={idx} className="hover:bg-slate-800/30 group">
                                                                        <td className="py-3 font-medium text-white">{item.title}</td>
                                                                        <td className="py-3 text-slate-400">{item.date?.toDate ? item.date.toDate().toLocaleDateString('he-IL') : 'N/A'}</td>
                                                                        <td className="py-3 text-center">
                                                                            {item.isRecurring
                                                                                ? <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-md text-[10px] font-bold">קבוע</span>
                                                                                : <span className="text-slate-600">-</span>}
                                                                        </td>
                                                                        <td className="py-3" dir="ltr">₪{item.amount.toLocaleString()}</td>
                                                                        <td className="py-3 text-rose-400 font-bold" dir="ltr">
                                                                            ₪{item.displayAmount.toLocaleString()}
                                                                            {item.timesMultiplied > 1 && <span className="text-xs text-slate-500 font-normal ml-2">(x{item.timesMultiplied} חוד')</span>}
                                                                        </td>
                                                                        <td className="py-3 text-right">
                                                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                                                <button
                                                                                    onClick={() => handleEdit(item, 'expense')}
                                                                                    className="text-slate-400 hover:text-cyan-400 p-1"
                                                                                    title="ערוך"
                                                                                >
                                                                                    <Pencil className="w-4 h-4" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        if (!window.confirm('למחוק את ההוצאה?')) return;
                                                                                        try {
                                                                                            await deleteExpense(item.id);
                                                                                            toast.success('ההוצאה נמחקה');
                                                                                        } catch (e) { 
                                                                                            console.error(e);
                                                                                            toast.error('שגיאה במחיקה');
                                                                                        }
                                                                                    }}
                                                                                    className="text-slate-400 hover:text-rose-400 p-1"
                                                                                    title="מחק"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Income Breakdown ── */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                            פירוט הכנסות
                        </h3>

                        {/* Deal commissions */}
                        {incomesList.length > 0 && (
                            <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl overflow-hidden shadow-md">
                                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded-full bg-cyan-400" />
                                        <div>
                                            <h4 className="text-base font-bold text-white">עמלת עסקאות</h4>
                                            <span className="text-xs text-slate-400">{incomesList.length} עסקאות שנסגרו</span>
                                        </div>
                                    </div>
                                    <span className="font-black text-lg text-cyan-400" dir="ltr">
                                        ₪{incomesList.reduce((s: number, i: any) => s + i.amount, 0).toLocaleString()}
                                    </span>
                                </div>
                                <div className="p-4">
                                    <table className="w-full text-right text-sm">
                                        <thead className="text-slate-500 border-b border-slate-800">
                                            <tr>
                                                <th className="pb-2 font-medium">נכס</th>
                                                <th className="pb-2 font-medium">סוכן</th>
                                                <th className="pb-2 font-medium">תאריך</th>
                                                <th className="pb-2 font-medium">עמלה</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800 text-slate-300">
                                            {[...incomesList].sort((a: any, b: any) => b.amount - a.amount).map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-slate-800/30">
                                                    <td className="py-3 font-medium text-white">{item.propertyName}</td>
                                                    <td className="py-3 text-slate-400">{item.agentName}</td>
                                                    <td className="py-3 text-slate-400">{item.date}</td>
                                                    <td className="py-3 text-cyan-400 font-bold" dir="ltr">₪{item.amount.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Manual income entries */}
                        {manualIncomes.length > 0 && (
                            <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl overflow-hidden shadow-md">
                                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded-full bg-emerald-400" />
                                        <div>
                                            <h4 className="text-base font-bold text-white">הכנסות ידניות</h4>
                                            <span className="text-xs text-slate-400">{manualIncomes.length} רשומות</span>
                                        </div>
                                    </div>
                                    <span className="font-black text-lg text-emerald-400" dir="ltr">
                                        ₪{manualIncomes.reduce((s, mi) => s + mi.amount, 0).toLocaleString()}
                                    </span>
                                </div>
                                <div className="p-4">
                                    <table className="w-full text-right text-sm">
                                        <thead className="text-slate-500 border-b border-slate-800">
                                            <tr>
                                                <th className="pb-2 font-medium">תיאור</th>
                                                <th className="pb-2 font-medium">קטגוריה</th>
                                                <th className="pb-2 font-medium">תאריך</th>
                                                <th className="pb-2 font-medium text-center">חוזרת</th>
                                                <th className="pb-2 font-medium">סכום</th>
                                                <th className="pb-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800 text-slate-300">
                                            {manualIncomes.sort((a, b) => b.amount - a.amount).map(mi => (
                                                <tr key={mi.id} className="hover:bg-slate-800/30 group">
                                                    <td className="py-3 font-medium text-white">{mi.title}</td>
                                                    <td className="py-3">
                                                        <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md text-[11px] font-bold">{mi.category}</span>
                                                    </td>
                                                    <td className="py-3 text-slate-400">{mi.date?.toDate ? mi.date.toDate().toLocaleDateString('he-IL') : 'N/A'}</td>
                                                    <td className="py-3 text-center">
                                                        {mi.isRecurring
                                                            ? <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-md text-[10px] font-bold">קבוע</span>
                                                            : <span className="text-slate-600">-</span>}
                                                    </td>
                                                    <td className="py-3 text-emerald-400 font-bold" dir="ltr">₪{mi.amount.toLocaleString()}</td>
                                                    <td className="py-3 text-right">
                                                        <button
                                                            onClick={() => handleDeleteIncome(mi.id)}
                                                            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-all"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {incomesList.length === 0 && manualIncomes.length === 0 && (
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                                אין הכנסות מתועדות לטווח הזמן שנבחר.
                            </div>
                        )}
                    </div>
                </div>

                {/* Left col: Pie Chart */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl h-max sticky top-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                        <PieChartIcon className="w-5 h-5 text-slate-400" />
                        פילוח הוצאות
                    </h3>

                    {expensesPieData.length > 0 ? (
                        <>
                            <div className="h-48 w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={expensesPieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {expensesPieData.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    return (
                                                        <div className="bg-slate-900/90 backdrop-blur-md rounded-xl px-4 py-3 shadow-2xl border border-slate-700 text-right" dir="rtl">
                                                            <p className="text-sm font-bold text-white mb-1">{payload[0].name}</p>
                                                            <p className="text-xs text-slate-300">₪{payload[0].value?.toLocaleString()}</p>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>

                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-slate-400 text-xs">סה"כ</span>
                                    <span className="text-white font-black text-lg">₪{totalExpenses.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="mt-8 space-y-3">
                                {expensesPieData.map((item: any) => {
                                    const percentage = totalExpenses > 0 ? Math.round((item.value / totalExpenses) * 100) : 0;
                                    return (
                                        <div key={item.name} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                                <span className="text-sm text-slate-300 font-medium">{item.name}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-bold text-white">₪{item.value.toLocaleString()}</span>
                                                <span className="text-xs font-medium text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded w-10 text-center">
                                                    {percentage}%
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <PieChartIcon className="w-12 h-12 mb-3 opacity-20" />
                            <p className="text-sm">אין מספיק נתונים לתרשים</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
