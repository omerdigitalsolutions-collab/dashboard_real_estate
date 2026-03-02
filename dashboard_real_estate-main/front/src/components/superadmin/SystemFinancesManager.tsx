import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../../config/firebase';
import { Plus, Trash2, Loader2, Cloud, Megaphone, CheckCircle2 } from 'lucide-react';

interface FixedSubscription {
    id: string;
    name: string;
    monthlyCost: number;
}

interface VariableCost {
    id: string;
    month: string;
    serviceName: string;
    cost: number;
}

interface MarketingCost {
    id: string;
    month: string;
    platform: string;
    cost: number;
}

export default function SystemFinancesManager() {
    const [activeTab, setActiveTab] = useState<'fixed' | 'variable' | 'marketing'>('fixed');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Data State
    const [fixedSubscriptions, setFixedSubscriptions] = useState<FixedSubscription[]>([]);
    const [variableCosts, setVariableCosts] = useState<VariableCost[]>([]);
    const [marketingCosts, setMarketingCosts] = useState<MarketingCost[]>([]);

    // Form inputs
    const [fixedName, setFixedName] = useState('');
    const [fixedCost, setFixedCost] = useState('');

    const [variableMonth, setVariableMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [variableService, setVariableService] = useState('');
    const [variableCost, setVariableCost] = useState('');

    const [marketingMonth, setMarketingMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [marketingPlatform, setMarketingPlatform] = useState('Meta Ads');
    const [marketingCost, setMarketingCost] = useState('');

    useEffect(() => {
        const docRef = doc(db, 'admin_settings', 'finances');
        const unsub = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFixedSubscriptions(data.fixedSubscriptions || []);
                setVariableCosts(data.variableCosts || []);
                setMarketingCosts(data.marketingCosts || []);
            }
            setLoading(false);
        }, (error) => {
            console.error('Error fetching finances:', error);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const superAdminUpdateExpenses = httpsCallable(functions, 'superadmin-superAdminUpdateExpenses');

            let payloadData: any = null;

            if (activeTab === 'fixed') {
                if (!fixedName || !fixedCost || Number(fixedCost) < 0) return;
                payloadData = { id: Date.now().toString(), name: fixedName, monthlyCost: Number(fixedCost) };
            } else if (activeTab === 'variable') {
                if (!variableService || !variableCost || Number(variableCost) < 0) return;
                payloadData = { id: Date.now().toString(), month: variableMonth, serviceName: variableService, cost: Number(variableCost) };
            } else if (activeTab === 'marketing') {
                if (!marketingPlatform || !marketingCost || Number(marketingCost) < 0) return;
                payloadData = { id: Date.now().toString(), month: marketingMonth, platform: marketingPlatform, cost: Number(marketingCost) };
            }

            if (!payloadData) throw new Error("Invalid Input");

            await superAdminUpdateExpenses({
                type: activeTab,
                action: 'add',
                data: payloadData
            });

            // Reset inputs
            setFixedName(''); setFixedCost('');
            setVariableService(''); setVariableCost('');
            // Resetting marketing Platform might be annoying, keep the default or user selection
            setMarketingCost('');

        } catch (error) {
            console.error('Error adding expense:', error);
            alert('שגיאה בשמירת ההוצאה');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveExpense = async (type: 'fixed' | 'variable' | 'marketing', item: any) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק הוצאה זו?')) return;

        try {
            const superAdminUpdateExpenses = httpsCallable(functions, 'superadmin-superAdminUpdateExpenses');
            await superAdminUpdateExpenses({
                type,
                action: 'remove',
                data: item
            });
        } catch (error) {
            console.error('Error removing expense:', error);
            alert('שגיאה במחיקת ההוצאה');
        }
    };

    // Filtered lists for variable & marketing
    const filteredVariableCosts = variableCosts.filter(c => c.month === variableMonth);
    const filteredMarketingCosts = marketingCosts.filter(c => c.month === marketingMonth);

    return (
        <div className="rounded-2xl border bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow overflow-hidden flex flex-col" dir="rtl">
            {/* Header / Tabs */}
            <div className="flex border-b border-slate-700/80 p-2 gap-2 overflow-x-auto shrink-0">
                <button
                    onClick={() => setActiveTab('fixed')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${activeTab === 'fixed' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                    <CheckCircle2 className="w-4 h-4" /> מנויים קבועים
                </button>
                <button
                    onClick={() => setActiveTab('variable')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${activeTab === 'variable' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                    <Cloud className="w-4 h-4" /> הוצאות משתנות / ענן
                </button>
                <button
                    onClick={() => setActiveTab('marketing')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${activeTab === 'marketing' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                    <Megaphone className="w-4 h-4" /> שיווק
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center p-10">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                </div>
            ) : (
                <div className="p-4 flex-1 display-flex flex-col gap-6">
                    {/* Add Form */}
                    <form onSubmit={handleAddExpense} className="flex flex-col sm:flex-row gap-3 items-end bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                        {activeTab === 'fixed' && (
                            <>
                                <div className="flex-1 w-full">
                                    <label className="block text-xs text-slate-400 mb-1">שם השירות</label>
                                    <input required type="text" value={fixedName} onChange={e => setFixedName(e.target.value)} placeholder="לדוג׳: Claude AI, Gemini" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
                                </div>
                                <div className="w-full sm:w-32">
                                    <label className="block text-xs text-slate-400 mb-1">עלות חודשית ($)</label>
                                    <input required type="number" min="0" step="0.01" value={fixedCost} onChange={e => setFixedCost(e.target.value)} placeholder="0.00" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500" />
                                </div>
                            </>
                        )}

                        {activeTab === 'variable' && (
                            <>
                                <div className="w-full sm:w-36">
                                    <label className="block text-xs text-slate-400 mb-1">חודש חיוב</label>
                                    <input required type="month" value={variableMonth} onChange={e => setVariableMonth(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500 [color-scheme:dark]" />
                                </div>
                                <div className="flex-1 w-full">
                                    <label className="block text-xs text-slate-400 mb-1">שם השירות</label>
                                    <input required type="text" value={variableService} onChange={e => setVariableService(e.target.value)} placeholder="לדוג׳: Firebase, Resend API" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500" />
                                </div>
                                <div className="w-full sm:w-32">
                                    <label className="block text-xs text-slate-400 mb-1">עלות ($)</label>
                                    <input required type="number" min="0" step="0.01" value={variableCost} onChange={e => setVariableCost(e.target.value)} placeholder="0.00" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500" />
                                </div>
                            </>
                        )}

                        {activeTab === 'marketing' && (
                            <>
                                <div className="w-full sm:w-36">
                                    <label className="block text-xs text-slate-400 mb-1">חודש חיוב</label>
                                    <input required type="month" value={marketingMonth} onChange={e => setMarketingMonth(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-500 [color-scheme:dark]" />
                                </div>
                                <div className="flex-1 w-full">
                                    <label className="block text-xs text-slate-400 mb-1">פלטפורמה</label>
                                    <select required value={marketingPlatform} onChange={e => setMarketingPlatform(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-500">
                                        <option value="Meta Ads">Meta Ads (פייסבוק/אינסטגרם)</option>
                                        <option value="Google Ads">Google Ads</option>
                                        <option value="TikTok Ads">TikTok Ads</option>
                                        <option value="Other">אחר</option>
                                    </select>
                                </div>
                                <div className="w-full sm:w-32">
                                    <label className="block text-xs text-slate-400 mb-1">עלות ($)</label>
                                    <input required type="number" min="0" step="0.01" value={marketingCost} onChange={e => setMarketingCost(e.target.value)} placeholder="0.00" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-500" />
                                </div>
                            </>
                        )}

                        <button disabled={submitting} type="submit" className="w-full sm:w-auto bg-slate-700 hover:bg-slate-600 outline-none border border-slate-600 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            הוסף
                        </button>
                    </form>

                    {/* Filter headers for variable and marketing */}
                    {(activeTab === 'variable' || activeTab === 'marketing') && (
                        <div className="flex items-center justify-between px-1 mt-2">
                            <h3 className="text-sm font-bold text-slate-300">
                                הוצאות עבור חודש {activeTab === 'variable' ? variableMonth : marketingMonth}:
                            </h3>
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-800 text-slate-400">
                                סה"כ: ${
                                    (activeTab === 'variable' ? filteredVariableCosts : filteredMarketingCosts)
                                        .reduce((acc, curr) => acc + Number(curr.cost), 0).toFixed(2)
                                }
                            </span>
                        </div>
                    )}

                    {/* Fixed Header Totals */}
                    {activeTab === 'fixed' && (
                        <div className="flex items-center justify-between px-1 mt-2">
                            <h3 className="text-sm font-bold text-slate-300">רשימת מנויים פעילים:</h3>
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-800 text-slate-400">
                                סה"כ חודשי: ${fixedSubscriptions.reduce((acc, curr) => acc + Number(curr.monthlyCost), 0).toFixed(2)}
                            </span>
                        </div>
                    )}

                    {/* Data Table */}
                    <div className="bg-slate-900 rounded-xl border border-slate-800 flex-1 overflow-y-auto max-h-64">
                        <table className="w-full text-sm text-right">
                            <thead className="sticky top-0 bg-slate-900/90 backdrop-blur z-10">
                                <tr className="border-b border-slate-800 text-slate-500 font-medium">
                                    <th className="px-4 py-2.5 font-normal">
                                        {activeTab === 'fixed' ? 'שם השירות' : activeTab === 'variable' ? 'שם ענן / שירות' : 'פלטפורמה'}
                                    </th>
                                    <th className="px-4 py-2.5 font-normal w-32">עלות ($)</th>
                                    <th className="px-4 py-2.5 font-normal w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeTab === 'fixed' && fixedSubscriptions.map((item) => (
                                    <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-4 py-3 text-slate-200 font-medium">{item.name}</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono">${item.monthlyCost}</td>
                                        <td className="px-4 py-3 text-left">
                                            <button onClick={() => handleRemoveExpense('fixed', item)} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {activeTab === 'variable' && filteredVariableCosts.map((item) => (
                                    <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-4 py-3 text-slate-200 font-medium">{item.serviceName}</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono">${item.cost}</td>
                                        <td className="px-4 py-3 text-left">
                                            <button onClick={() => handleRemoveExpense('variable', item)} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {activeTab === 'marketing' && filteredMarketingCosts.map((item) => (
                                    <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-4 py-3 text-slate-200 font-medium">{item.platform}</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono">${item.cost}</td>
                                        <td className="px-4 py-3 text-left">
                                            <button onClick={() => handleRemoveExpense('marketing', item)} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {/* Empty States */}
                                {activeTab === 'fixed' && fixedSubscriptions.length === 0 && (
                                    <tr><td colSpan={3} className="text-center py-6 text-slate-500 text-xs">אין מנויים קבועים מוזנים</td></tr>
                                )}
                                {activeTab === 'variable' && filteredVariableCosts.length === 0 && (
                                    <tr><td colSpan={3} className="text-center py-6 text-slate-500 text-xs">אין הוצאות ענן לחודש זה</td></tr>
                                )}
                                {activeTab === 'marketing' && filteredMarketingCosts.length === 0 && (
                                    <tr><td colSpan={3} className="text-center py-6 text-slate-500 text-xs">אין הוצאות שיווק לחודש זה</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
