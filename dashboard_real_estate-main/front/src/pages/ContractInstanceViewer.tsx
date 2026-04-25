import React, { useEffect, useState, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { getInstance } from '../services/contractInstanceService';
import { getTemplate } from '../services/contractTemplateService';
import DynamicContractRenderer from '../components/contracts/DynamicContractRenderer';
import { ContractInstance, ContractTemplate, Deal } from '../types';
import { ArrowLeft, Download, Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { DashboardDataContext } from '../hooks/useLiveDashboardData';

function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ContractInstanceViewer() {
    const { instanceId } = useParams<{ instanceId: string }>();
    const navigate = useNavigate();
    const { userData } = useAuth();
    const dashboardData = useContext(DashboardDataContext);

    const [instance, setInstance] = useState<(ContractInstance & { id: string }) | null>(null);
    const [template, setTemplate] = useState<(ContractTemplate & { id: string }) | null>(null);
    const [deal, setDeal] = useState<Deal | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    const previewRef = useRef<HTMLDivElement>(null);
    const agencyLogo = dashboardData?.agencyLogo ?? null;

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
                    navigate('/dashboard/contracts');
                    return;
                }
                setTemplate(tmpl);

                if (inst.dealId) {
                    const dealSnap = await getDoc(doc(db, 'deals', inst.dealId));
                    if (dealSnap.exists()) setDeal(dealSnap.data() as Deal);
                }
            } catch (err) {
                console.error('[ContractInstanceViewer] Load error:', err);
                toast.error('שגיאה בטעינת החוזה');
            } finally {
                setLoading(false);
            }
        })();
    }, [userData?.agencyId, instanceId, navigate]);

    const handleExportPdf = async () => {
        if (!previewRef.current || !template) return;
        try {
            setExporting(true);
            const html2pdf = (await import('html2pdf.js')).default;
            const opt = {
                margin: [15, 15, 15, 15],
                filename: `${template.title} — חתום.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
            };
            await html2pdf().set(opt).from(previewRef.current).save();
            toast.success('הקובץ הורד בהצלחה');
        } catch (err) {
            console.error('[ContractInstanceViewer] PDF export error:', err);
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

    return (
        <div className="min-h-screen bg-slate-50" dir="rtl">
            {/* Top bar */}
            <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/dashboard/contracts')}
                        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        חזור לחוזים
                    </button>
                    <div className="h-5 w-px bg-slate-200" />
                    <div>
                        <h1 className="text-base font-bold text-slate-900">{template.title}</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 border border-green-200 px-2 py-0.5 rounded-full">
                                <CheckCircle size={11} />
                                נחתם
                            </span>
                            {instance.updatedAt && (
                                <span className="text-xs text-slate-400">
                                    {formatDate(instance.updatedAt)}
                                </span>
                            )}
                            {deal && (
                                <span className="text-xs text-slate-400">
                                    • עסקה #{instance.dealId?.slice(-6).toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleExportPdf}
                    disabled={exporting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {exporting
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Download size={16} />}
                    הורד PDF
                </button>
            </div>

            {/* Signed contract body */}
            <div className="max-w-3xl mx-auto py-10 px-4">
                <div
                    ref={previewRef}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10"
                    dir="rtl"
                >
                    <DynamicContractRenderer
                        taggedText={template.taggedText}
                        fieldsMetadata={template.fieldsMetadata}
                        values={instance.values || {}}
                        onChange={() => {}}
                        userRole="agent"
                        readOnly={true}
                        logoUrl={agencyLogo ?? undefined}
                    />
                </div>

                {/* Field summary */}
                <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">
                        סיכום שדות
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {template.fieldsMetadata.map(field => {
                            const val = instance.values?.[field.id];
                            const isSig = field.type === 'signature';
                            return (
                                <div key={field.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-slate-500">{field.label}</p>
                                        {isSig ? (
                                            val
                                                ? <img src={val} alt="חתימה" className="mt-1 max-h-10 max-w-24 border border-slate-200 rounded" />
                                                : <span className="text-xs text-slate-400 mt-0.5 block">לא חתום</span>
                                        ) : (
                                            <p className="text-sm text-slate-800 mt-0.5 truncate">
                                                {val || <span className="text-slate-400 italic">ריק</span>}
                                            </p>
                                        )}
                                    </div>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                        field.role === 'agent'
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-purple-100 text-purple-700'
                                    }`}>
                                        {field.role === 'agent' ? 'סוכן' : 'לקוח'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
