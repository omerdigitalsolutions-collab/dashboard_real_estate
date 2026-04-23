import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Draggable, { DraggableData, DraggableEvent } from 'react-draggable';
import { PenTool, Type, Calendar, Trash2, Save, Upload, ArrowLeft, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import {
    createContractFromPDF,
    getContract,
    updateContractFields,
    linkContractToDeal,
} from '../services/contractService';
import { Field } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

// A4 aspect ratio (height / width). We always enforce this on the container.
const A4_RATIO = 842 / 595; // ≈ 1.4151

// Default field box size as a fraction of the container, stored in the DB
// and used to draw the visual chip. Keeps it responsive at all screen sizes.
const DEFAULT_FIELD_W = 0.18; // 18% of container width
const DEFAULT_FIELD_H = 0.052; // 5.2% of container height

type FieldType = 'signature' | 'text' | 'date';
type FieldRole = 'agent' | 'client';

interface PendingClick {
    x: number; // normalized 0-1 (click point, used as center of new field)
    y: number;
    screenX: number; // px from container left edge — for positioning the ContextMenu
    screenY: number;
}

// ─── Small sub-components ─────────────────────────────────────────────────────

const FIELD_META: Record<FieldType, { label: string; icon: React.ReactNode; color: string }> = {
    signature: { label: 'חתימה', icon: <PenTool size={12} />, color: 'bg-blue-500' },
    text:      { label: 'טקסט',  icon: <Type size={12} />,    color: 'bg-green-500' },
    date:      { label: 'תאריך', icon: <Calendar size={12} />, color: 'bg-purple-500' },
};

const ROLE_LABELS: Record<FieldRole, string> = { agent: 'סוכן', client: 'לקוח' };

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContractEditor() {
    const { dealId } = useParams<{ dealId: string }>();
    const navigate = useNavigate();
    const { userData, currentUser } = useAuth();

    // ── State ──────────────────────────────────────────────────────────────────
    const [fields, setFields]               = useState<Field[]>([]);
    const [pdfUrl, setPdfUrl]               = useState<string | null>(null);
    const [contractId, setContractId]       = useState<string | null>(null);
    const [pendingClick, setPendingClick]   = useState<PendingClick | null>(null);
    const [saving, setSaving]               = useState(false);
    const [uploading, setUploading]         = useState(false);
    const [loading, setLoading]             = useState(true);

    // Container pixel dimensions — kept in sync via ResizeObserver.
    // Used ONLY to convert between px and normalized values; never stored in DB.
    const [containerPx, setContainerPx]    = useState({ w: 595, h: 842 });

    // ── Refs ───────────────────────────────────────────────────────────────────
    const containerRef  = useRef<HTMLDivElement>(null);
    const fileInputRef  = useRef<HTMLInputElement>(null);
    // react-draggable needs individual nodeRefs to avoid deprecated findDOMNode
    const nodeRefs      = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

    const getNodeRef = (id: string) => {
        if (!nodeRefs.current[id]) {
            nodeRefs.current[id] = React.createRef<HTMLDivElement>();
        }
        return nodeRefs.current[id];
    };

    // ── Track container size so px↔normalized conversion stays accurate ────────
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) {
                setContainerPx({ w: width, h: height });
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [pdfUrl]); // re-attach once the container appears after PDF is set

    // ── Load deal + existing contract on mount ─────────────────────────────────
    useEffect(() => {
        if (!dealId || !userData?.agencyId) return;

        (async () => {
            try {
                setLoading(true);
                const dealSnap = await getDoc(doc(db, 'deals', dealId));

                if (!dealSnap.exists()) {
                    toast.error('Deal not found');
                    navigate('/transactions');
                    return;
                }

                const dealData = dealSnap.data() as {
                    agencyId: string;
                    contract?: { contractId: string; pdfUrl: string };
                };

                if (dealData.agencyId !== userData.agencyId) {
                    toast.error('Access denied');
                    navigate('/transactions');
                    return;
                }

                if (dealData.contract?.contractId) {
                    const contract = await getContract(
                        userData.agencyId,
                        dealData.contract.contractId
                    );
                    if (contract) {
                        setContractId(contract.id!);
                        setPdfUrl(contract.originalFileUrl);
                        setFields(contract.fields || []);
                    }
                }
            } catch (err: any) {
                toast.error('Failed to load contract data');
            } finally {
                setLoading(false);
            }
        })();
    }, [dealId, userData?.agencyId, navigate]);

    // ── PDF Upload ─────────────────────────────────────────────────────────────
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userData?.agencyId || !dealId || !currentUser) return;
        if (file.type !== 'application/pdf') {
            toast.error('Please upload a PDF file');
            return;
        }

        try {
            setUploading(true);
            const { contractId: newId, pdfUrl: newUrl } = await createContractFromPDF(
                userData.agencyId,
                file,
                currentUser.uid,
                dealId
            );
            await linkContractToDeal(dealId, newId, newUrl);

            setContractId(newId);
            setPdfUrl(newUrl);
            setFields([]);
            toast.success('PDF uploaded successfully');
        } catch (err: any) {
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(false);
            // Reset input so the same file can be re-selected if needed
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Click on PDF canvas → record normalized position → show ContextMenu ───
    const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const relX  = e.clientX - rect.left;
        const relY  = e.clientY - rect.top;

        setPendingClick({
            x: relX / rect.width,
            y: relY / rect.height,
            screenX: relX,
            screenY: relY,
        });
    };

    // ── Add a field from the ContextMenu ──────────────────────────────────────
    const addField = (type: FieldType, role: FieldRole = 'client') => {
        if (!pendingClick) return;

        const newField: Field = {
            id: `field_${Date.now()}`,
            type,
            role,
            position: {
                // Center the field box on the click point
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

    // ── Drag stop → update normalized position ────────────────────────────────
    const handleDragStop = useCallback(
        (id: string, _e: DraggableEvent, data: DraggableData) => {
            setFields(prev =>
                prev.map(f => {
                    if (f.id !== id) return f;
                    return {
                        ...f,
                        position: {
                            ...f.position,
                            x: Math.max(0, Math.min(1 - f.position.width,  data.x / containerPx.w)),
                            y: Math.max(0, Math.min(1 - f.position.height, data.y / containerPx.h)),
                        },
                    };
                })
            );
        },
        [containerPx]
    );

    // ── Toggle field role ─────────────────────────────────────────────────────
    const toggleRole = (id: string) => {
        setFields(prev =>
            prev.map(f =>
                f.id === id
                    ? { ...f, role: f.role === 'agent' ? 'client' : 'agent' }
                    : f
            )
        );
    };

    // ── Delete field ──────────────────────────────────────────────────────────
    const deleteField = (id: string) => {
        setFields(prev => prev.filter(f => f.id !== id));
        delete nodeRefs.current[id];
    };

    // ── Save to Firestore ─────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!userData?.agencyId || !contractId) {
            toast.error('Upload a PDF first');
            return;
        }

        try {
            setSaving(true);
            await updateContractFields(userData.agencyId, contractId, fields);
            toast.success('Contract template saved');
        } catch (err: any) {
            toast.error(`Save failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen text-neutral-500">
                Loading...
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-neutral-100 overflow-hidden">
            {/* ── Toolbar ───────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-neutral-200 shadow-sm flex-shrink-0">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
                >
                    <ArrowLeft size={16} />
                    Back
                </button>

                <h1 className="text-base font-semibold text-neutral-800 truncate max-w-xs">
                    Contract Editor {dealId ? `— Deal ${dealId.slice(0, 6)}` : ''}
                </h1>

                <div className="flex items-center gap-2">
                    {/* Upload PDF */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-300 rounded-lg text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
                    >
                        <Upload size={14} />
                        {uploading ? 'Uploading…' : 'Upload PDF'}
                    </button>

                    {/* Save */}
                    <button
                        onClick={handleSave}
                        disabled={saving || !contractId}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                    >
                        <Save size={14} />
                        {saving ? 'Saving…' : 'Save Template'}
                    </button>
                </div>
            </div>

            {/* ── Legend ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-neutral-100 text-xs text-neutral-500 flex-shrink-0">
                <span className="font-medium text-neutral-700">Field types:</span>
                {(Object.entries(FIELD_META) as [FieldType, typeof FIELD_META[FieldType]][]).map(
                    ([type, meta]) => (
                        <span key={type} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${meta.color}`} />
                            {meta.label}
                        </span>
                    )
                )}
                <span className="ml-4 text-neutral-400">
                    Click on the document to place a field. Drag fields to reposition.
                </span>
            </div>

            {/* ── Main area ─────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto flex items-start justify-center p-6">
                {!pdfUrl ? (
                    /* Empty state — prompt upload */
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center w-full max-w-sm h-64 border-2 border-dashed border-neutral-300 rounded-xl cursor-pointer hover:border-neutral-400 transition-colors text-neutral-400"
                    >
                        <Upload size={32} className="mb-3" />
                        <p className="font-medium">Upload a PDF to get started</p>
                        <p className="text-sm mt-1">Click here to select a file</p>
                    </div>
                ) : (
                    /*
                     * ── Three-layer cake ─────────────────────────────────────
                     *
                     * Layer 1 (bottom) — PDF iframe
                     * Layer 2 (middle) — transparent click-catcher overlay
                     * Layer 3 (top)    — draggable field chips
                     *
                     * The container enforces A4 aspect ratio via padding-bottom
                     * trick so it scales responsively.
                     */
                    <div
                        className="relative bg-white shadow-xl"
                        style={{
                            // Responsive A4: width grows up to 595px, height follows ratio
                            width: '100%',
                            maxWidth: 595,
                            // padding-bottom aspect-ratio trick
                            paddingBottom: `${A4_RATIO * 100}%`,
                        }}
                    >
                        {/* Absolute wrapper fills the padding-bottom space */}
                        <div
                            ref={containerRef}
                            className="absolute inset-0"
                        >
                            {/* ── Layer 1: PDF ───────────────────────────────── */}
                            <iframe
                                src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                className="absolute inset-0 w-full h-full border-0 pointer-events-none"
                                title="Contract PDF"
                            />

                            {/* ── Layer 2: Click overlay ─────────────────────── */}
                            <div
                                className="absolute inset-0 cursor-crosshair"
                                style={{ zIndex: 10 }}
                                onClick={handleCanvasClick}
                            />

                            {/* ── Layer 3: Field chips ───────────────────────── */}
                            {fields.map(field => {
                                const meta = FIELD_META[field.type];
                                const nodeRef = getNodeRef(field.id);

                                // Convert normalized position → pixels for Draggable
                                const pxX = field.position.x * containerPx.w;
                                const pxY = field.position.y * containerPx.h;
                                const pxW = field.position.width  * containerPx.w;
                                const pxH = field.position.height * containerPx.h;

                                return (
                                    <Draggable
                                        key={field.id}
                                        nodeRef={nodeRef as React.RefObject<HTMLElement>}
                                        position={{ x: pxX, y: pxY }}
                                        bounds="parent"
                                        onStop={(e, data) => handleDragStop(field.id, e, data)}
                                    >
                                        <div
                                            ref={nodeRef}
                                            style={{
                                                position: 'absolute',
                                                left: 0,
                                                top: 0,
                                                width: pxW,
                                                height: pxH,
                                                zIndex: 20,
                                            }}
                                            className="group cursor-move"
                                        >
                                            {/* Field chip body */}
                                            <div
                                                className={`flex items-center gap-1 px-1.5 h-full rounded text-white text-[10px] font-medium shadow-md select-none ${meta.color} opacity-90`}
                                            >
                                                {meta.icon}
                                                <span className="truncate flex-1">{meta.label}</span>
                                                <span className="opacity-75 text-[9px]">
                                                    [{ROLE_LABELS[field.role]}]
                                                </span>
                                            </div>

                                            {/* Action buttons — visible on hover */}
                                            <div className="absolute -top-6 left-0 hidden group-hover:flex items-center gap-0.5 bg-white border border-neutral-200 rounded shadow-lg px-1 py-0.5">
                                                {/* Role toggle */}
                                                <button
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onClick={e => { e.stopPropagation(); toggleRole(field.id); }}
                                                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
                                                    title="Toggle role"
                                                >
                                                    <Users size={10} />
                                                    {ROLE_LABELS[field.role]}
                                                </button>

                                                {/* Delete */}
                                                <button
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onClick={e => { e.stopPropagation(); deleteField(field.id); }}
                                                    className="p-0.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    title="Delete field"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    </Draggable>
                                );
                            })}

                            {/* ── Context menu (field type picker) ──────────── */}
                            {pendingClick && (
                                <>
                                    {/* Backdrop to dismiss */}
                                    <div
                                        className="absolute inset-0"
                                        style={{ zIndex: 30 }}
                                        onClick={() => setPendingClick(null)}
                                    />

                                    <div
                                        className="absolute bg-white rounded-xl shadow-2xl border border-neutral-200 p-2 min-w-[160px]"
                                        style={{
                                            left: pendingClick.screenX + 8,
                                            top: pendingClick.screenY + 8,
                                            zIndex: 31,
                                        }}
                                    >
                                        <p className="text-[10px] text-neutral-400 px-2 mb-1 font-medium uppercase tracking-wide">
                                            Add field
                                        </p>

                                        {(Object.entries(FIELD_META) as [FieldType, typeof FIELD_META[FieldType]][]).map(
                                            ([type, meta]) => (
                                                <button
                                                    key={type}
                                                    onClick={() => addField(type)}
                                                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                                                >
                                                    <span className={`w-5 h-5 rounded flex items-center justify-center text-white ${meta.color}`}>
                                                        {meta.icon}
                                                    </span>
                                                    {meta.label}
                                                </button>
                                            )
                                        )}

                                        <div className="border-t border-neutral-100 mt-1 pt-1">
                                            <p className="text-[10px] text-neutral-400 px-2 mb-1">Role</p>
                                            <div className="flex gap-1 px-1">
                                                {(['client', 'agent'] as FieldRole[]).map(role => (
                                                    <button
                                                        key={role}
                                                        onClick={() => {
                                                            // Re-opens with a role pre-selected
                                                            // by immediately placing with that role
                                                            const lastType = 'signature' as FieldType;
                                                            addField(lastType, role);
                                                        }}
                                                        className="flex-1 text-[11px] py-1 rounded border border-neutral-200 hover:bg-neutral-50 capitalize"
                                                    >
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

            {/* ── Footer: field count ──────────────────────────────────────── */}
            <div className="px-4 py-2 bg-white border-t border-neutral-100 text-xs text-neutral-400 flex-shrink-0">
                {fields.length} field{fields.length !== 1 ? 's' : ''} placed
                {contractId && (
                    <span className="ml-3 text-neutral-300">Contract: {contractId}</span>
                )}
            </div>
        </div>
    );
}
