import React, { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { TemplateField } from '../../types';
import { X, RotateCcw } from 'lucide-react';

interface DynamicContractRendererProps {
    taggedText: string;
    fieldsMetadata: TemplateField[];
    values: Record<string, string>;
    onChange: (fieldId: string, value: string) => void;
    userRole: 'agent' | 'client';
    readOnly?: boolean;
    logoUrl?: string;
}

type TextSegment = { type: 'text'; content: string };
type FieldSegment = { type: 'field'; id: string };
type Segment = TextSegment | FieldSegment;

function parseTaggedText(taggedText: string): Segment[] {
    const FIELD_PATTERN = /(\{\{[a-z0-9_]+\}\})/g;
    const parts = taggedText.split(FIELD_PATTERN);

    return parts.map((part) => {
        const match = part.match(/^\{\{([a-z0-9_]+)\}\}$/);
        if (match) {
            return { type: 'field', id: match[1] };
        }
        return { type: 'text', content: part };
    });
}

function SignatureInlineInput({
    fieldId,
    value,
    label,
    isEditable,
    onChange
}: {
    fieldId: string;
    value: string;
    label: string;
    isEditable: boolean;
    onChange: (fieldId: string, value: string) => void;
}) {
    const [showModal, setShowModal] = useState(false);
    const sigCanvasRef = useRef<SignatureCanvas>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 400, height: 256 });

    const handleSignatureConfirm = () => {
        if (!sigCanvasRef.current) return;
        const canvas = sigCanvasRef.current.getTrimmedCanvas();
        if (canvas.width === 0 || canvas.height === 0) {
            alert('נא לחתום לפני העלאה');
            return;
        }
        const dataUrl = canvas.toDataURL('image/png');
        onChange(fieldId, dataUrl);
        setShowModal(false);
    };

    const handleClear = () => {
        sigCanvasRef.current?.clear();
    };

    const handleUndo = () => {
        const canvas = sigCanvasRef.current;
        if (!canvas) return;
        const data = canvas.toData();
        data.pop();
        canvas.fromData(data);
    };

    if (!isEditable) {
        if (value) {
            return (
                <img
                    src={value}
                    alt="חתימה"
                    className="inline-block mx-1 max-h-12 max-w-32 align-text-bottom border border-slate-300 rounded"
                />
            );
        }
        return (
            <span className="inline-block mx-1 px-2 py-0.5 border border-slate-200 bg-slate-50 text-slate-500 text-xs rounded">
                [חתימה לא חתומה]
            </span>
        );
    }

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="inline-block mx-1 px-3 py-1 border-2 border-dashed border-blue-400 bg-blue-50 text-blue-700 text-xs font-medium rounded cursor-pointer hover:bg-blue-100 transition-colors"
                type="button"
            >
                {value ? '✓ חתום' : '👆 הקלק לחתימה'}
            </button>

            {showModal && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-slate-900">{label}</h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                                type="button"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="border-2 border-slate-300 rounded-lg overflow-hidden mb-4 bg-white">
                            <SignatureCanvas
                                ref={sigCanvasRef}
                                penColor="black"
                                canvasProps={{
                                    width: canvasSize.width,
                                    height: canvasSize.height,
                                    className:
                                        'cursor-crosshair w-full h-full touch-none block bg-white'
                                }}
                            />
                        </div>

                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={handleUndo}
                                className="flex-1 px-3 py-2 border border-slate-300 bg-slate-50 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
                                type="button"
                            >
                                <RotateCcw size={16} className="inline mr-1" />
                                בטל
                            </button>
                            <button
                                onClick={handleClear}
                                className="flex-1 px-3 py-2 border border-red-300 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                                type="button"
                            >
                                מחק הכל
                            </button>
                        </div>

                        <button
                            onClick={handleSignatureConfirm}
                            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                            type="button"
                        >
                            אישור חתימה
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export default function DynamicContractRenderer({
    taggedText,
    fieldsMetadata,
    values,
    onChange,
    userRole,
    readOnly = false,
    logoUrl
}: DynamicContractRendererProps) {
    const segments = parseTaggedText(taggedText);

    return (
        <div
            dir="rtl"
            className="font-serif text-sm leading-8 text-slate-900"
            style={{ textAlign: 'justify', whiteSpace: 'pre-wrap' }}
        >
            {logoUrl && (
                <div className="flex justify-start mb-8 border-b pb-4">
                    <img src={logoUrl} alt="Agency Logo" className="max-h-16 object-contain" />
                </div>
            )}
            {segments.map((segment, index) => {
                if (segment.type === 'text') {
                    return <span key={`text-${index}`}>{segment.content}</span>;
                }

                const fieldId = segment.id;
                const meta = fieldsMetadata.find((f) => f.id === fieldId);

                if (!meta) {
                    return (
                        <span key={fieldId} className="text-red-400 bg-red-50 px-1 rounded">
                            [?]
                        </span>
                    );
                }

                const isEditable = !readOnly && meta.role === userRole;
                const value = values[fieldId] ?? '';

                if (meta.type === 'signature') {
                    return (
                        <SignatureInlineInput
                            key={fieldId}
                            fieldId={fieldId}
                            value={value}
                            label={meta.label}
                            isEditable={isEditable}
                            onChange={onChange}
                        />
                    );
                }

                return (
                    <input
                        key={fieldId}
                        type={meta.type === 'date' ? 'date' : 'text'}
                        value={value}
                        placeholder={meta.label}
                        disabled={!isEditable}
                        onChange={(e) => onChange(fieldId, e.target.value)}
                        className={`
                            inline-block mx-1 px-2 py-0.5 rounded border text-sm
                            min-w-[100px] max-w-[200px] text-center
                            align-text-bottom
                            ${
                                isEditable
                                    ? 'border-blue-400 bg-blue-50 focus:outline-none focus:ring-2 ring-blue-400 focus:ring-opacity-40'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 cursor-not-allowed'
                            }
                            ${!value && isEditable ? 'animate-pulse border-dashed' : ''}
                        `}
                    />
                );
            })}
        </div>
    );
}
