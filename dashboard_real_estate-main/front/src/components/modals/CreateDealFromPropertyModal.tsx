import { useState, useEffect, useMemo } from 'react';
import { X, Handshake } from 'lucide-react';
import { addDeal } from '../../services/dealService';
import { useAuth } from '../../context/AuthContext';
import { isValidCommission } from '../../utils/validation';
import { Property, DealStage, Lead, AppUser, Agency } from '../../types';

// Same mandatory stages as DealsKanban
const MANDATORY_WON_STAGE = { id: 'won', label: 'נסגר בהצלחה' };
const DEFAULT_STAGES = [
    { id: 'qualification', label: 'בירור צרכים' },
    { id: 'negotiation', label: 'משא ומתן' },
    MANDATORY_WON_STAGE,
];

interface CreateDealFromPropertyModalProps {
    property: Property;
    leads: Lead[];
    agents: AppUser[];
    agencySettings?: Agency['settings'];
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (msg: string) => void;
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50 focus:bg-white';
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5';

export default function CreateDealFromPropertyModal({ property, leads, agents, agencySettings, isOpen, onClose, onSuccess }: CreateDealFromPropertyModalProps) {
    const { userData } = useAuth();

    // Exactly the same logic as DealsKanban's activeStages
    const activeStages = useMemo(() => {
        const customStages = agencySettings?.customDealStages || [];
        if (customStages.length === 0) return DEFAULT_STAGES;
        return [...customStages, MANDATORY_WON_STAGE];
    }, [agencySettings?.customDealStages]);

    const [selectedStage, setSelectedStage] = useState<DealStage>(activeStages[0]?.id || 'qualification');
    const [selectedLeadId, setSelectedLeadId] = useState<string>('');
    const [commissionPercentage, setCommissionPercentage] = useState('2');
    const [assignedAgentId, setAssignedAgentId] = useState<string>(property.agentId || '');

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSelectedStage(activeStages[0]?.id || 'qualification');
            setSelectedLeadId('');
            setCommissionPercentage('2');
            setAssignedAgentId(property.agentId || '');
            setErrorMsg('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, property]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');

        if (!userData?.agencyId || !commissionPercentage) return;
        if (!isValidCommission(commissionPercentage)) {
            setErrorMsg('אחוז עמלה חייב להיות מספר תקין בין 0 ל-100');
            return;
        }

        const displayPrice = property.price || 0;
        const calculatedCommission = (displayPrice * (parseFloat(commissionPercentage) || 0)) / 100;

        try {
            setLoading(true);

            await addDeal(userData.agencyId, {
                leadId: selectedLeadId, // empty string = without lead
                propertyId: property.id,
                ...(assignedAgentId ? { agentId: assignedAgentId } : {}),
                stage: selectedStage,
                projectedCommission: calculatedCommission,
                createdBy: userData.name || userData.email || 'Agent',
            });

            onSuccess('העסקה נוצרה בהצלחה!');
            onClose();
        } catch (err: any) {
            console.error("Error creating deal: ", err);
            setErrorMsg('אירעה שגיאה ביצירת העסקה. נסה שנית.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <Handshake size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">יצירת עסקה לנכס</h2>
                            <p className="text-xs text-slate-500 truncate max-w-[200px] sm:max-w-xs">{property.address || 'נכס'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
                    {/* Stage Selection */}
                    <div>
                        <label className={labelCls}>סטטוס עסקה (שלב) <span className="text-red-500">*</span></label>
                        <select
                            value={selectedStage}
                            onChange={(e) => setSelectedStage(e.target.value)}
                            className={inputCls}
                            required
                        >
                            {activeStages.map(stage => (
                                <option key={stage.id} value={stage.id}>{stage.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Lead Selection */}
                    <div>
                        <label className={labelCls}>ליד משויך</label>
                        <select
                            value={selectedLeadId}
                            onChange={(e) => setSelectedLeadId(e.target.value)}
                            className={inputCls}
                        >
                            <option value="">ללא ליד</option>
                            {leads.map((lead: Lead) => (
                                <option key={lead.id} value={lead.id}>
                                    {lead.name} {lead.phone ? `- ${lead.phone}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Agent Selection */}
                    <div>
                        <label className={labelCls}>סוכן מטפל</label>
                        <select
                            value={assignedAgentId}
                            onChange={(e) => setAssignedAgentId(e.target.value)}
                            className={inputCls}
                        >
                            <option value="">ללא שיוך מיוחד</option>
                            {agents.map((agent: AppUser) => (
                                <option key={agent.uid || agent.id} value={agent.uid || ''}>
                                    {agent.name || agent.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Commission */}
                    <div>
                        <label className={labelCls}>אחוז עמלה משוער (%) <span className="text-red-500">*</span></label>
                        <input
                            type="number" min="0" max="100" step="0.01" required
                            value={commissionPercentage}
                            onChange={(e) => setCommissionPercentage(e.target.value)}
                            className={inputCls}
                            dir="ltr"
                        />
                    </div>

                    {/* Error message */}
                    {errorMsg && (
                        <div className="text-xs font-medium px-4 py-3 rounded-xl border bg-red-50 text-red-600 border-red-100">
                            {errorMsg}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-slate-100 mt-2">
                        <button type="button" onClick={onClose} className="w-1/3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !commissionPercentage}
                            className="w-2/3 flex justify-center py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        >
                            {loading ? 'יוצר עסקה...' : 'צור עסקה'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
