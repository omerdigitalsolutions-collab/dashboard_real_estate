import React, { useEffect, useState, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import {
    getInstance,
    updateInstanceValues,
    markInstanceSent
} from '../services/contractInstanceService';
import { getTemplate } from '../services/contractTemplateService';
import DynamicContractRenderer from '../components/contracts/DynamicContractRenderer';
import { ContractInstance, ContractTemplate, Deal, Property } from '../types';
import { ArrowLeft, Send, Loader2, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import debounce from 'lodash.debounce';
import { DashboardDataContext } from '../hooks/useLiveDashboardData';

function resolveDotPath(path: string, context: Record<string, any>): any {
    const [root, ...rest] = path.split('.');
    let cursor = context[root];
    for (const key of rest) {
        if (cursor == null) return undefined;
        cursor = cursor[key];
    }
    return cursor;
}

function magicFill(
    fieldsMetadata: any[],
    existingValues: Record<string, string>,
    deal: Deal | null,
    property: Property | null
): Record<string, string> {
    const filled = { ...existingValues };
    if (!deal) return filled;

    for (const field of fieldsMetadata) {
        if (field.mappingTarget && !filled[field.id]) {
            const value = resolveDotPath(field.mappingTarget, { deal, property });
            if (value !== undefined && value !== null) {
                filled[field.id] = String(value);
            }
        }
    }
    return filled;
}

export default function ContractInstanceEditor() {
    const { instanceId } = useParams<{ instanceId: string }>();
    const navigate = useNavigate();
    const { userData } = useAuth();
    const dashboardData = useContext(DashboardDataContext);

    const [instance, setInstance] = useState<(ContractInstance & { id: string }) | null>(null);
    const [template, setTemplate] = useState<(ContractTemplate & { id: string }) | null>(null);
    const [deal, setDeal] = useState<Deal | null>(null);
    const [property, setProperty] = useState<Property | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [exporting, setExporting] = useState(false);

    const previewRef = useRef<HTMLDivElement>(null);

    const debouncedSave = useRef(
        debounce(async (agencyId: string, id: string, vals: Record<string, string>) => {
            try {
                await updateInstanceValues(agencyId, id, vals);
            } catch (err) {
                console.error('[ContractInstanceEditor] Auto-save failed:', err);
            }
        }, 300)
    ).current;

    useEffect(() => {
        return () => { debouncedSave.flush(); };
    }, [debouncedSave]);

    useEffect(() => {
        if (!userData?.agencyId || !instanceId) {
            setLoading(false);
            return;
        }

        (async () => {
            try {
                setLoading(true);

                const inst = await getInstance(userData.agencyId, instanceId);
                if (!inst) {
                    toast.error('חוזה לא נמצא');
                    navigate('/dashboard/contracts');
                    return;
                }
                setInstance(inst);

                const tmpl = await getTemplate(userData.agencyId, inst.templateId);
                if (!tmpl) {
                    toast.error('תבנית לא נמצאה');
                    return;
                }
                setTemplate(tmpl);

                const dealSnap = await getDoc(doc(db, 'deals', inst.dealId));
                const dealData = dealSnap.data() as Deal | undefined;
                setDeal(dealData || null);

                if (dealData?.propertyId) {
                    const propSnap = await getDoc(
                        doc(db, `agencies/${userData.agencyId}/properties`, dealData.propertyId)
                    );
                    const propData = propSnap.data() as Property | undefined;
                    setProperty(propData || null);
                }

                const filledValues = magicFill(
                    tmpl.fieldsMetadata,
                    inst.values || {},
                    dealData || null,
                    null
                );
                setValues(filledValues);
            } catch (err) {
                console.error('[ContractInstanceEditor] Load error:', err);
                toast.error('שגיאה בטעינת החוזה');
            } finally {
                setLoading(false);
            }
        })();
    }, [userData?.agencyId, instanceId, navigate]);

    const handleFieldChange = (fieldId: string, value: string) => {
        setValues(prev => {
            const next = { ...prev, [fieldId]: value };
            if (userData?.agencyId && instanceId) {
                debouncedSave(userData.agencyId, instanceId, next);
            }
            return next;
        });
    };

    const handleSend = async () => {
        if (!userData?.agencyId || !instance) return;
        try {
            setSending(true);
            await markInstanceSent(userData.agencyId, instance.id);
            const signingUrl = `${window.location.origin}/sign-instance/${userData.agencyId}/${instance.id}`;
            await navigator.clipboard.writeText(signingUrl);
            toast.success('קישור החתימה הועתק ללוח (ניתן לשלוח דרך WhatsApp)');
            setTimeout(() => navigate('/dashboard/contracts'), 2000);
        } catch (err) {
            console.error('[ContractInstanceEditor] Send error:', err);
            toast.error('שגיאה בשליחת החוזה');
        } finally {
            setSending(false);
        }
    };

    const handleExportPdf = async () => {
        if (!previewRef.current || !template) return;
        try {
            setExporting(true);
            const html2pdf = (await import('html2pdf.js')).default;
            const opt = {
                margin: [15, 15, 15, 15],
                filename: `${template.title}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
            };
            await html2pdf().set(opt).from(previewRef.current).save();
            toast.success('הקובץ הורד בהצלחה');
        } catch (err) {
            console.error('[ContractInstanceEditor] PDF export error:', err);
            toast.error('שגיאה בייצוא PDF');
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <Loader2 className="animate-spin text-blue-600" size={32} />
            </div>
        );
    }

    if (!instance || !template) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="text-center">
                    <p className="text-slate-600 mb-4">חוזה לא נמצא</p>
                    <button
                        onClick={() => navigate('/dashboard/contracts')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                    >
                        חזור לחוזים
                    </button>
                </div>
            </div>
        );
    }

    const agentFields = template.fieldsMetadata.filter(f => f.role === 'agent');
    const agencyLogo = dashboardData?.agencyLogo ?? null;

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden" dir="rtl">

            {/* Right panel — agent fields */}
            <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto flex flex-col">
                <div className="sticky top-0 bg-white border-b border-slate-200 p-4 z-10">
                    <button
                        onClick={() => navigate('/dashboard/contracts')}
                        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        חזור לחוזים
                    </button>
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                        שדות לסוכן ({agentFields.length})
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{template.title}</p>
                </div>

                <div className="flex-1 p-4 space-y-3">
                    {agentFields.map(field => (
                        <div key={field.id}>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                {field.label}
                                {field.required && <span className="text-red-500 mr-1">*</span>}
                            </label>
                            <input
                                type={field.type === 'date' ? 'date' : 'text'}
                                value={values[field.id] ?? ''}
                                onChange={e => handleFieldChange(field.id, e.target.value)}
                                placeholder={field.label}
                                className={`
                                    w-full border rounded-lg px-3 py-2 text-sm
                                    focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                                    ${!values[field.id] ? 'border-yellow-300 bg-yellow-50' : 'border-slate-200 bg-white'}
                                `}
                            />
                        </div>
                    ))}
                    {agentFields.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-8">
                            אין שדות לסוכן בתבנית זו
                        </p>
                    )}
                </div>

                <div className="sticky bottom-0 border-t border-slate-200 bg-white p-4 space-y-2">
                    <button
                        onClick={handleExportPdf}
                        disabled={exporting}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {exporting
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Download size={16} />}
                        הורדה כ-PDF
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={sending}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        שלח לחתימה
                    </button>
                </div>
            </div>

            {/* Left panel — live preview (this div is what gets exported to PDF) */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-6">
                        תצוגה מקדימה
                    </h3>
                    <div ref={previewRef} dir="rtl" className="text-sm">
                        <DynamicContractRenderer
                            taggedText={template.taggedText}
                            fieldsMetadata={template.fieldsMetadata}
                            values={values}
                            onChange={handleFieldChange}
                            userRole="agent"
                            logoUrl={agencyLogo ?? undefined}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
