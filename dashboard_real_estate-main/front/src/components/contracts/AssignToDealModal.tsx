import React, { useState, useEffect } from 'react';
import { Search, User, Briefcase, Loader2, X, Check, ChevronDown, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getLiveLeads } from '../../services/leadService';
import { getLiveDeals } from '../../services/dealService';
import { createInstance } from '../../services/contractInstanceService';
import { Lead, Deal, ContractTemplate } from '../../types';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface AssignToDealModalProps {
    isOpen: boolean;
    onClose: () => void;
    template: (ContractTemplate & { id: string }) | null;
    // When opened from the "active" tab, pass all templates so the user can pick one
    allTemplates?: (ContractTemplate & { id: string })[];
    // 'template' = create instance and open ContractInstanceEditor (default)
    // 'pdf' = just pick a deal and open ContractEditor for PDF upload
    mode?: 'template' | 'pdf';
}

type TargetType = 'deal' | 'lead';

export default function AssignToDealModal({
    isOpen,
    onClose,
    template,
    allTemplates,
    mode = 'template',
}: AssignToDealModalProps) {
    const { userData } = useAuth();
    const navigate = useNavigate();

    const [selectedTemplate, setSelectedTemplate] = useState<(ContractTemplate & { id: string }) | null>(template);
    const [targetType, setTargetType] = useState<TargetType>('deal');
    const [search, setSearch] = useState('');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Sync selected template when the prop changes (opening modal pre-selected)
    useEffect(() => {
        if (template) setSelectedTemplate(template);
    }, [template]);

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setSearch('');
            setTargetType('deal');
        }
    }, [isOpen]);

    // Reset search when switching tabs
    useEffect(() => {
        setSearch('');
    }, [targetType]);

    useEffect(() => {
        if (!isOpen || !userData?.agencyId) return;

        setLoading(true);
        let leadsDone = false;
        let dealsDone = false;
        const checkDone = () => { if (leadsDone && dealsDone) setLoading(false); };

        const unsubLeads = getLiveLeads(userData.agencyId, (data) => {
            setLeads(data);
            leadsDone = true;
            checkDone();
        });
        const unsubDeals = getLiveDeals(userData.agencyId, (data) => {
            setDeals(data);
            dealsDone = true;
            checkDone();
        });

        return () => { unsubLeads(); unsubDeals(); };
    }, [isOpen, userData?.agencyId]);

    const filteredLeads = leads.filter(l =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.phone.includes(search)
    );

    const filteredDeals = deals.filter(d =>
        d.id.toLowerCase().includes(search.toLowerCase()) ||
        (d as any).propertyAddress?.toLowerCase().includes(search.toLowerCase())
    );

    const handleAssign = async (targetId?: string) => {
        // PDF mode: just navigate to the ContractEditor for this deal
        if (mode === 'pdf') {
            if (targetType === 'lead') {
                toast.error('העלאת PDF לליד טרם נתמכת');
                return;
            }
            onClose();
            navigate(`/dashboard/contracts/${targetId}/edit`);
            return;
        }

        if (!selectedTemplate || !userData?.agencyId) return;

        try {
            setSubmitting(true);
            const instanceId = await createInstance(
                userData.agencyId,
                selectedTemplate.id,
                targetType === 'deal' ? targetId : undefined,
                {},
                userData.uid!,
                targetType === 'lead' ? targetId : undefined
            );
            toast.success('החוזה שויך בהצלחה');
            onClose();
            navigate(`/dashboard/contracts/instances/${instanceId}/edit`);
        } catch (err) {
            console.error('[AssignToDealModal] Error assigning:', err);
            toast.error('שגיאה בשיוך החוזה');
        } finally {
            setSubmitting(false);
        }
    };

    const handleManualEntry = async () => {
        if (!selectedTemplate || !userData?.agencyId) return;

        try {
            setSubmitting(true);
            const instanceId = await createInstance(
                userData.agencyId,
                selectedTemplate.id,
                undefined,
                {},
                userData.uid!,
                undefined
            );
            toast.success('נוצר חוזה חדש להזנה ידנית');
            onClose();
            navigate(`/dashboard/contracts/instances/${instanceId}/edit`);
        } catch (err) {
            console.error('[AssignToDealModal] Error creating manual entry:', err);
            toast.error('שגיאה ביצירת חוזה');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const showTemplatePicker = !!allTemplates && allTemplates.length > 0 && !template;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" dir="rtl">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">
                            {mode === 'pdf' ? 'בחר עסקה להעלאת חוזה PDF' : 'שיוך תבנית לעסקה'}
                        </h2>
                        {mode === 'template' && selectedTemplate && (
                            <p className="text-sm text-slate-500 mt-0.5">תבנית: {selectedTemplate.title}</p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Template picker (when opened without a pre-selected template) */}
                {showTemplatePicker && (
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                            בחר תבנית
                        </label>
                        <div className="relative">
                            <select
                                value={selectedTemplate?.id ?? ''}
                                onChange={e => {
                                    const t = allTemplates!.find(t => t.id === e.target.value) ?? null;
                                    setSelectedTemplate(t);
                                }}
                                className="w-full appearance-none pr-4 pl-8 py-2.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            >
                                <option value="">— בחר תבנית —</option>
                                {allTemplates!.map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                )}

                {/* Target type tabs */}
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setTargetType('deal')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
                            targetType === 'deal'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        עסקאות
                    </button>
                    <button
                        onClick={() => setTargetType('lead')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
                            targetType === 'lead'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        לידים
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={targetType === 'deal' ? 'חיפוש עסקה...' : 'חיפוש ליד...'}
                            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
                            <p className="text-sm text-slate-500">טוען נתונים...</p>
                        </div>
                    ) : (
                        <>
                            {targetType === 'deal' && filteredDeals.length === 0 && (
                                <p className="text-center py-12 text-slate-400 text-sm">לא נמצאו עסקאות</p>
                            )}
                            {targetType === 'lead' && filteredLeads.length === 0 && (
                                <p className="text-center py-12 text-slate-400 text-sm">לא נמצאו לידים</p>
                            )}

                            {targetType === 'deal' && filteredDeals.map(deal => (
                                <button
                                    key={deal.id}
                                    onClick={() => handleAssign(deal.id)}
                                    disabled={submitting || !selectedTemplate}
                                    className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 transition-all text-right group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                                            <Briefcase size={18} />
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-slate-900 text-sm">
                                                {deal.clientName || `עסקה #${deal.id.slice(-6).toUpperCase()}`}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {deal.propertyAddress || 'ללא כתובת'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                                            <Check size={16} />
                                        </div>
                                    </div>
                                </button>
                            ))}

                             {targetType === 'lead' && filteredLeads.map(lead => (
                                <button
                                    key={lead.id}
                                    onClick={() => handleAssign(lead.id)}
                                    disabled={submitting || !selectedTemplate}
                                    className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 transition-all text-right group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0">
                                            <User size={18} />
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-slate-900 text-sm">{lead.name}</p>
                                            <p className="text-xs text-slate-500">{lead.phone}</p>
                                        </div>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                                            <Check size={16} />
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </>
                    )}
                </div>

                {/* Manual entry option */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                    <button
                        onClick={handleManualEntry}
                        disabled={submitting || !selectedTemplate}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all font-medium disabled:opacity-50"
                    >
                        <Plus size={18} />
                        <span>הזנה ידנית ללא שיוך</span>
                    </button>
                </div>

                {/* Submitting overlay */}
                {submitting && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-2xl">
                        <Loader2 className="animate-spin text-blue-600" size={36} />
                    </div>
                )}
            </div>
        </div>
    );
}
