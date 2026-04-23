import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { PenTool, CheckCircle, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { getContract } from '../services/contractService';
import { signingService } from '../services/signingService';
import { Contract, Field } from '../types';

/**
 * Public signing page for clients.
 * URL: /sign/:agencyId/:contractId
 * No authentication required — uses anonymous Firebase Auth.
 */
export default function SignaturePage() {
    const { agencyId, contractId } = useParams<{ agencyId: string; contractId: string }>();
    const navigate = useNavigate();

    // ── State ──────────────────────────────────────────────────────────────────
    const [contract, setContract] = useState<(Contract & { id: string }) | null>(null);
    const [fields, setFields] = useState<Field[]>([]);
    const [activeSigField, setActiveSigField] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const fieldRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const [showModalFallback, setShowModalFallback] = useState(false);

    // Signature canvas ref
    const sigCanvasRef = useRef<SignatureCanvas>(null);

    // ── Load contract on mount ─────────────────────────────────────────────────
    useEffect(() => {
        if (!agencyId || !contractId) {
            setError('Invalid signing link');
            setLoading(false);
            return;
        }

        (async () => {
            try {
                setLoading(true);
                const data = await getContract(agencyId, contractId);

                if (!data) {
                    setError('Contract not found');
                    return;
                }

                if (data.status === 'completed') {
                    setError('This contract has already been signed');
                    return;
                }

                setContract(data);
                setFields(data.fields || []);

                // Track view
                if (data.status !== 'completed') {
                    signingService.trackContractView(agencyId, contractId).catch(console.error);
                }
            } catch (err: any) {
                console.error('Failed to load contract:', err);
                setError(`Failed to load contract: ${err.message}`);
            } finally {
                setLoading(false);
            }
        })();
    }, [agencyId, contractId]);

    // ── Update field value (text/date input) ────────────────────────────────
    const updateFieldValue = (fieldId: string, value: string) => {
        setFields(prev =>
            prev.map(f =>
                f.id === fieldId ? { ...f, value } : f
            )
        );
    };

    // ── Activate field & calculate size ─────────────────────────────────────
    const handleActivateField = (fieldId: string) => {
        const el = fieldRefs.current[fieldId];
        if (el) {
            const rect = el.getBoundingClientRect();
            // Fallback for very small fields
            if (rect.width < 100 || rect.height < 50) {
                setShowModalFallback(true);
            } else {
                setShowModalFallback(false);
            }
            setCanvasSize({ width: rect.width, height: Math.max(rect.height, 80) });
        }
        setActiveSigField(fieldId);
    };

    // Resize listener to close active field if window resizes, as rect changes
    useEffect(() => {
        const handleResize = () => {
            if (activeSigField) {
                setActiveSigField(null);
                setShowModalFallback(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeSigField]);

    // ── Confirm signature from modal or inline ─────────────────────────────
    const confirmSignature = () => {
        if (sigCanvasRef.current && activeSigField) {
            try {
                const canvas = sigCanvasRef.current.getCanvas();
                const isEmpty = !canvas
                    .getContext('2d')
                    ?.getImageData(0, 0, canvas.width, canvas.height)
                    .data.some((byte: number) => byte !== 0);

                if (isEmpty) {
                    toast.error('Please draw your signature');
                    return;
                }

                const dataUrl = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png');
                updateFieldValue(activeSigField, dataUrl);
                setActiveSigField(null);
                toast.success('Signature captured');
            } catch (err) {
                toast.error('Failed to capture signature');
            }
        }
    };

    // ── Submit and sign ────────────────────────────────────────────────────
    const handleFinish = async () => {
        if (!agencyId || !contractId || !contract?.dealId) {
            toast.error('Missing contract information');
            return;
        }

        // Validate required fields
        const missingRequired = fields.filter(f => f.required && !f.value);
        if (missingRequired.length > 0) {
            toast.error(`Please fill in all required fields (${missingRequired.length} remaining)`);
            return;
        }

        // Validate all fields have values
        const missingAny = fields.filter(f => !f.value);
        if (missingAny.length > 0) {
            toast.error(`Please fill in all fields (${missingAny.length} remaining)`);
            return;
        }

        try {
            setIsProcessing(true);

            // Step 1: Update field values in Firestore
            await signingService.updateFieldValues(agencyId, contractId, fields);

            // Step 2: Trigger Cloud Function to burn PDF
            await signingService.triggerSignFunction(contract.dealId, agencyId);

            setIsDone(true);
            toast.success('Contract signed successfully!');
        } catch (err: any) {
            console.error('Signing failed:', err);
            toast.error(`Signing failed: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Error state ────────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-4">
                <div className="max-w-md text-center">
                    <AlertCircle size={48} className="text-red-600 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-red-900 mb-2">Error</h1>
                    <p className="text-red-700 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    // ── Loading state ──────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 size={48} className="text-blue-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Loading contract...</p>
                </div>
            </div>
        );
    }

    // ── Success state ──────────────────────────────────────────────────────
    if (isDone) {
        return (
            <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4">
                <div className="max-w-md text-center bg-white rounded-2xl p-8 shadow-lg">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-green-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">חוזה חתום!</h1>
                    <p className="text-gray-600 mb-6">
                        עותק חתום יישלח אליך בדואר במקרוב. תודה על אישור החוזה.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors"
                    >
                        חזור לעמוד הבית
                    </button>
                </div>
            </div>
        );
    }

    // ── Main signing page ──────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft size={20} className="text-gray-600" />
                        </button>
                        <h1 className="text-lg font-bold text-gray-900">חתימה על חוזה</h1>
                    </div>
                    <button
                        onClick={handleFinish}
                        disabled={isProcessing || fields.some(f => !f.value)}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                חותם...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={16} />
                                חתום וחזור
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto pb-20">
                <div className="max-w-4xl mx-auto px-4 py-6">
                    {contract && (
                        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                            {/* PDF Preview Container with A4 aspect ratio */}
                            <div
                                className="relative bg-gray-100 border-b border-gray-200"
                                style={{
                                    width: '100%',
                                    maxWidth: 595,
                                    marginLeft: 'auto',
                                    marginRight: 'auto',
                                    paddingBottom: '141.4%', // A4 ratio
                                }}
                            >
                                <div className="absolute inset-0">
                                    {/* PDF iframe */}
                                    <iframe
                                        src={`${contract.originalFileUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                        className="w-full h-full border-0 pointer-events-none"
                                        title="Contract PDF"
                                    />

                                    {/* Field overlays */}
                                    {fields.map(field => (
                                        <div
                                            key={field.id}
                                            ref={el => { fieldRefs.current[field.id] = el; }}
                                            className={`absolute ${activeSigField === field.id && !showModalFallback ? 'z-50' : 'z-10'}`}
                                            style={{
                                                left: `${field.position.x * 100}%`,
                                                top: `${field.position.y * 100}%`,
                                                width: `${field.position.width * 100}%`,
                                                height: `${field.position.height * 100}%`,
                                            }}
                                        >
                                            {field.type === 'signature' ? (
                                                activeSigField === field.id && !showModalFallback ? (
                                                    <div className="absolute top-0 left-0 w-full h-full bg-white border-2 border-blue-500 rounded shadow-xl overflow-visible">
                                                        <SignatureCanvas
                                                            ref={sigCanvasRef}
                                                            penColor="black"
                                                            canvasProps={{
                                                                width: canvasSize.width,
                                                                height: canvasSize.height,
                                                                className: 'cursor-crosshair w-full h-full touch-none'
                                                            }}
                                                        />
                                                        <div className="absolute top-full left-0 mt-2 flex gap-2 w-max bg-white p-2 rounded shadow-lg border border-gray-200" dir="rtl">
                                                            <button onClick={(e) => { e.stopPropagation(); confirmSignature(); }} className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded flex items-center gap-1 hover:bg-blue-700">
                                                                <CheckCircle size={14} /> אישור
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); setActiveSigField(null); }} className="px-3 py-1.5 text-xs font-bold bg-red-100 text-red-600 rounded hover:bg-red-200">
                                                                ביטול
                                                            </button>
                                                            <button onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                const data = sigCanvasRef.current?.toData();
                                                                if (data && data.length > 0) {
                                                                    data.pop();
                                                                    sigCanvasRef.current?.fromData(data);
                                                                }
                                                            }} className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 rounded">
                                                                אחורה
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); sigCanvasRef.current?.clear(); }} className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 rounded">
                                                                נקה
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                <button
                                                    onClick={() => handleActivateField(field.id)}
                                                    className={`w-full h-full rounded border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors
                                                        ${field.value
                                                        ? 'border-green-500 bg-green-50 hover:bg-green-100'
                                                        : 'border-blue-400 bg-blue-50 hover:bg-blue-100 animate-pulse'
                                                    }`}
                                                >
                                                    {field.value ? (
                                                        <img src={field.value} alt="signature" className="h-full w-full object-contain p-1" />
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <PenTool size={14} className="text-blue-500" />
                                                            <span className="text-[10px] text-blue-600 font-medium">חתום</span>
                                                        </div>
                                                    )}
                                                </button>
                                                )
                                            ) : (
                                                <input
                                                    type={field.type === 'date' ? 'date' : 'text'}
                                                    value={field.value || ''}
                                                    placeholder={field.label || field.type}
                                                    onChange={(e) => updateFieldValue(field.id, e.target.value)}
                                                    className="w-full h-full border border-blue-400 rounded px-2 text-xs focus:ring-2 ring-blue-500 outline-none shadow-sm bg-white"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Field status */}
                            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                                <div className="text-xs text-gray-600">
                                    {fields.filter(f => !f.value).length} {fields.filter(f => !f.value).length === 1 ? 'field' : 'fields'} remaining
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {fields.map(field => (
                                        <div
                                            key={field.id}
                                            className={`text-xs px-2 py-1 rounded-full font-medium
                                                ${field.value
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-yellow-100 text-yellow-700'
                                            }`}
                                        >
                                            {field.label || field.type}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Signature Modal Fallback */}
            {activeSigField && showModalFallback && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-end md:items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-2xl md:rounded-2xl shadow-2xl overflow-hidden">
                        {/* Modal header */}
                        <div className="px-4 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="font-bold text-gray-900">צייר חתימה</h3>
                            <button
                                onClick={() => setActiveSigField(null)}
                                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Canvas area */}
                        <div className="p-4 bg-gray-50">
                            <div className="border-2 border-gray-300 rounded-lg bg-white overflow-hidden">
                                <SignatureCanvas
                                    ref={sigCanvasRef}
                                    penColor="black"
                                    canvasProps={{
                                        className: 'w-full h-64 cursor-crosshair bg-white',
                                        width: 400,
                                        height: 256,
                                    }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 text-center mt-2">
                                חתום עם העכבר או האצבע (למובייל)
                            </p>
                        </div>

                        {/* Modal footer */}
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex gap-3">
                            <button
                                onClick={() => sigCanvasRef.current?.clear()}
                                className="flex-1 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                                נקה
                            </button>
                            <button
                                onClick={confirmSignature}
                                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <CheckCircle size={16} />
                                אישור
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Processing overlay */}
            {isProcessing && (
                <div className="fixed inset-0 z-[200] bg-white/90 flex flex-col items-center justify-center backdrop-blur-sm">
                    <Loader2 size={56} className="text-blue-600 animate-spin mb-4" />
                    <p className="font-bold text-lg text-gray-900 mb-2">יוצר חוזה חתום...</p>
                    <p className="text-sm text-gray-600">זה עשוי לקחת כמה שניות</p>
                </div>
            )}
        </div>
    );
}
