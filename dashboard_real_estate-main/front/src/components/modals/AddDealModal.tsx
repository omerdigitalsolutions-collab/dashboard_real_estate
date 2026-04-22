import { useState, useEffect } from 'react';
import { X, Handshake, AlertTriangle } from 'lucide-react';
import { addDeal } from '../../services/dealService';
import { addLead } from '../../services/leadService';
import { addProperty } from '../../services/propertyService';
import { useAuth } from '../../context/AuthContext';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { useAgents } from '../../hooks/useFirestoreData';
import { isValidCommission, isValidPhone } from '../../utils/validation';
import { DealStage, Lead } from '../../types';

interface AddDealModalProps {
    isOpen: boolean;
    onClose: () => void;
    prefilledLead?: Lead;
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function AddDealModal({ isOpen, onClose, prefilledLead }: AddDealModalProps) {
    const { userData } = useAuth();
    const { leads, properties, deals: allDeals, agencySettings } = useLiveDashboardData();
    const { data: agents } = useAgents();

    // Determine the first non-'won' stage to use when creating a new deal
    const firstStageId: DealStage = (() => {
        const customStages = agencySettings?.customDealStages || [];
        if (customStages.length > 0) return customStages[0].id as DealStage;
        return 'qualification' as DealStage; // legacy default
    })();

    // -- Selection modes --
    const [buyerMode, setBuyerMode] = useState<'select' | 'create'>('select');
    const [sellerMode, setSellerMode] = useState<'select' | 'create'>('select');
    const [propertyMode, setPropertyMode] = useState<'select' | 'create' | 'none'>('select');

    // -- Existing states --
    const [buyerId, setBuyerId] = useState('');
    const [sellerId, setSellerId] = useState('');
    const [propertyId, setPropertyId] = useState('');
    const [commissionPercentage, setCommissionPercentage] = useState('2');
    const [manualCommission, setManualCommission] = useState('');
    const [assignedAgentId, setAssignedAgentId] = useState('');
    const [includeVat, setIncludeVat] = useState(false);

    useEffect(() => {
        if (isOpen && prefilledLead) {
            if (prefilledLead.type === 'buyer') {
                setBuyerMode('select');
                setBuyerId(prefilledLead.id);
            } else if (prefilledLead.type === 'seller') {
                setSellerMode('select');
                setSellerId(prefilledLead.id);
            }
        }
    }, [isOpen, prefilledLead]);

    // -- New Item states --
    const [newBuyerName, setNewBuyerName] = useState('');
    const [newBuyerPhone, setNewBuyerPhone] = useState('');
    const [newSellerName, setNewSellerName] = useState('');
    const [newSellerPhone, setNewSellerPhone] = useState('');

    const [newPropertyCity, setNewPropertyCity] = useState('');
    const [newPropertyAddress, setNewPropertyAddress] = useState('');
    const [newPropertyPrice, setNewPropertyPrice] = useState('');
    const [newPropertyType, setNewPropertyType] = useState('sale');

    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    // Derived helpers
    const displayPrice = propertyMode === 'select'
        ? (properties.find(p => p.id === propertyId)?.financials?.price || 0)
        : (parseFloat(newPropertyPrice) || 0);

    const base = propertyMode === 'none' 
        ? (parseFloat(manualCommission) || 0)
        : ((displayPrice * (parseFloat(commissionPercentage) || 0)) / 100);
    const calculatedCommission = includeVat ? base : base * 1.18;
    const netCommission = includeVat ? base / 1.18 : base;

    // Inline duplicate checks
    const propertyDeals = propertyId ? allDeals.filter(d => d.propertyId === propertyId && d.stage !== 'won') : [];

    if (!isOpen) return null;

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const resetForm = () => {
        setBuyerMode('select'); setSellerMode('select'); setPropertyMode('select');
        setBuyerId(''); setSellerId(''); setPropertyId('');
        setNewBuyerName(''); setNewBuyerPhone('');
        setNewSellerName(''); setNewSellerPhone('');
        setNewPropertyCity(''); setNewPropertyAddress(''); setNewPropertyPrice(''); setNewPropertyType('sale');
        setCommissionPercentage('2'); setManualCommission(''); setAssignedAgentId('');
        setIncludeVat(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData?.agencyId) return;
        if (propertyMode !== 'none' && !commissionPercentage) return showToast('חובה להזין אחוז עמלה', false);
        if (propertyMode !== 'none' && !isValidCommission(commissionPercentage)) return showToast('אחוז עמלה חייב להיות מספר תקין בין 0 ל-100', false);
        if (propertyMode === 'none' && (!manualCommission || parseFloat(manualCommission) <= 0)) return showToast('חובה להזין את סכום העמלה הצפוי', false);

        // Validation based on modes
        if (buyerMode === 'select' && !buyerId && sellerMode === 'select' && !sellerId) {
            return showToast('חובה לבחור או ליצור לפחות קונה או מוכר אחד', false);
        }
        if (propertyMode === 'select' && !propertyId) return showToast('בחר נכס או צור חדש', false);

        if (buyerMode === 'create' && (newBuyerName || newBuyerPhone)) {
            if (!newBuyerName || !newBuyerPhone) return showToast('שם וטלפון לקונה חובה', false);
            if (!isValidPhone(newBuyerPhone)) return showToast('מספר טלפון לקונה אינו תקין', false);
        }
        if (sellerMode === 'create' && (newSellerName || newSellerPhone)) {
            if (!newSellerName || !newSellerPhone) return showToast('שם וטלפון למוכר חובה', false);
            if (!isValidPhone(newSellerPhone)) return showToast('מספר טלפון למוכר אינו תקין', false);
        }
        if (propertyMode === 'create' && (!newPropertyCity || !newPropertyAddress || !newPropertyPrice)) return showToast('כל שדות הנכס חובה', false);

        // ── Duplicate checks ──────────────────────────────────────────────────
        if (propertyMode === 'select' && propertyDeals.length > 0) {
            const existingProp = properties.find(p => p.id === propertyId);
            return showToast(`הנכס "${existingProp?.address || propertyId}" כבר קיים בעסקה פעילה.`, false);
        }

        try {
            setLoading(true);
            let finalBuyerId = buyerMode === 'select' ? buyerId : '';
            let finalSellerId = sellerMode === 'select' ? sellerId : '';
            let finalPropertyId = propertyMode === 'none' ? 'none' : propertyId;

            // 1. Create Buyer if needed
            if (buyerMode === 'create' && newBuyerName && newBuyerPhone) {
                const buyerRef = await addLead(userData.agencyId, {
                    name: newBuyerName,
                    phone: newBuyerPhone,
                    status: 'new',
                    type: 'buyer',
                    source: 'manual',
                    assignedAgentId: assignedAgentId || null
                }) as { id: string };
                finalBuyerId = buyerRef.id;
            }

            // 2. Create Seller if needed
            if (sellerMode === 'create' && newSellerName && newSellerPhone) {
                const sellerRef = await addLead(userData.agencyId, {
                    name: newSellerName,
                    phone: newSellerPhone,
                    status: 'new',
                    type: 'seller',
                    source: 'manual',
                    assignedAgentId: assignedAgentId || null
                }) as { id: string };
                finalSellerId = sellerRef.id;
            }

            // 3. Create Property if needed
            if (propertyMode === 'create') {
                finalPropertyId = await addProperty(userData.agencyId, {
                    address: { city: newPropertyCity, fullAddress: `${newPropertyAddress} ${newPropertyCity}`.trim() },
                    transactionType: newPropertyType === 'rent' ? 'rent' : 'forsale',
                    propertyType: 'דירה',
                    financials: { price: parseFloat(newPropertyPrice) || 0 },
                    ...(assignedAgentId ? { management: { assignedAgentId } } : {})
                });
            }

            // 4. Create Deal
            await addDeal(userData.agencyId, {
                propertyId: finalPropertyId,
                ...(finalBuyerId ? { buyerId: finalBuyerId } : {}),
                ...(finalSellerId ? { sellerId: finalSellerId } : {}),
                ...(assignedAgentId ? { agentId: assignedAgentId } : {}),
                stage: firstStageId,
                projectedCommission: calculatedCommission,
                isVatIncluded: includeVat,
                createdBy: userData.name || userData.email || 'Agent',
            });

            showToast('העסקה נוספה בהצלחה ✓');
            resetForm();
            setTimeout(onClose, 1200);
        } catch (err: any) {
            console.error("Error adding deal: ", err);
            if (err?.code === 'permission-denied') {
                showToast('אין הרשאה להוסיף עסקאות', false);
            } else {
                showToast('אירעה שגיאה, נסה שנית', false);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <Handshake size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">הוסף עסקה חדשה</h2>
                            <p className="text-xs text-slate-400">ייכנס לבורד העסקאות תחת 'הכשרה ראשונית'</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">

                    {/* --- BUYER SECTION --- */}
                    <div className="space-y-3 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-bold text-blue-900">קונה הנכס (ליד)</label>
                            <div className="flex bg-white rounded-lg border border-blue-200 p-0.5 shadow-sm">
                                <button type="button" onClick={() => setBuyerMode('select')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${buyerMode === 'select' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>בחירה מקיים</button>
                                <button type="button" onClick={() => setBuyerMode('create')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${buyerMode === 'create' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>+ קונה חדש</button>
                            </div>
                        </div>

                        {buyerMode === 'select' ? (
                            <select
                                value={buyerId}
                                onChange={e => setBuyerId(e.target.value)}
                                className={inputCls}
                            >
                                <option value="">ללא קונה בעסקה בשלב זה</option>
                                {leads.map(lead => (
                                    <option key={lead.id} value={lead.id}>{lead.name} {lead.phone ? `- ${lead.phone}` : ''}</option>
                                ))}
                            </select>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                                <div>
                                    <label className={labelCls}>שם מלא</label>
                                    <input value={newBuyerName} onChange={e => setNewBuyerName(e.target.value)} type="text" className={inputCls} placeholder="לדוג' ישראל קונה" />
                                </div>
                                <div>
                                    <label className={labelCls}>מספר טלפון</label>
                                    <input value={newBuyerPhone} onChange={e => setNewBuyerPhone(e.target.value)} type="tel" className={inputCls} placeholder="050-0000000" dir="ltr" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* --- SELLER SECTION --- */}
                    <div className="space-y-3 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-bold text-emerald-900">מוכר הנכס (ליד)</label>
                            <div className="flex bg-white rounded-lg border border-emerald-200 p-0.5 shadow-sm">
                                <button type="button" onClick={() => setSellerMode('select')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${sellerMode === 'select' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}>בחירה מקיים</button>
                                <button type="button" onClick={() => setSellerMode('create')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${sellerMode === 'create' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}>+ מוכר חדש</button>
                            </div>
                        </div>

                        {sellerMode === 'select' ? (
                            <select
                                value={sellerId}
                                onChange={e => setSellerId(e.target.value)}
                                className={inputCls}
                            >
                                <option value="">ללא מוכר בעסקה בשלב זה</option>
                                {leads.map(lead => (
                                    <option key={lead.id} value={lead.id}>{lead.name} {lead.phone ? `- ${lead.phone}` : ''}</option>
                                ))}
                            </select>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                                <div>
                                    <label className={labelCls}>שם מלא</label>
                                    <input value={newSellerName} onChange={e => setNewSellerName(e.target.value)} type="text" className={inputCls} placeholder="לדוג' רחל מוכרת" />
                                </div>
                                <div>
                                    <label className={labelCls}>מספר טלפון</label>
                                    <input value={newSellerPhone} onChange={e => setNewSellerPhone(e.target.value)} type="tel" className={inputCls} placeholder="050-0000000" dir="ltr" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* --- PROPERTY SECTION --- */}
                    <div className="space-y-3 p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-bold text-slate-800">נכס משויך</label>
                            <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                                <button type="button" onClick={() => setPropertyMode('select')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${propertyMode === 'select' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>בחירה מקיים</button>
                                <button type="button" onClick={() => setPropertyMode('create')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${propertyMode === 'create' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>+ נכס חדש</button>
                                <button type="button" onClick={() => setPropertyMode('none')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${propertyMode === 'none' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>ללא נכס</button>
                            </div>
                        </div>

                        {propertyMode === 'select' ? (
                            <>
                                <select
                                    value={propertyId}
                                    onChange={e => setPropertyId(e.target.value)}
                                    required={propertyMode === 'select'}
                                    className={`${inputCls} ${propertyDeals.length > 0 ? 'border-red-300 bg-red-50' : ''}`}
                                >
                                    <option value="" disabled>בחר נכס מהרשימה...</option>
                                    {properties.map(property => (
                                        <option key={property.id} value={property.id}>
                                            {property.address?.fullAddress} {property.financials?.price ? `- ₪${property.financials.price.toLocaleString()}` : ''}
                                        </option>
                                    ))}
                                </select>

                                {/* Property already in an active deal — hard block */}
                                {propertyDeals.length > 0 && (
                                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
                                        <span>נכס זה כבר קיים בעסקאה פעילה (שלב: {propertyDeals[0].stage}). לא ניתן לשייך נכס אחד לשתי עסקאות בו-זמנית.</span>
                                    </div>
                                )}
                            </>
                        ) : propertyMode === 'create' ? (
                            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                                <div>
                                    <label className={labelCls}>עיר <span className="text-red-500">*</span></label>
                                    <input value={newPropertyCity} onChange={e => setNewPropertyCity(e.target.value)} required type="text" className={inputCls} placeholder="לדוג' תל אביב" />
                                </div>
                                <div>
                                    <label className={labelCls}>כתובת / רחוב <span className="text-red-500">*</span></label>
                                    <input value={newPropertyAddress} onChange={e => setNewPropertyAddress(e.target.value)} required type="text" className={inputCls} placeholder="לדוג' רוטשילד 10" />
                                </div>
                                <div>
                                    <label className={labelCls}>סוג עסקה <span className="text-red-500">*</span></label>
                                    <select value={newPropertyType} onChange={e => setNewPropertyType(e.target.value)} className={inputCls}>
                                        <option value="sale">מכירה</option>
                                        <option value="rent">השכרה</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>מחיר דורשים (₪) <span className="text-red-500">*</span></label>
                                    <input value={newPropertyPrice} onChange={e => setNewPropertyPrice(e.target.value)} required type="number" min="0" className={inputCls} placeholder="3,000,000" dir="ltr" />
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* --- DEAL DETAILS SECTION --- */}
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
                            <p className="text-[10px] text-slate-400 mt-1">
                                סוכן זה ישוייך לנכס ולידים במידה שבחרת ליצור אותם כעת.
                            </p>
                        </div>

                        {/* Projected Commission */}
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            {propertyMode === 'none' ? (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <label className="block text-xs font-semibold text-blue-900">
                                            עמלה משוערת (₪) <span className="text-red-500">*</span>
                                        </label>
                                    </div>
                                    <input
                                        type="number" min="0" required
                                        value={manualCommission} onChange={e => setManualCommission(e.target.value)}
                                        placeholder="לדוגמא 10000"
                                        className={`${inputCls} border-blue-200 focus:ring-blue-500/50`}
                                        dir="ltr"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <label className="block text-xs font-semibold text-blue-900">
                                            אחוז עמלה משוער (%) <span className="text-red-500">*</span>
                                        </label>
                                        {displayPrice > 0 && (
                                            <span className="text-sm font-bold text-blue-700">
                                                צפי הכנסה: ₪{Math.round(calculatedCommission).toLocaleString()}
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
                                </div>
                            )}

                            {/* VAT Toggle - Shared for both modes */}
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
                                (propertyMode !== 'none' && !commissionPercentage) ||
                                (propertyMode === 'none' && !manualCommission) ||
                                calculatedCommission <= 0 ||
                                (propertyMode === 'select' && propertyDeals.length > 0)
                            }
                            className="w-2/3 flex justify-center py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            {loading ? 'מבצע פעולה...' : 'צור ושמור הכל'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
