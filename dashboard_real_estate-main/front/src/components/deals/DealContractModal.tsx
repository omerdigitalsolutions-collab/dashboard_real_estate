import { useState, useEffect } from 'react';
import { X, FileText, Upload, Loader2, Search, ChevronLeft, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getLiveTemplates } from '../../services/contractTemplateService';
import { createInstance } from '../../services/contractInstanceService';
import { Deal, ContractTemplate } from '../../types';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Props {
    deal: Deal & { id: string };
    isOpen: boolean;
    onClose: () => void;
}

type Step = 'pick' | 'template-list';

export default function DealContractModal({ deal, isOpen, onClose }: Props) {
    const { userData } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>('pick');
    const [templates, setTemplates] = useState<(ContractTemplate & { id: string })[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen || !userData?.agencyId) return;
        setStep('pick');
        setSearch('');
        setLoadingTemplates(true);
        const unsub = getLiveTemplates(
            userData.agencyId,
            (ts) => {
                setTemplates(ts);
                setLoadingTemplates(false);
            },
            () => setLoadingTemplates(false)
        );
        return unsub;
    }, [isOpen, userData?.agencyId]);

    const handleSelectTemplate = async (template: ContractTemplate & { id: string }) => {
        if (!userData?.agencyId || !userData?.uid) return;
        try {
            setSubmitting(true);
            const instanceId = await createInstance(
                userData.agencyId,
                template.id,
                {},
                userData.uid,
                deal.id,
                undefined
            );
            toast.success('החוזה שויך לעסקה בהצלחה');
            onClose();
            navigate(`/dashboard/contracts/instances/${instanceId}/edit`);
        } catch (err) {
            console.error('[DealContractModal] Error creating instance:', err);
            toast.error('שגיאה בשיוך החוזה');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePDF = () => {
        onClose();
        navigate(`/dashboard/contracts/${deal.id}/edit`);
    };

    if (!isOpen) return null;

    const filteredTemplates = templates.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden relative">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">שייך חוזה לעסקה</h2>
                        <p className="text-sm text-slate-500 mt-0.5">בחר אופן יצירת החוזה</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                        <X size={22} />
                    </button>
                </div>

                {step === 'pick' ? (
                    <div className="p-6 space-y-4">
                        {/* Option 1: Template */}
                        <button
                            onClick={() => setStep('template-list')}
                            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-100 hover:border-blue-300 hover:bg-blue-50/40 transition-all text-right group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                                <FileText size={22} />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-slate-900">בחר תבנית חוזה</p>
                                <p className="text-sm text-slate-500 mt-0.5">מלא תבנית קיימת ושלח לחתימה דיגיטלית</p>
                            </div>
                            <ChevronLeft size={20} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                        </button>

                        {/* Option 2: PDF upload */}
                        <button
                            onClick={handlePDF}
                            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-100 hover:border-purple-300 hover:bg-purple-50/40 transition-all text-right group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0 group-hover:bg-purple-200 transition-colors">
                                <Upload size={22} />
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-slate-900">העלה חוזה PDF</p>
                                <p className="text-sm text-slate-500 mt-0.5">העלה קובץ PDF קיים ומקם שדות חתימה</p>
                            </div>
                            <ChevronLeft size={20} className="text-slate-300 group-hover:text-purple-500 transition-colors flex-shrink-0" />
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Back + breadcrumb */}
                        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={() => setStep('pick')}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors"
                            >
                                <ChevronLeft size={16} className="rotate-180" />
                                חזרה
                            </button>
                            <span className="text-sm text-slate-400">/</span>
                            <span className="text-sm text-slate-600">בחר תבנית</span>
                        </div>

                        {/* Search */}
                        <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
                            <div className="relative">
                                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="חיפוש תבנית..."
                                    className="w-full pr-9 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                        </div>

                        {/* Template list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {loadingTemplates ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="animate-spin text-blue-600" size={28} />
                                </div>
                            ) : filteredTemplates.length === 0 ? (
                                <p className="text-center py-12 text-slate-400 text-sm">
                                    {templates.length === 0
                                        ? 'אין תבניות זמינות. צור תבנית ראשית בדף החוזים.'
                                        : 'לא נמצאו תבניות'}
                                </p>
                            ) : (
                                filteredTemplates.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => handleSelectTemplate(t)}
                                        disabled={submitting}
                                        className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 transition-all text-right group disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                                                <FileText size={18} />
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-slate-900 text-sm">{t.title}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">{t.fieldsMetadata?.length || 0} שדות</p>
                                            </div>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                                                <Check size={15} />
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                )}

                {/* Global submitting overlay */}
                {submitting && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-2xl">
                        <Loader2 className="animate-spin text-blue-600" size={36} />
                    </div>
                )}
            </div>
        </div>
    );
}
