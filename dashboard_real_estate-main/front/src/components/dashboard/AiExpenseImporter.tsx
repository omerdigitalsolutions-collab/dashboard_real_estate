import { useState, useRef, useEffect } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, TrendingUp, TrendingDown, SplitSquareHorizontal, X } from 'lucide-react';
import UpgradeModal from '../ui/UpgradeModal';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../../config/firebase';
import { useExpenses } from '../../hooks/useExpenses';
import { useAuth } from '../../context/AuthContext';
import { Timestamp } from 'firebase/firestore';
import { useSubscriptionGuard } from '../../hooks/useSubscriptionGuard';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Mode: expenses-only file OR a mixed income+expenses file */
type ImportMode = 'expenses' | 'finance';

/** A row parsed by the AI. rowType is only present in 'finance' mode. */
interface ParsedRow {
    description: string;
    amount: number;
    category: string;
    date: string;
    isRecurring: boolean;
    rowType?: 'income' | 'expense'; // finance mode only
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AiExpenseImporter({ onImported }: { onImported?: () => void }) {
    const { addExpense } = useExpenses();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [importMode, setImportMode] = useState<ImportMode>('expenses');
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'parsing' | 'ai_processing' | 'review' | 'saving' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [aiResults, setAiResults] = useState<ParsedRow[]>([]);
    const { userData } = useAuth();

    const { features } = useSubscriptionGuard();
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

    // ── File Selection ────────────────────────────────────────────────────────

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!features.canAccessAiImport) {
            setIsUpgradeModalOpen(true);
            // Reset input so they can click it again later
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        const selected = e.target.files?.[0];
        if (!selected) return;
        setFile(selected);
        setStatus('idle');
        setAiResults([]);
        setErrorMsg('');
    };

    // ── Parse File ────────────────────────────────────────────────────────────

