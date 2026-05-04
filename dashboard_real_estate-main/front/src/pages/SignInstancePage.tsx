import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../config/firebase';
import {
    getInstance,
    updateInstanceValues,
    markInstanceSigned
} from '../services/contractInstanceService';
import { getTemplate } from '../services/contractTemplateService';
import DynamicContractRenderer from '../components/contracts/DynamicContractRenderer';
import { ContractInstance, ContractTemplate } from '../types';
import { CheckCircle, AlertCircle, Loader2, Download } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignInstancePage() {
    const { agencyId, instanceId } = useParams<{ agencyId: string; instanceId: string }>();
    const navigate = useNavigate();

    const [instance, setInstance] = useState<(ContractInstance & { id: string }) | null>(null);
    const [template, setTemplate] = useState<(ContractTemplate & { id: string }) | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!agencyId || !instanceId) {
            setError('פרמטרים חסרים');
            setLoading(false);
            return;
        }

        (async () => {
            try {
                setLoading(true);

                if (!auth.currentUser) {
                    await signInAnonymously(auth);
                }

                const inst = await getInstance(agencyId, instanceId);
                if (!inst) {
                    setError('חוזה לא נמצא');
                    return;
                }

                if (inst.status === 'signed') {
                    setError('חוזה זה כבר נחתם');
                    return;
                }

                setInstance(inst);

                const tmpl = await getTemplate(agencyId, inst.templateId);
                if (!tmpl) {
                    setError('תבנית לא נמצאה');
                    return;
                }

                setTemplate(tmpl);
                setValues(inst.values || {});
            } catch (err: any) {
                console.error('[SignInstancePage] Load error:', err);
                setError(err.message || 'שגיאה בטעינת החוזה');
            } finally {
                setLoading(false);
            }
        })();
    }, [agencyId, instanceId]);

    const handleFieldChange = (fieldId: string, value: string) => {
        setValues((prev) => ({ ...prev, [fieldId]: value }));
    };

    const handleExportPdf = async () => {
        if (!previewRef.current || !template) return;
        try {
            setIsExporting(true);
            const html2pdf = (await import('html2pdf.js')).default;
            const clone = previewRef.current.cloneNode(true) as HTMLElement;
            clone.style.cssText = [
                'width:740px', 'padding:30px 40px',
                'font-family:Arial,"Helvetica Neue",Helvetica,sans-serif',
                'font-size:14px', 'line-height:2', 'direction:rtl',
                'background:white', 'color:#000', 'box-sizing:border-box', 'overflow:visible',
            ].join(';');
            clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
                el.style.overflow = 'visible';
                el.style.textOverflow = 'clip';
                el.style.maxWidth = 'none';
            });
            clone.querySelectorAll('input, textarea').forEach((el) => {
                const input = el as HTMLInputElement | HTMLTextAreaElement;
                const span = document.createElement('span');
                const isDate = (input as HTMLInputElement).type === 'date';
                let display = input.value;
                if (isDate && display) {
                    const [y, m, d] = display.split('-');
                    display = `${d}/${m}/${y}`;
                }
                span.style.cssText = [
                    'display:inline-block', 'border-bottom:1.5px solid #444',
                    'padding:0 6px', 'margin:0 2px', 'color:#000',
                    'font-size:13px', 'min-width:80px', 'text-align:center', 'white-space:nowrap',
                ].join(';');
                span.textContent = display || '___________';
                input.replaceWith(span);
            });
            await html2pdf().set({
                margin: [12, 12, 12, 12] as [number, number, number, number],
                filename: `${template.title} — חתום.pdf`,
                image: { type: 'jpeg' as const, quality: 0.97 },
                html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true, windowWidth: 740, scrollX: 0, scrollY: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
                pagebreak: { mode: ['css', 'legacy'], avoid: 'img' },
            }).from(clone).save();
            toast.success('הקובץ הורד בהצלחה');
        } catch (err) {
            console.error('[SignInstancePage] PDF export error:', err);
            toast.error('שגיאה בייצוא PDF');
        } finally {
            setIsExporting(false);
        }
    };

    const handleSign = async () => {
        if (!template || !instance || !agencyId) return;

        const clientFields = template.fieldsMetadata.filter((f) => f.role === 'client');
        const missing = clientFields.filter(
            (f) => f.required && !values[f.id]
        );

        if (missing.length > 0) {
            toast.error(`נא למלא את כל השדות החובה (${missing.length} חסרים)`);
            return;
        }

        try {
            setIsProcessing(true);

            if (!auth.currentUser) {
                await signInAnonymously(auth);
            }

            await updateInstanceValues(agencyId, instance.id, values);
            await markInstanceSigned(agencyId, instance.id);

            setIsDone(true);
            toast.success('החוזה נחתם בהצלחה!');
        } catch (err: any) {
            console.error('[SignInstancePage] Sign error:', err);
            toast.error('שגיאה בחתימה: ' + (err.message || 'Unknown error'));
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="text-center">
                    <Loader2 className="inline-block animate-spin text-blue-600 mb-4" size={32} />
                    <p className="text-slate-600">טוען חוזה...</p>
                </div>
            </div>
        );
    }

    if (error || !instance || !template) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md w-full text-center">
                    <AlertCircle className="inline-block text-red-600 mb-4" size={48} />
                    <h1 className="text-xl font-bold text-slate-900 mb-2">שגיאה</h1>
                    <p className="text-slate-600 mb-6">{error || 'חוזה לא נמצא'}</p>
                </div>
            </div>
        );
    }

    if (isDone && template) {
        return (
            <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto">
                    <div className="bg-white rounded-2xl border border-green-200 p-8 mb-6 text-center">
                        <CheckCircle className="inline-block text-green-600 mb-4" size={48} />
                        <h1 className="text-xl font-bold text-slate-900 mb-2">החוזה נחתם בהצלחה!</h1>
                        <p className="text-slate-600 mb-4">עותק החוזה נשלח אליך במייל. תודה על חתימת החוזה.</p>
                        <button
                            onClick={handleExportPdf}
                            disabled={isExporting}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                        >
                            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            {isExporting ? 'מייצא PDF...' : 'הורד חוזה PDF'}
                        </button>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8" ref={previewRef}>
                        <DynamicContractRenderer
                            taggedText={template.taggedText}
                            fieldsMetadata={template.fieldsMetadata}
                            values={values}
                            onChange={() => {}}
                            userRole="client"
                            readOnly
                        />
                    </div>
                </div>
            </div>
        );
    }

    const clientFields = template.fieldsMetadata.filter((f) => f.role === 'client');
    const requiredClientFields = clientFields.filter((f) => f.required);
    const filledRequired = requiredClientFields.filter((f) => values[f.id]);

    return (
        <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">חתום על החוזה</h1>
                    <p className="text-slate-600">
                        אנא מלא את השדות ובחתום על החוזה כדי להשלים את התהליך
                    </p>
                </div>

                {/* Progress */}
                {clientFields.length > 0 && (
                    <div className="mb-6 bg-white rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-slate-700">התקדמות</p>
                            <p className="text-sm text-slate-600">
                                {clientFields.filter(f => values[f.id]).length} / {clientFields.length}
                            </p>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-600 transition-all duration-300"
                                style={{
                                    width: `${(clientFields.filter(f => values[f.id]).length / clientFields.length) * 100}%`
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Contract */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-6">
                    <DynamicContractRenderer
                        taggedText={template.taggedText}
                        fieldsMetadata={template.fieldsMetadata}
                        values={values}
                        onChange={handleFieldChange}
                        userRole="client"
                    />
                </div>

                {/* Submit Button */}
                <div className="flex gap-4">
                    <button
                        onClick={handleSign}
                        disabled={
                            isProcessing ||
                            (requiredClientFields.length > 0 &&
                                filledRequired.length < requiredClientFields.length)
                        }
                        className={`
                            flex-1 px-6 py-3 rounded-lg font-semibold text-white text-center transition-colors
                            ${
                                isProcessing ||
                                (requiredClientFields.length > 0 &&
                                    filledRequired.length < requiredClientFields.length)
                                    ? 'bg-slate-400 cursor-not-allowed opacity-60'
                                    : 'bg-green-600 hover:bg-green-700'
                            }
                        `}
                        type="button"
                    >
                        {isProcessing ? (
                            <span className="flex items-center justify-center gap-2">
                                <Loader2 size={18} className="animate-spin" />
                                חותם על החוזה...
                            </span>
                        ) : (
                            'חתום על החוזה'
                        )}
                    </button>
                </div>

                {requiredClientFields.length > 0 &&
                    filledRequired.length < requiredClientFields.length && (
                        <p className="text-center text-sm text-slate-600 mt-4">
                            נא למלא את כל השדות החובה ({requiredClientFields.length -
                                filledRequired.length}{' '}
                            חסרים)
                        </p>
                    )}
            </div>
        </div>
    );
}
