import { useState, useEffect } from 'react';
import { X, Handshake, AlertTriangle } from 'lucide-react';
import { updateDeal } from '../../services/dealService';
import { useAuth } from '../../context/AuthContext';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { useAgents } from '../../hooks/useFirestoreData';
import { isValidCommission } from '../../utils/validation';
import { Deal, DealStage } from '../../types';
import { triggerWonConfetti } from '../../utils/effects';

interface EditDealModalProps {
    deal: Deal;
    isOpen: boolean;
    onClose: () => void;
    onUpdated?: () => void;
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function EditDealModal({ deal, isOpen, onClose, onUpdated }: EditDealModalProps) {
    const { userData } = useAuth();
    const { leads, properties, deals: allDeals, agencySettings } = useLiveDashboardData();
    const { data: agents } = useAgents();

    // -- Edit states --
    const [buyerId, setBuyerId] = useState('');
    const [sellerId, setSellerId] = useState('');
    const [propertyId, setPropertyId] = useState('');
    const [commissionPercentage, setCommissionPercentage] = useState('');
    const [actualCommission, setActualCommission] = useState('');
    const [assignedAgentId, setAssignedAgentId] = useState('');
    const [stage, setStage] = useState<DealStage>('qualification');
    const [includeVat, setIncludeVat] = useState(false);
    const [notes, setNotes] = useState('');

    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    // Initialize state when deal changes or modal opens
    useEffect(() => {
        if (isOpen && deal) {
            setBuyerId(deal.buyerId || '');
            setSellerId(deal.sellerId || '');
            setPropertyId(deal.propertyId || '');

            // Try to reverse-calculate the commission percentage based on the property price if available
            const prop = properties.find(p => p.id === deal.propertyId);
            if (prop && (prop.financials?.price ?? 0) > 0 && deal.projectedCommission > 0) {
                const isVat = deal.isVatIncluded || false;
                const base = isVat ? deal.projectedCommission : (deal.projectedCommission / 1.18);
                const perc = (base / (prop.financials?.price ?? 1)) * 100;
                setCommissionPercentage(perc.toFixed(2));
            } else {
                setCommissionPercentage('2'); // Fallback default
            }

            setActualCommission(deal.actualCommission ? deal.actualCommission.toString() : '');
            setAssignedAgentId(deal.agentId || '');
            setStage(deal.stage);
            setIncludeVat(deal.isVatIncluded || false);
            setNotes(deal.notes || '');
        }
    }, [isOpen, deal, properties]);

    // Derived helpers
    const displayPrice = properties.find(p => p.id === propertyId)?.financials?.price || 0;
    const baseValue = (displayPrice * (parseFloat(commissionPercentage) || 0)) / 100;
    const calculatedCommission = includeVat ? baseValue : baseValue * 1.18;
    const netCommission = includeVat ? baseValue / 1.18 : baseValue;

    // Duplicate checks (excluding the current deal)
    const propertyDeals = propertyId
        ? allDeals.filter(d => d.propertyId === propertyId && d.id !== deal.id && d.stage !== 'won' && d.stage !== 'lost')
        : [];

    if (!isOpen) return null;

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!userData?.agencyId || !commissionPercentage) return;
        if (!isValidCommission(commissionPercentage)) return showToast('אחוז עמלה חייב להיות מספר תקין בין 0 ל-100', false);

        if (!buyerId && !sellerId) {
            return showToast('חובה לבחור לפחות קונה או מוכר אחד', false);
        }
        if (!propertyId) return showToast('בחר נכס מתוך הרשימה', false);

        // Duplicate checks
        if (propertyDeals.length > 0) {
            const existingProp = properties.find(p => p.id === propertyId);
            return showToast(`הנכס "${existingProp?.address || propertyId}" כבר קיים בעסקה פעילה אחרת.`, false);
        }

