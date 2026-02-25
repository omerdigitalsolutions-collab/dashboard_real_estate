import { useState, useEffect } from 'react';
import { X, Handshake, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { addDeal } from '../../services/dealService';
import { addLead } from '../../services/leadService';
import { addProperty } from '../../services/propertyService';
import { useAuth } from '../../context/AuthContext';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { useAgents } from '../../hooks/useFirestoreData';
import { isValidCommission, isValidPhone } from '../../utils/validation';
import { DealStage, Deal } from '../../types';

interface AddDealModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function AddDealModal({ isOpen, onClose }: AddDealModalProps) {
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
    const [leadMode, setLeadMode] = useState<'select' | 'create'>('select');
    const [propertyMode, setPropertyMode] = useState<'select' | 'create'>('select');

    // -- Existing states --
    const [leadId, setLeadId] = useState('');
    const [propertyId, setPropertyId] = useState('');
    const [commissionPercentage, setCommissionPercentage] = useState('2');
    const [assignedAgentId, setAssignedAgentId] = useState('');

    // -- New Item states --
    const [newLeadName, setNewLeadName] = useState('');
    const [newLeadPhone, setNewLeadPhone] = useState('');

    const [newPropertyCity, setNewPropertyCity] = useState('');
    const [newPropertyAddress, setNewPropertyAddress] = useState('');
    const [newPropertyPrice, setNewPropertyPrice] = useState('');
    const [newPropertyType, setNewPropertyType] = useState('sale');

    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    // -- Duplicate-prevention state --
    // When the lead already has 1 deal, we ask for confirmation before proceeding
    const [leadConflictDeal, setLeadConflictDeal] = useState<Deal | null>(null);
    const [leadConfirmed, setLeadConfirmed] = useState(false);

    // Reset confirmation when lead selection changes
    useEffect(() => {
        setLeadConflictDeal(null);
        setLeadConfirmed(false);
    }, [leadId, leadMode]);

    // Auto-assign agent if selected existing lead has one
    useEffect(() => {
        if (leadMode === 'select' && leadId) {
            const selectedLead = leads.find(l => l.id === leadId);
            if (selectedLead && selectedLead.assignedAgentId) {
                setAssignedAgentId(selectedLead.assignedAgentId);
            }
        }
    }, [leadId, leads, leadMode]);

    // Derived helpers
    const displayPrice = propertyMode === 'select'
        ? (properties.find(p => p.id === propertyId)?.price || 0)
        : (parseFloat(newPropertyPrice) || 0);

    const calculatedCommission = (displayPrice * (parseFloat(commissionPercentage) || 0)) / 100;

    // Inline duplicate checks (computed on every render for UI hints)
    const propertyDeals = propertyId ? allDeals.filter(d => d.propertyId === propertyId && d.stage !== 'won') : [];
    const leadDeals = leadId ? allDeals.filter(d => d.leadId === leadId) : [];

    if (!isOpen) return null;

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const resetForm = () => {
        setLeadMode('select'); setPropertyMode('select');
        setLeadId(''); setPropertyId('');
        setNewLeadName(''); setNewLeadPhone('');
        setNewPropertyCity(''); setNewPropertyAddress(''); setNewPropertyPrice(''); setNewPropertyType('sale');
        setCommissionPercentage('2'); setAssignedAgentId('');
        setLeadConflictDeal(null); setLeadConfirmed(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData?.agencyId || !commissionPercentage) return;
        if (!isValidCommission(commissionPercentage)) return showToast('אחוז עמלה חייב להיות מספר תקין בין 0 ל-100', false);

        // Validation based on modes
        if (leadMode === 'select' && !leadId) return showToast('בחר ליד או צור חדש', false);
        if (propertyMode === 'select' && !propertyId) return showToast('בחר נכס או צור חדש', false);

        if (leadMode === 'create') {
            if (!newLeadName || !newLeadPhone) return showToast('שם וטלפון לליד חובה', false);
            if (!isValidPhone(newLeadPhone)) return showToast('מספר טלפון לליד אינו תקין', false);
        }
        if (propertyMode === 'create' && (!newPropertyCity || !newPropertyAddress || !newPropertyPrice)) return showToast('כל שדות הנכס חובה', false);

        // ── Duplicate checks ──────────────────────────────────────────────────

        // 1. Property: Hard block — a property can only be in one active deal
        if (propertyMode === 'select' && propertyDeals.length > 0) {
            const existingProp = properties.find(p => p.id === propertyId);
            return showToast(`הנכס "${existingProp?.address || propertyId}" כבר קיים בעסקה פעילה. לא ניתן לשייך נכס לשתי עסקאות בו-זמנית.`, false);
        }

        // 2. Lead: Max 2 deals — block if already has 2
        if (leadMode === 'select' && leadDeals.length >= 2) {
            return showToast('ניתן לשייך ליד לעסקה לכל היותר פעמיים. לליד זה כבר שויכו שתי עסקאות.', false);
        }

        // 3. Lead: Warning — if lead already has 1 deal, require explicit confirmation
        if (leadMode === 'select' && leadDeals.length === 1 && !leadConfirmed) {
            setLeadConflictDeal(leadDeals[0]);
            return; // Stop — wait for the user to confirm in the UI
        }

        try {
            setLoading(true);
            let finalLeadId = leadId;
            let finalPropertyId = propertyId;

            // 1. Create Lead if needed
            if (leadMode === 'create') {
                const leadRef = await addLead(userData.agencyId, {
                    name: newLeadName,
                    phone: newLeadPhone,
                    status: 'new',
                    type: 'seller',
                    source: 'manual',
                    assignedAgentId: assignedAgentId || null
                });
                finalLeadId = leadRef.id;
            }

            // 2. Create Property if needed
            if (propertyMode === 'create') {
                finalPropertyId = await addProperty(userData.agencyId, {
                    city: newPropertyCity,
                    address: newPropertyAddress,
                    price: parseFloat(newPropertyPrice) || 0,
                    type: newPropertyType as 'sale' | 'rent',
                    kind: 'דירה', // Default kind
                    agentId: assignedAgentId || undefined
                });
            }

            // 3. Create Deal
            await addDeal(userData.agencyId, {
                leadId: finalLeadId,
                propertyId: finalPropertyId,
                ...(assignedAgentId ? { agentId: assignedAgentId } : {}),
                stage: firstStageId,
                projectedCommission: calculatedCommission,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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

                    {/* --- LEAD SECTION --- */}
                    <div className="space-y-3 p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-bold text-slate-800">לקוח (ליד משויך)</label>
                            <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm">
                                <button type="button" onClick={() => setLeadMode('select')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${leadMode === 'select' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>בחירה מקיים</button>
                                <button type="button" onClick={() => setLeadMode('create')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${leadMode === 'create' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>+ לקוח חדש</button>
                            </div>
                        </div>

                        {leadMode === 'select' ? (
                            <>
                                <select
                                    value={leadId}
                                    onChange={e => setLeadId(e.target.value)}
                                    required
                                    className={`${inputCls} ${leadDeals.length >= 2 ? 'border-red-300 bg-red-50' : leadDeals.length === 1 ? 'border-amber-300 bg-amber-50' : ''}`}
                                >
                                    <option value="" disabled>בחר ליד מהרשימה...</option>
                                    {leads.map(lead => (
                                        <option key={lead.id} value={lead.id}>{lead.name} {lead.phone ? `- ${lead.phone}` : ''}</option>
                                    ))}
                                </select>

                                {/* Lead has 2 deals — hard block */}
                                {leadDeals.length >= 2 && (
                                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
                                        <span>לליד זה כבר שויכו שתי עסקאות. זהו המקסימום המותר — נא בחר ליד אחר.</span>
                                    </div>
                                )}

                                {/* Lead has 1 deal — show confirmation card */}
                                {leadConflictDeal && leadDeals.length === 1 && !leadConfirmed && (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                                            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                                            הליד כבר משויך לעסקאה פעילה
                                        </div>
                                        <div className="text-xs text-amber-700 bg-amber-100/60 rounded-lg p-2 space-y-1">
                                            <div><span className="font-semibold">נכס:</span> {properties.find(p => p.id === leadConflictDeal.propertyId)?.address || leadConflictDeal.propertyId}</div>
                                            <div><span className="font-semibold">שלב:</span> {leadConflictDeal.stage}</div>
                                            <div><span className="font-semibold">עמלה צפויה:</span> ₪{leadConflictDeal.projectedCommission?.toLocaleString()}</div>
                                        </div>
                                        <p className="text-[11px] text-amber-600">האם לשייך את הליד גם לעסקאה החדשה? (זו פעם השנייה והאחרונה)</p>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { setLeadConflictDeal(null); setLeadId(''); }}
                                                className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                                            >
                                                בחר ליד אחר
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setLeadConfirmed(true); setLeadConflictDeal(null); }}
                                                className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                                            >
                                                כן, שייך בכל זאת
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Lead confirmed for 2nd deal — green badge */}
                                {leadConfirmed && leadDeals.length === 1 && (
                                    <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
                                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                        אושר — הליד ישויך לשתי עסקאות.
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                                <div>
                                    <label className={labelCls}>שם מלא <span className="text-red-500">*</span></label>
                                    <input value={newLeadName} onChange={e => setNewLeadName(e.target.value)} required type="text" className={inputCls} placeholder="לדוג' ישראל ישראלי" />
                                </div>
                                <div>
                                    <label className={labelCls}>מספר טלפון <span className="text-red-500">*</span></label>
                                    <input value={newLeadPhone} onChange={e => setNewLeadPhone(e.target.value)} required type="tel" className={inputCls} placeholder="050-0000000" dir="ltr" />
                                </div>
                                <div className="col-span-2 text-xs text-slate-400">הלקוח ייווצר תחת סטאטוס "חדש" וסוג "מוכר נכס" (Seller).</div>
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
                            </div>
                        </div>

                        {propertyMode === 'select' ? (
                            <>
                                <select
                                    value={propertyId}
                                    onChange={e => setPropertyId(e.target.value)}
                                    required
                                    className={`${inputCls} ${propertyDeals.length > 0 ? 'border-red-300 bg-red-50' : ''}`}
                                >
                                    <option value="" disabled>בחר נכס מהרשימה...</option>
                                    {properties.map(property => (
                                        <option key={property.id} value={property.id}>
                                            {property.address} {property.price ? `- ₪${property.price.toLocaleString()}` : ''}
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
                        ) : (
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
                        )}
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
                                סוכן זה ישוייך לנכס ולליד במידה שבחרת ליצור אותם כעת.
                            </p>
                        </div>

                        {/* Projected Commission */}
                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                            <div className="flex justify-between items-end mb-1.5">
                                <label className="block text-xs font-semibold text-blue-900">
                                    אחוז עמלה משוער (%) <span className="text-red-500">*</span>
                                </label>
                                {displayPrice > 0 && (
                                    <span className="text-sm font-bold text-blue-700 px-2 py-0.5 rounded-md">
                                        צפי הכנסה: ₪{calculatedCommission.toLocaleString()}
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
                                (propertyMode === 'select' && propertyDeals.length > 0) ||
                                (leadMode === 'select' && leadDeals.length >= 2) ||
                                (leadMode === 'select' && leadDeals.length === 1 && !leadConfirmed && !leadConflictDeal)
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
