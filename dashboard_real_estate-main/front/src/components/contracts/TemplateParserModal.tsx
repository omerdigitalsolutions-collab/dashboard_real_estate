import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { TemplateField } from '../../types';
import { X, Loader2 } from 'lucide-react';
import DynamicContractRenderer from './DynamicContractRenderer';
import toast from 'react-hot-toast';

type Step = 'input' | 'reviewing' | 'saving';

interface TemplateParserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        title: string;
        rawText: string;
        taggedText: string;
        fieldsMetadata: TemplateField[];
    }) => Promise<void>;
}

const parseContractTextFn = httpsCallable<
    { rawText: string },
    { taggedText: string; fieldsMetadata: TemplateField[] }
>(functions, 'ai-parseContractText');

export default function TemplateParserModal({
    isOpen,
    onClose,
    onSave
}: TemplateParserModalProps) {
    const [step, setStep] = useState<Step>('input');

    const [title, setTitle] = useState('');
    const [rawText, setRawText] = useState('');
    const [taggedText, setTaggedText] = useState('');
    const [fieldsMetadata, setFieldsMetadata] = useState<TemplateField[]>([]);
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleParse = async () => {
        if (!title.trim()) {
            toast.error('נא להזין שם לתבנית');
            return;
        }
        if (!rawText.trim()) {
            toast.error('נא להדביק את טקסט החוזה');
            return;
        }

        try {
            setParsing(true);
            const result = await parseContractTextFn({ rawText });
            setTaggedText(result.data.taggedText);
            setFieldsMetadata(result.data.fieldsMetadata);
            setStep('reviewing');
            toast.success('החוזה נותח בהצלחה');
        } catch (err: any) {
            console.error('[TemplateParserModal] Parse error:', err);
            toast.error('שגיאה בניתוח החוזה: ' + (err.message || 'Unknown error'));
        } finally {
            setParsing(false);
        }
    };

    const handleFieldChange = (index: number, updates: Partial<TemplateField>) => {
        const updated = [...fieldsMetadata];
        updated[index] = { ...updated[index], ...updates };
        setFieldsMetadata(updated);
    };

    const handleSaveTemplate = async () => {
        try {
            setSaving(true);
            await onSave({
                title,
                rawText,
                taggedText,
                fieldsMetadata
            });
            toast.success('התבנית נשמרה בהצלחה');
            onClose();
        } catch (err: any) {
            console.error('[TemplateParserModal] Save error:', err);
            toast.error('שגיאה בשמירת התבנית: ' + (err.message || 'Unknown error'));
        } finally {
            setSaving(false);
        }
    };

    const resetModal = () => {
        setStep('input');
        setTitle('');
        setRawText('');
        setTaggedText('');
        setFieldsMetadata([]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <h2 className="text-lg font-semibold text-slate-900">
                        {step === 'input' && 'הנח תבנית חוזה חדשה'}
                        {step === 'reviewing' && 'בדוק את שדות החוזה'}
                        {step === 'saving' && 'שומר תבנית...'}
                    </h2>
                    <button
                        onClick={() => {
                            resetModal();
                            onClose();
                        }}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        type="button"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'input' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-600 mb-2">
                                    שם התבנית
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="לדוגמה: חוזה קנייה סטנדרטי"
                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-slate-50"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-600 mb-2">
                                    טקסט החוזה (העתק ממסמך Word)
                                </label>
                                <textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder="הדביק את טקסט החוזה כאן..."
                                    rows={12}
                                    dir="rtl"
                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-slate-50 font-mono"
                                />
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                                <p className="font-medium mb-2">💡 טיפים:</p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>ה-AI יזהה שדות ריקים כמו קווים תחתיים (_____)</li>
                                    <li>סימנים בסוגריים כמו [שם] או &lt;&lt;תאריך&gt;&gt;</li>
                                    <li>יוכל לעדכן את שמות השדות לאחר הניתוח</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {step === 'reviewing' && (
                        <div className="grid grid-cols-2 gap-6 h-full">
                            {/* Left: Fields editor */}
                            <div className="border-l border-slate-200 pl-4 overflow-y-auto">
                                <h3 className="text-sm font-semibold text-slate-700 mb-4 sticky top-0 bg-white pb-2">
                                    שדות ({fieldsMetadata.length})
                                </h3>
                                <div className="space-y-4">
                                    {fieldsMetadata.map((field, idx) => (
                                        <div
                                            key={field.id}
                                            className="border border-slate-200 rounded-lg p-3 bg-slate-50"
                                        >
                                            <div className="mb-2">
                                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                                    שם
                                                </label>
                                                <input
                                                    type="text"
                                                    value={field.label}
                                                    onChange={(e) =>
                                                        handleFieldChange(idx, { label: e.target.value })
                                                    }
                                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                                        סוג
                                                    </label>
                                                    <select
                                                        value={field.type}
                                                        onChange={(e) =>
                                                            handleFieldChange(idx, {
                                                                type: e.target.value as any
                                                            })
                                                        }
                                                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                    >
                                                        <option value="text">טקסט</option>
                                                        <option value="date">תאריך</option>
                                                        <option value="signature">חתימה</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                                        תפקיד
                                                    </label>
                                                    <select
                                                        value={field.role}
                                                        onChange={(e) =>
                                                            handleFieldChange(idx, { role: e.target.value as any })
                                                        }
                                                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                    >
                                                        <option value="agent">סוכן</option>
                                                        <option value="client">קלט</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <label className="flex items-center gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={field.required ?? false}
                                                    onChange={(e) =>
                                                        handleFieldChange(idx, { required: e.target.checked })
                                                    }
                                                />
                                                <span className="text-slate-700">שדה חובה</span>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Preview */}
                            <div className="border border-slate-200 rounded-lg p-4 overflow-y-auto bg-slate-50">
                                <h3 className="text-sm font-semibold text-slate-700 mb-4">תצוגה מקדימה</h3>
                                <div className="bg-white p-4 rounded border border-slate-200">
                                    <DynamicContractRenderer
                                        taggedText={taggedText}
                                        fieldsMetadata={fieldsMetadata}
                                        values={{}}
                                        onChange={() => {}}
                                        userRole="agent"
                                        readOnly={true}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'saving' && (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <Loader2 className="inline-block animate-spin text-blue-600 mb-4" size={32} />
                                <p className="text-slate-600">שומר תבנית...</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 px-6 py-4 flex gap-3 justify-end bg-slate-50">
                    {step === 'input' && (
                        <>
                            <button
                                onClick={() => {
                                    resetModal();
                                    onClose();
                                }}
                                className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                                type="button"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={handleParse}
                                disabled={parsing || !title.trim() || !rawText.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                type="button"
                            >
                                {parsing && <Loader2 size={16} className="animate-spin" />}
                                בדוק עם AI
                            </button>
                        </>
                    )}

                    {step === 'reviewing' && (
                        <>
                            <button
                                onClick={() => setStep('input')}
                                className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                                type="button"
                            >
                                חזור
                            </button>
                            <button
                                onClick={handleSaveTemplate}
                                disabled={saving}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                type="button"
                            >
                                {saving && <Loader2 size={16} className="animate-spin" />}
                                שמור תבנית
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
