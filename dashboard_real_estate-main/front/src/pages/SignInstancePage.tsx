import React, { useEffect, useState } from 'react';
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
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
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
    const [error, setError] = useState<string | null>(null);

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

    if (isDone) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl border border-green-200 p-8 max-w-md w-full text-center">
                    <CheckCircle className="inline-block text-green-600 mb-4" size={48} />
                    <h1 className="text-xl font-bold text-slate-900 mb-2">החוזה נחתם בהצלחה!</h1>
                    <p className="text-slate-600">תודה על חתימת החוזה. הוא שונמר בבטחה.</p>
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
                                {Object.values(values).filter(Boolean).length} / {clientFields.length}
                            </p>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-600 transition-all duration-300"
                                style={{
                                    width: `${(Object.values(values).filter(Boolean).length / clientFields.length) * 100}%`
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
                                חוקע חוזה...
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