    const processFile = async () => {
        if (!file) return;
        setStatus('parsing');
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: async (results) => {
                    if (results.errors.length > 0) {
                        setStatus('error');
                        setErrorMsg('שגיאה בקריאת הקובץ: ' + results.errors[0].message);
                        return;
                    }
                    await callGemini(results.data);
                },
                error: (err) => {
                    setStatus('error');
                    setErrorMsg('שגיאה ב-PapaParse: ' + err.message);
                }
            });
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            try {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                if (workbook.SheetNames.length === 0) throw new Error('קובץ האקסל ריק');
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                if (rawJson.length === 0) throw new Error('לא נמצאו נתונים בגיליון הראשון');
                await callGemini(rawJson);
            } catch (err: any) {
                setStatus('error');
                setErrorMsg('שגיאה בקריאת קובץ האקסל: ' + err.message);
            }
        } else {
            setStatus('error');
            setErrorMsg('פורמט קובץ לא נתמך. אנא העלה קובץ CSV או Excel.');
        }
    };

    // ── Call Gemini ────────────────────────────────────────────────────────────

    const callGemini = async (rawJsonArray: any[]) => {
        try {
            setStatus('ai_processing');
            const payloadString = JSON.stringify(rawJsonArray).slice(0, 30000);

            const extractFn = httpsCallable<any, { success: boolean; data: ParsedRow[] }>(functions, 'ai-extractAiData');
            const res = await extractFn({
                payload: payloadString,
                entityType: 'expenses', // always 'expenses' — backend only supports this entityType
                mode: 'bulk'
            });

            if (res.data.success && Array.isArray(res.data.data)) {
                const modeled = res.data.data.map(item => ({
                    description: item.description || 'ללא תיאור',
                    amount: Math.abs(Number(item.amount)) || 0,
                    category: item.category || (importMode === 'finance' && item.rowType === 'income' ? 'הכנסה אחרת' : 'שונות'),
                    date: item.date || new Date().toISOString().slice(0, 10),
                    isRecurring: !!item.isRecurring,
                    rowType: item.rowType ?? 'expense', // default to expense for backwards compat
                }));
                setAiResults(modeled);
                setStatus('review');
            } else {
                setStatus('error');
                setErrorMsg('ה-AI החזיר תשובה לא תקינה.');
            }
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setErrorMsg('שגיאה מה-AI: ' + (err.message || 'Unknown error'));
        }
    };

    // ── Helpers ────────────────────────────────────────────────────────────────

    const toggleRecurring = (index: number) => {
        setAiResults(prev => prev.map((item, i) => i === index ? { ...item, isRecurring: !item.isRecurring } : item));
    };

    const toggleRowType = (index: number) => {
        setAiResults(prev => prev.map((item, i) =>
            i === index ? { ...item, rowType: item.rowType === 'income' ? 'expense' : 'income' } : item
        ));
    };

    const removeRow = (index: number) => {
        setAiResults(prev => prev.filter((_, i) => i !== index));
    };

    const expenses = aiResults.filter(r => r.rowType === 'expense');
    const incomes = aiResults.filter(r => r.rowType === 'income');

    // ── Save ──────────────────────────────────────────────────────────────────

    const handleSave = async () => {
        try {
            setStatus('saving');
            // Only save expenses (income is informational — not stored in the expenses subcollection)
            const toSave = importMode === 'finance' ? expenses : aiResults;

            const promises = toSave.map(item => {
                const dt = new Date(item.date);
                if (isNaN(dt.getTime())) dt.setTime(Date.now());
                return addExpense({
                    title: item.description,
                    amount: item.amount,
                    category: item.category,
                    date: Timestamp.fromDate(dt),
                    isRecurring: item.isRecurring
                });
            });

            await Promise.all(promises);
            setStatus('success');
            setTimeout(() => {
                setFile(null);
                setAiResults([]);
                setStatus('idle');
                if (onImported) onImported();
            }, 2000);
        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setErrorMsg('שגיאה בשמירת הנתונים: ' + err.message);
        }
    };

    // ── Row table ─────────────────────────────────────────────────────────────

    const RowTable = ({ rows, colorClass }: { rows: ParsedRow[]; colorClass: string }) => (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/50 mb-4">
            <table className="w-full text-sm text-right">
                <thead className="bg-slate-800 text-slate-400">
                    <tr>
                        <th className="p-3 font-semibold">תיאור</th>
                        <th className="p-3 font-semibold">סכום</th>
                        <th className="p-3 font-semibold">קטגוריה</th>
                        <th className="p-3 font-semibold">תאריך</th>
                        {importMode === 'finance' && <th className="p-3 font-semibold text-center">סוג</th>}
                        <th className="p-3 font-semibold text-center">קבוע?</th>
                        <th className="p-3 font-semibold text-center w-10"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {rows.map((item) => {
                        // Find original index in aiResults for toggle
                        const origIdx = aiResults.indexOf(item);
                        return (
                            <tr key={origIdx} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-3 font-medium text-slate-200">{item.description}</td>
                                <td className={`p-3 font-bold ${colorClass}`} dir="ltr">₪{item.amount.toLocaleString()}</td>
                                <td className="p-3 text-cyan-400 font-medium">{item.category}</td>
                                <td className="p-3 text-slate-500">{item.date}</td>
                                {importMode === 'finance' && (
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => toggleRowType(origIdx)}
                                            title="לחץ לשינוי סוג"
                                            className={`text-xs font-bold px-2 py-0.5 rounded-full border transition-colors ${item.rowType === 'income'
                                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                                                : 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30'
                                                }`}
                                        >
                                            {item.rowType === 'income' ? 'הכנסה' : 'הוצאה'}
                                        </button>
                                    </td>
                                )}
                                <td className="p-3 text-center">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={item.isRecurring}
                                            onChange={() => toggleRecurring(origIdx)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500" />
                                    </label>
                                </td>
                                <td className="p-3 text-center">
                                    <button
                                        onClick={() => removeRow(origIdx)}
                                        title="הסר שורה"
                                        className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-6 shadow-[0_0_30px_rgba(59,130,246,0.05)] text-right" dir="rtl">
            <h2 className="text-xl font-black text-white flex items-center gap-3 mb-2">
                <UploadCloud className="w-6 h-6 text-blue-400" />
                יבוא חכם מקובץ (AI)
            </h2>

            {/* Mode Selector */}
            {status === 'idle' && (
                <div className="flex gap-2 mb-5">
                    <button
                        onClick={() => { setImportMode('expenses'); setAiResults([]); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${importMode === 'expenses'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                            }`}
                    >
                        <TrendingDown size={15} />
                        רק הוצאות
                    </button>
                    <button
                        onClick={() => { setImportMode('finance'); setAiResults([]); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${importMode === 'finance'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                            }`}
                    >
                        <SplitSquareHorizontal size={15} />
                        הכנסות + הוצאות
                    </button>
                </div>
            )}

            <p className="text-sm text-slate-400 mb-6 font-medium">
                {importMode === 'expenses'
                    ? 'העלה קובץ Excel / CSV עם הוצאות בלבד (למשל מפירוט אשראי). ה-AI יקרא את ההוצאות ויקטלג אותן אוטומטית.'
                    : 'העלה קובץ Excel / CSV שמכיל גם הכנסות וגם הוצאות. ה-AI יסווג כל שורה בנפרד.'
                }
            </p>

            {/* Upload Zone */}
            {status === 'idle' && (
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-blue-500/30 bg-blue-500/5 rounded-xl transition-all hover:bg-blue-500/10">
                    <input type="file" accept=".csv, .xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                    >
                        <UploadCloud className="w-5 h-5" />
                        בחר קובץ
                    </button>
                    {file && (
                        <div className="mt-4 flex items-center gap-4 bg-slate-900 px-4 py-2 rounded-lg border border-slate-700">
                            <span className="text-sm text-cyan-400 font-mono truncate max-w-[200px]">{file.name}</span>
                            <button onClick={processFile} className="text-sm bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 px-3 py-1.5 rounded-md font-bold transition-all">
                                עבד עכשיו
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Processing */}
            {(status === 'parsing' || status === 'ai_processing' || status === 'saving') && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
                    <p className="font-bold text-lg text-white">
                        {status === 'parsing' && 'קורא את הקובץ...'}
                        {status === 'ai_processing' && 'Gemini AI מנתח ומסווג את הנתונים...'}
                        {status === 'saving' && 'שומר הוצאות למערכת...'}
                    </p>
                    {status === 'ai_processing' && <p className="text-slate-400 text-sm mt-2">זה יכול לקחת כמה שניות.</p>}
                </div>
            )}

            {/* Success */}
            {status === 'success' && (
                <div className="flex flex-col items-center justify-center py-10 text-emerald-400">
                    <CheckCircle2 className="w-16 h-16 mb-4 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                    <h3 className="text-2xl font-black">היבוא הושלם בהצלחה!</h3>
                </div>
            )}

            {/* Error */}
            {status === 'error' && (
                <div className="flex flex-col items-center justify-center py-8 text-rose-500">
                    <AlertTriangle className="w-12 h-12 mb-3 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
                    <p className="font-bold text-center border border-rose-500/30 bg-rose-500/10 p-3 rounded-lg">{errorMsg}</p>
                    <button onClick={() => setStatus('idle')} className="mt-4 text-sm text-slate-400 hover:text-white underline">נסה שוב</button>
                </div>
            )}

            {/* Review */}
            {status === 'review' && aiResults.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* Header row with summary + save button */}
                    <div className="flex items-center justify-between mb-4 mt-2 flex-wrap gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            {importMode === 'finance' ? (
                                <>
                                    <span className="font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                        <TrendingDown size={14} /> {expenses.length} הוצאות
                                    </span>
                                    <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                        <TrendingUp size={14} /> {incomes.length} הכנסות
                                    </span>
                                </>
                            ) : (
                                <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                    <CheckCircle2 size={14} /> {aiResults.length} הוצאות חולצו
                                </span>
                            )}
                        </div>
                        <button
                            onClick={handleSave}
                            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-black py-2 px-6 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all"
                        >
                            {importMode === 'finance' ? `שמור ${expenses.length} הוצאות` : 'שמור למערכת'}
                        </button>
                    </div>

                    {/* Finance mode: show income section separately */}
                    {importMode === 'finance' && incomes.length > 0 && (
                        <>
                            <h4 className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-2">
                                <TrendingUp size={14} /> הכנסות שזוהו (לא ישמרו כהוצאה)
                            </h4>
                            <RowTable rows={incomes} colorClass="text-emerald-400" />
                        </>
                    )}

                    {/* Expenses section */}
                    {(importMode === 'expenses' ? aiResults : expenses).length > 0 && (
                        <>
                            {importMode === 'finance' && (
                                <h4 className="text-sm font-bold text-rose-400 mb-2 flex items-center gap-2">
                                    <TrendingDown size={14} /> הוצאות שיישמרו במערכת
                                </h4>
                            )}
                            <RowTable
                                rows={importMode === 'finance' ? expenses : aiResults}
                                colorClass="text-rose-400"

                            />
                        </>
                    )}

                    <p className="text-xs text-slate-500 mt-3 text-center">
                        {importMode === 'finance'
                            ? 'לחץ על "הוצאה/הכנסה" בכל שורה כדי לתקן סיווג שגוי. רק ההוצאות ישמרו במערכת.'
                            : 'אנא עבור על הטבלה וסמן "קבוע" (שכירות, מנויים, ביטוחים) כדי שיחושב חודשית בדוח.'
                        }
                    </p>
                </div>
            )}

            <UpgradeModal
                isOpen={isUpgradeModalOpen}
                onClose={() => setIsUpgradeModalOpen(false)}
                featureName="יבוא הוצאות מקובץ (AI)"
            />
        </div>
    );
}