        try {
            setLoading(true);

            // Ensure we calculate the newly projected commission
            const finalCalculatedCommission = calculatedCommission;

            await updateDeal(deal.id, {
                propertyId,
                buyerId: buyerId || undefined, // undefined to remove if empty
                sellerId: sellerId || undefined,
                agentId: assignedAgentId || undefined,
                stage,
                projectedCommission: finalCalculatedCommission,
                isVatIncluded: includeVat,
                actualCommission: actualCommission ? Number(actualCommission) : undefined,
                notes: notes || undefined,
            });

            // If the stage was changed to 'won' and it wasn't won before, trigger confetti
            if (stage === 'won' && deal.stage !== 'won') {
                triggerWonConfetti();
            }

            showToast('העסקה עודכנה בהצלחה ✓');
            setTimeout(() => {
                onClose();
                if (onUpdated) onUpdated();
            }, 1200);
        } catch (err: any) {
            console.error("Error updating deal: ", err);
            if (err?.code === 'permission-denied') {
                showToast('אין הרשאה לערוך עסקאות', false);
            } else {
                showToast('אירעה שגיאה בעדכון העסקה', false);
            }
        } finally {
            setLoading(false);
        }
    };

    const customStages = agencySettings?.customDealStages || [];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
                            <Handshake size={18} className="text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">עריכת עסקה</h2>
                            <p className="text-xs text-slate-400">עדכון פרטי עסקת הנדל״ן</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">

                    {/* Stage Selection */}
                    <div className="space-y-2 p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
                        <label className="text-sm font-bold text-slate-800">שלב נוכחי בעסקה</label>
                        <select value={stage} onChange={e => setStage(e.target.value as DealStage)} className={inputCls}>
                            <optgroup label="שלבים כלליים">
                                <option value="won">נסגר (Won)</option>
                                <option value="lost">אבוד (Lost)</option>
                            </optgroup>
                            {customStages.length > 0 && (
                                <optgroup label="שלבים מותאמים אישית">
                                    {customStages.map((s) => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </optgroup>
                            )}
                            {/* Legacy fallbacks just in case the deal is currently on them */}
                            {(!customStages.length || (stage !== 'won' && stage !== 'lost' && !customStages.find(s => s.id === stage))) && (
                                <optgroup label="שלבים ישנים בשימוש">
                                    <option value={stage}>{stage}</option>
                                </optgroup>
                            )}
                        </select>
                    </div>

                    {/* Buyer Selection */}
                    <div className="space-y-3 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                        <label className="text-sm font-bold text-blue-900">קונה הנכס (ליד)</label>
                        <select value={buyerId} onChange={e => setBuyerId(e.target.value)} className={inputCls}>
                            <option value="">ללא קונה בעסקה בשלב זה</option>
                            {leads.map(lead => (
                                <option key={lead.id} value={lead.id}>{lead.name} {lead.phone ? `- ${lead.phone}` : ''}</option>
                            ))}
                        </select>
                    </div>

                    {/* Seller Selection */}
                    <div className="space-y-3 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                        <label className="text-sm font-bold text-emerald-900">מוכר הנכס (ליד)</label>
                        <select value={sellerId} onChange={e => setSellerId(e.target.value)} className={inputCls}>
                            <option value="">ללא מוכר בעסקה בשלב זה</option>
                            {leads.map(lead => (
                                <option key={lead.id} value={lead.id}>{lead.name} {lead.phone ? `- ${lead.phone}` : ''}</option>
                            ))}
                        </select>
                    </div>

                    {/* Property Selection */}
                    <div className="space-y-3 p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
                        <label className="text-sm font-bold text-slate-800">נכס משויך</label>
                        <select
                            value={propertyId}
                            onChange={e => setPropertyId(e.target.value)}
                            required
                            className={`${inputCls} ${propertyDeals.length > 0 ? 'border-red-300 bg-red-50' : ''}`}
                        >
                            <option value="" disabled>בחר נכס מהרשימה...</option>
                            {properties.map(property => (
                                <option key={property.id} value={property.id}>
                                    {property.address?.fullAddress} {property.financials?.price ? `- ₪${property.financials.price.toLocaleString()}` : ''}
                                </option>
                            ))}
                        </select>

                        {/* Property already in an active deal (other than this one) */}
                        {propertyDeals.length > 0 && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
                                <span>נכס זה כבר קיים בעסקאה פעילה לשלב: {propertyDeals[0].stage}. לא ניתן לקשר נכס واحد לשתי עסקאות פעילות.</span>
                            </div>
                        )}
                    </div>

                    {/* Deal Details */}
                    <div className="space-y-4 pt-2">
                        {/* Assigned Agent */}
                        <div>
                            <label className={labelCls}>שיוך לסוכן מטפל</label>
                            <select value={assignedAgentId} onChange={e => setAssignedAgentId(e.target.value)} className={inputCls}>
                                <option value="">ללא שיוך מיוחד (צוותי/כללי)</option>
                                {agents.map(agent => (
                                    <option key={agent.uid || agent.id} value={agent.uid || ''}>
                                        {agent.name || agent.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {/* Projected Commission */}
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <div className="flex justify-between items-end mb-1.5">
                                <label className="block text-xs font-semibold text-blue-900">
                                    אחוז עמלה משוער (%) <span className="text-red-500">*</span>
                                </label>
                                {displayPrice > 0 && (
                                    <span className="text-sm font-bold text-blue-700 px-2 py-0.5 rounded-md">
                                        צפי עתידי: ₪{Math.round(calculatedCommission).toLocaleString()}
                                    </span>
                                )}
                            </div>
                            <input
                                type="number" min="0" max="100" step="0.01" required
                                value={commissionPercentage} onChange={e => setCommissionPercentage(e.target.value)}
                                placeholder="לדוגמא 2.0"
                                className={`${inputCls} border-blue-200 focus:ring-blue-500/50`}
                                dir="ltr"
                            />

                            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-blue-100/50">
                                <button
                                    type="button"
                                    onClick={() => setIncludeVat(!includeVat)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-[11px] font-bold ${includeVat ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                                >
                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${includeVat ? 'bg-white border-white' : 'border-slate-300'}`}>
                                        {includeVat && <div className="w-2 h-2 bg-blue-600 rounded-sm" />}
                                    </div>
                                    כולל מע"מ (18%)
                                </button>
                                <span className="text-[10px] text-slate-400 font-medium italic">
                                    {includeVat ? `(נטו: ₪${Math.round(netCommission).toLocaleString()})` : `(סופי: ₪${Math.round(calculatedCommission).toLocaleString()})`}
                                </span>
                            </div>
                        </div>

                        {/* Actual Commission */}
                        <div>
                            <label className={labelCls}>עמלה שנגבתה בפועל (₪) - לעסקאות שנסגרו</label>
                            <input
                                type="number" min="0" step="1"
                                value={actualCommission} onChange={e => setActualCommission(e.target.value)}
                                placeholder="סכום שהתקבל"
                                className={inputCls}
                                dir="ltr"
                            />
                        </div>

                        {/* Notes */}
                        <div>
                            <label className={labelCls}>הערות</label>
                            <textarea
                                value={notes} onChange={e => setNotes(e.target.value)}
                                rows={3}
                                placeholder="פרטים נוספים על העסקה..."
                                className={`${inputCls} resize-none`}
                            />
                        </div>
                    </div>

                    {/* Toast */}
                    {toast && (
                        <div className={`text-xs font-medium px-4 py-3 rounded-xl border ${toast.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                            {toast.msg}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-slate-100 mt-2 shrink-0">
                        <button type="button" onClick={onClose} className="w-1/3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={
                                loading ||
                                !commissionPercentage ||
                                calculatedCommission <= 0 ||
                                (propertyDeals.length > 0)
                            }
                            className="w-2/3 flex justify-center py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            {loading ? 'שומר שינויים...' : 'שמור עסקה'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
