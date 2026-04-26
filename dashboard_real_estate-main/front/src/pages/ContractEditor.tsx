import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Draggable, { DraggableData, DraggableEvent } from 'react-draggable';
import { PenTool, Type, Calendar, Trash2, Save, Upload, ArrowLeft, Users, Sparkles, AlertTriangle, Check, RefreshCw, Loader2, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import {
    createContractFromPDF,
    createContractFromImage,
    getContract,
    updateContractFields,
    linkContractToDeal,
} from '../services/contractService';
import { Field, Deal } from '../types';

const A4_RATIO = 842 / 595;
const DEFAULT_FIELD_W = 0.18;
const DEFAULT_FIELD_H = 0.052;

type FieldType = 'signature' | 'text' | 'date';
type FieldRole = 'agent' | 'client';

interface PendingClick {
    x: number;
    y: number;
    screenX: number;
    screenY: number;
}

interface Discrepancy {
    fieldId: string;
    docValue: string;
    crmValue: string;
    label: string;
}

const FIELD_META: Record<FieldType, { label: string; icon: React.ReactNode; color: string }> = {
    signature: { label: 'חתימה', icon: <PenTool size={12} />, color: 'bg-blue-500' },
    text:      { label: 'טקסט',  icon: <Type size={12} />,    color: 'bg-green-500' },
    date:      { label: 'תאריך', icon: <Calendar size={12} />, color: 'bg-purple-500' },
};

const ROLE_LABELS: Record<FieldRole, string> = { agent: 'סוכן', client: 'לקוח' };

export default function ContractEditor() {
    const { dealId } = useParams<{ dealId: string }>();
    const navigate = useNavigate();
    const { userData, currentUser } = useAuth();

    const [fields, setFields] = useState<Field[]>([]);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [contractId, setContractId] = useState<string | null>(null);
    const [pendingClick, setPendingClick] = useState<PendingClick | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [detecting, setDetecting] = useState(false);
    const [deal, setDeal] = useState<Deal | null>(null);
    const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
    const [isImage, setIsImage] = useState(false);

    const [containerPx, setContainerPx] = useState({ w: 595, h: 842 });
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const nodeRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

    const getNodeRef = (id: string) => {
        if (!nodeRefs.current[id]) {
            nodeRefs.current[id] = React.createRef<HTMLDivElement>();
        }
        return nodeRefs.current[id];
    };

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) setContainerPx({ w: width, h: height });
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [pdfUrl]);

    useEffect(() => {
        if (!userData?.agencyId) return;

        (async () => {
            try {
                setLoading(true);

                // If dealId exists and is valid, load its data
                if (dealId && dealId !== 'new') {
                    const dealSnap = await getDoc(doc(db, 'deals', dealId));

                    if (!dealSnap.exists()) {
                        toast.error('העסקה לא נמצאה');
                        navigate('/dashboard/contracts');
                        return;
                    }

                    const dealData = dealSnap.data() as Deal & { contract?: { contractId: string; pdfUrl: string } };
                    setDeal(dealData);

                    if (dealData.contract?.contractId) {
                        const contract = await getContract(userData.agencyId, dealData.contract.contractId);
                        if (contract) {
                            setContractId(contract.id!);
                            setPdfUrl(contract.originalFileUrl);
                            setFields(contract.fields || []);
                            setIsImage(contract.source === 'scan' || /\.(jpg|jpeg|png|webp)$/i.test(contract.originalFileUrl));
                        }
                    }
                }
                // If dealId is 'new' or missing, allow empty form for PDF upload
            } catch (err) {
                toast.error('שגיאה בטעינת הנתונים');
            } finally {
                setLoading(false);
            }
        })();
    }, [dealId, userData?.agencyId, navigate]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userData?.agencyId || !currentUser) return;
        
        const isPdf = file.type === 'application/pdf';
        const isImg = file.type.startsWith('image/');

        if (!isPdf && !isImg) {
            toast.error('נא להעלות קובץ PDF או תמונה בלבד');
            return;
        }

        try {
            setUploading(true);
            let result;
            
            if (isPdf) {
                result = await createContractFromPDF(
                    userData.agencyId,
                    file,
                    currentUser.uid,
                    dealId || undefined
                );
                setIsImage(false);
            } else {
                result = await createContractFromImage(
                    userData.agencyId,
                    file,
                    currentUser.uid,
                    dealId || undefined
                );
                setIsImage(true);
            }

            const { contractId: newId, imageUrl, pdfUrl: newPdfUrl } = result as any;
            const finalUrl = imageUrl || newPdfUrl;

            // Only link if dealId exists and is valid
            if (dealId && dealId !== 'new') {
                await linkContractToDeal(dealId, newId, finalUrl);
            }

            setContractId(newId);
            setPdfUrl(finalUrl);
            setFields([]);
            toast.success('הקובץ הועלה בהצלחה');
            
            // Auto-run AI detection after upload
            setTimeout(() => runAIDetection(), 1000);
        } catch (err: any) {
            toast.error(`העלאה נכשלה: ${err.message}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const runAIDetection = async () => {
        if (!pdfUrl) return;
        setDetecting(true);
        try {
            // Mock AI Detection of fields and party details
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const detectedFields: Field[] = [
                {
                    id: 'f_name_client',
                    type: 'text',
                    role: 'client',
                    label: 'שם הלקוח',
                    value: 'ישראל ישראלי',
                    position: { x: 0.2, y: 0.15, width: 0.2, height: 0.04, page: 1 }
                },
                {
                    id: 'f_sig_client',
                    type: 'signature',
                    role: 'client',
                    label: 'חתימת לקוח',
                    position: { x: 0.7, y: 0.85, width: 0.15, height: 0.08, page: 1 }
                },
                {
                    id: 'f_sig_agent',
                    type: 'signature',
                    role: 'agent',
                    label: 'חתימת סוכן',
                    position: { x: 0.2, y: 0.85, width: 0.15, height: 0.08, page: 1 }
                }
            ];

            setFields(detectedFields);

            // Check for discrepancies if deal info is available
            if (deal) {
                const newDiscrepancies: Discrepancy[] = [];
                // Example: CRM says 'John Doe', PDF says 'ישראל ישראלי'
                if (deal.id && detectedFields[0].value !== (deal as any).clientName) {
                    newDiscrepancies.push({
                        fieldId: 'f_name_client',
                        docValue: detectedFields[0].value!,
                        crmValue: (deal as any).clientName || 'לא צוין ב-CRM',
                        label: 'שם הלקוח'
                    });
                }
                setDiscrepancies(newDiscrepancies);
            }

            toast.success('AI זיהה שדות וחתימות באופן אוטומטי');
        } catch (err) {
            toast.error('שגיאה בניתוח ה-AI');
        } finally {
            setDetecting(false);
        }
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        setPendingClick({
            x: relX / rect.width,
            y: relY / rect.height,
            screenX: relX,
            screenY: relY,
        });
    };

    const addField = (type: FieldType, role: FieldRole = 'client') => {
        if (!pendingClick) return;
        const newField: Field = {
            id: `field_${Date.now()}`,
            type,
            role,
            label: metaFor(type).label,
            position: {
                x: Math.max(0, Math.min(1 - DEFAULT_FIELD_W, pendingClick.x - DEFAULT_FIELD_W / 2)),
                y: Math.max(0, Math.min(1 - DEFAULT_FIELD_H, pendingClick.y - DEFAULT_FIELD_H / 2)),
                width:  DEFAULT_FIELD_W,
                height: DEFAULT_FIELD_H,
                page: 1,
            },
        };
        setFields(prev => [...prev, newField]);
        setPendingClick(null);
    };

    const metaFor = (type: FieldType) => FIELD_META[type];

    const handleDragStop = useCallback((id: string, _e: DraggableEvent, data: DraggableData) => {
        setFields(prev => prev.map(f => {
            if (f.id !== id) return f;
            return {
                ...f,
                position: {
                    ...f.position,
                    x: Math.max(0, Math.min(1 - f.position.width, data.x / containerPx.w)),
                    y: Math.max(0, Math.min(1 - f.position.height, data.y / containerPx.h)),
                },
            };
        }));
    }, [containerPx]);

    const toggleRole = (id: string) => {
        setFields(prev => prev.map(f => f.id === id ? { ...f, role: f.role === 'agent' ? 'client' : 'agent' } : f));
    };

    const deleteField = (id: string) => {
        setFields(prev => prev.filter(f => f.id !== id));
        delete nodeRefs.current[id];
    };

    const handleSave = async () => {
        if (!userData?.agencyId || !contractId) return;
        try {
            setSaving(true);
            await updateContractFields(userData.agencyId, contractId, fields);
            toast.success('השינויים נשמרו');
        } catch (err: any) {
            toast.error('שגיאה בשמירה');
        } finally {
            setSaving(false);
        }
    };

    const syncWithCRM = (fieldId: string, crmValue: string) => {
        setFields(prev => prev.map(f => f.id === fieldId ? { ...f, value: crmValue } : f));
        setDiscrepancies(prev => prev.filter(d => d.fieldId !== fieldId));
        toast.success('סונכרן עם ה-CRM');
    };

    const keepOriginal = (fieldId: string) => {
        setDiscrepancies(prev => prev.filter(d => d.fieldId !== fieldId));
        toast.success('נשמר הערך מהמסמך');
    };

    if (loading) return <div className="flex items-center justify-center h-screen text-slate-500 bg-slate-50"><Loader2 className="animate-spin text-blue-600" /></div>;

    return (
        <div className="flex flex-col h-screen bg-slate-100 overflow-hidden" dir="rtl">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shadow-sm z-30">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 transition-all">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 truncate max-w-xs">
                            עריכת חוזה {dealId ? `— עסקה ${dealId.slice(-6).toUpperCase()}` : ''}
                        </h1>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">PDF Signature Editor</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={runAIDetection}
                        disabled={detecting || !pdfUrl}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-sm font-bold hover:bg-blue-100 disabled:opacity-50 transition-all"
                    >
                        {detecting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        ניתוח AI
                    </button>
                    
                    <input ref={fileInputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={handleFileChange} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all">
                        <Upload size={16} />
                        {uploading ? 'מעלה...' : 'החלף מסמך'}
                    </button>
                    <button
                        onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.capture = 'environment';
                            input.onchange = (e) => handleFileChange(e as any);
                            input.click();
                        }}
                        disabled={uploading}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all"
                    >
                        <Camera size={16} />
                        {uploading ? 'מעלה...' : 'סרוק'}
                    </button>

                    <button onClick={handleSave} disabled={saving || !contractId} className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg shadow-slate-900/10">
                        <Save size={16} />
                        {saving ? 'שומר...' : 'שמור שינויים'}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar: Discrepancies & Instructions */}
                <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-4 flex flex-col gap-6">
                    {discrepancies.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-amber-600">
                                <AlertTriangle size={18} />
                                <h2 className="text-sm font-bold">נמצאו חוסר התאמות (AI)</h2>
                            </div>
                            <div className="space-y-3">
                                {discrepancies.map(d => (
                                    <div key={d.fieldId} className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
                                        <p className="text-xs font-bold text-amber-900">{d.label}</p>
                                        <div className="grid grid-cols-1 gap-1.5">
                                            <div className="flex items-center justify-between text-[10px]">
                                                <span className="text-slate-500 font-medium">במסמך:</span>
                                                <span className="text-amber-800 font-bold">{d.docValue}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px]">
                                                <span className="text-slate-500 font-medium">ב-CRM:</span>
                                                <span className="text-blue-700 font-bold">{d.crmValue}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                            <button 
                                                onClick={() => syncWithCRM(d.fieldId, d.crmValue)}
                                                className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 flex items-center justify-center gap-1"
                                            >
                                                <RefreshCw size={10} />
                                                סנכרן
                                            </button>
                                            <button 
                                                onClick={() => keepOriginal(d.fieldId)}
                                                className="flex-1 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-50 flex items-center justify-center gap-1"
                                            >
                                                <Check size={10} />
                                                השאר
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">הוראות</h2>
                        <ul className="space-y-3">
                            {[
                                { icon: <Sparkles className="text-blue-500" />, text: 'לחץ על "ניתוח AI" לזיהוי שדות אוטומטי' },
                                { icon: <PenTool className="text-indigo-500" />, text: 'לחץ על המסמך להוספת שדה חתימה ידני' },
                                { icon: <Users className="text-purple-500" />, text: 'ניתן לשנות את התפקיד (סוכן/לקוח) בכל שדה' },
                            ].map((item, idx) => (
                                <li key={idx} className="flex gap-3 text-xs text-slate-600 leading-relaxed">
                                    <div className="mt-0.5">{React.cloneElement(item.icon as React.ReactElement, { size: 14 })}</div>
                                    {item.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 overflow-auto flex items-start justify-center p-12 bg-slate-100/50">
                    {!pdfUrl ? (
                        <div className="flex flex-col gap-6 w-full max-w-2xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div 
                                    onClick={() => fileInputRef.current?.click()} 
                                    className="flex flex-col items-center justify-center aspect-[1/1.4] bg-white border-2 border-dashed border-slate-300 rounded-3xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/20 transition-all text-slate-400 group shadow-sm"
                                >
                                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <Upload size={36} className="text-blue-600" />
                                    </div>
                                    <p className="font-bold text-slate-700 text-lg">העלה חוזה PDF</p>
                                    <p className="text-sm mt-2 px-6 text-center">בחר קובץ קיים מהמחשב או מהנייד</p>
                                </div>

                                <div 
                                    onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = 'image/*';
                                        input.capture = 'environment';
                                        input.onchange = (e) => handleFileChange(e as any);
                                        input.click();
                                    }} 
                                    className="flex flex-col items-center justify-center aspect-[1/1.4] bg-white border-2 border-dashed border-slate-300 rounded-3xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/20 transition-all text-slate-400 group shadow-sm"
                                >
                                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <Camera size={36} className="text-indigo-600" />
                                    </div>
                                    <p className="font-bold text-slate-700 text-lg">סרוק מהמצלמה</p>
                                    <p className="text-sm mt-2 px-6 text-center">צלם מסמך פיזי והפוך אותו לדיגיטלי</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="relative bg-white shadow-2xl rounded-sm" style={{ width: '100%', maxWidth: 700, paddingBottom: `${A4_RATIO * 100}%` }}>
                            <div ref={containerRef} className="absolute inset-0">
                                {isImage ? (
                                    <img 
                                        src={pdfUrl} 
                                        className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
                                        alt="Contract Scan" 
                                    />
                                ) : (
                                    <iframe 
                                        src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
                                        className="absolute inset-0 w-full h-full border-0 pointer-events-none" 
                                        title="Contract PDF" 
                                    />
                                )}
                                <div className="absolute inset-0 cursor-crosshair z-10" onClick={handleCanvasClick} />

                                {fields.map(field => {
                                    const meta = metaFor(field.type as FieldType);
                                    const nodeRef = getNodeRef(field.id);
                                    const pxX = field.position.x * containerPx.w;
                                    const pxY = field.position.y * containerPx.h;
                                    const pxW = field.position.width * containerPx.w;
                                    const pxH = field.position.height * containerPx.h;
                                    const hasDiscrepancy = discrepancies.some(d => d.fieldId === field.id);

                                    return (
                                        <Draggable key={field.id} nodeRef={nodeRef as React.RefObject<HTMLElement>} position={{ x: pxX, y: pxY }} bounds="parent" onStop={(e, data) => handleDragStop(field.id, e, data)}>
                                            <div ref={nodeRef} style={{ position: 'absolute', left: 0, top: 0, width: pxW, height: pxH, zIndex: 20 }} className="group cursor-move">
                                                <div className={`flex items-center gap-1.5 px-2 h-full rounded-lg text-white text-[11px] font-bold shadow-lg select-none ${hasDiscrepancy ? 'bg-amber-500 animate-pulse' : meta.color} opacity-95 border-2 border-white/20 transition-all`}>
                                                    {meta.icon}
                                                    <span className="truncate flex-1">{field.label || meta.label}</span>
                                                    <span className="opacity-70 text-[9px] bg-black/20 px-1.5 py-0.5 rounded uppercase">{ROLE_LABELS[field.role as FieldRole]}</span>
                                                </div>

                                                <div className="absolute -top-10 right-0 hidden group-hover:flex items-center gap-1 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-30">
                                                    <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); toggleRole(field.id); }} className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 rounded-lg transition-all border border-transparent hover:border-slate-100">
                                                        <Users size={12} />
                                                        {ROLE_LABELS[field.role as FieldRole]}
                                                    </button>
                                                    <div className="w-px h-4 bg-slate-100 mx-1" />
                                                    <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); deleteField(field.id); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        </Draggable>
                                    );
                                })}

                                {pendingClick && (
                                    <>
                                        <div className="absolute inset-0 z-30" onClick={() => setPendingClick(null)} />
                                        <div className="absolute bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 min-w-[180px] z-40 animate-in fade-in zoom-in duration-200" style={{ right: pendingClick.screenX + 12, top: pendingClick.screenY + 12 }}>
                                            <p className="text-[10px] text-slate-400 px-3 mb-2 font-bold uppercase tracking-widest">הוסף שדה</p>
                                            {(Object.entries(FIELD_META) as [FieldType, typeof FIELD_META[FieldType]][]).map(([type, meta]) => (
                                                <button key={type} onClick={() => addField(type)} className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all text-right">
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-white ${meta.color} shadow-sm`}>{meta.icon}</span>
                                                    {meta.label}
                                                </button>
                                            ))}
                                            <div className="border-t border-slate-50 mt-2 pt-2 px-1">
                                                <div className="flex gap-1">
                                                    {(['client', 'agent'] as FieldRole[]).map(role => (
                                                        <button key={role} onClick={() => addField('signature', role)} className="flex-1 text-[10px] font-bold py-1.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-slate-600">
                                                            {ROLE_LABELS[role]}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="px-6 py-2 bg-white border-t border-slate-200 text-[10px] font-bold text-slate-400 flex items-center justify-between z-30">
                <div className="flex items-center gap-4">
                    <span>{fields.length} שדות הוגדרו</span>
                    {contractId && <span className="text-slate-300">ID: {contractId}</span>}
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span>המערכת מחוברת ומוכנה</span>
                </div>
            </div>
        </div>
    );
}
