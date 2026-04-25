import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getLiveTemplates, createTemplate, deleteTemplate } from '../services/contractTemplateService';
import TemplateParserModal from '../components/contracts/TemplateParserModal';
import { ContractTemplate, TemplateField } from '../types';
import { Sparkles, Trash2, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

type ContractTemplateWithId = ContractTemplate & { id: string };

export default function ContractTemplates() {
    const { userData } = useAuth();
    const [templates, setTemplates] = useState<ContractTemplateWithId[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        if (!userData?.agencyId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const unsubscribe = getLiveTemplates(
            userData.agencyId,
            (templates) => {
                setTemplates(templates);
                setLoading(false);
            },
            (err) => {
                console.error('[ContractTemplates] Error fetching templates:', err);
                toast.error('שגיאה בטעינת התבניות');
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [userData?.agencyId]);

    const handleSaveTemplate = async (data: {
        title: string;
        rawText: string;
        taggedText: string;
        fieldsMetadata: TemplateField[];
    }) => {
        if (!userData?.agencyId) {
            toast.error('לא זוהה סוכנות');
            return;
        }

        try {
            await createTemplate(userData.agencyId, data, userData.uid);
            setShowModal(false);
        } catch (err: any) {
            console.error('[ContractTemplates] Save error:', err);
            toast.error('שגיאה בשמירת התבנית');
            throw err;
        }
    };

    const handleDeleteTemplate = async (templateId: string) => {
        if (!userData?.agencyId) return;

        if (!window.confirm('האם אתה בטוח שברצונך למחוק תבנית זו?')) {
            return;
        }

        try {
            setDeleting(templateId);
            await deleteTemplate(userData.agencyId, templateId);
            toast.success('התבנית נמחקה');
        } catch (err: any) {
            console.error('[ContractTemplates] Delete error:', err);
            toast.error('שגיאה במחיקת התבנית');
        } finally {
            setDeleting(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <Loader2 className="animate-spin text-blue-600" size={32} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                            <Sparkles className="text-purple-600" size={32} />
                            תבניות חוזה AI
                        </h1>
                        <p className="text-slate-600 mt-2">
                            {templates.length === 0
                                ? 'אין תבניות עדיין'
                                : `${templates.length} תבנית${templates.length > 1 ? 'ות' : ''}`}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={20} />
                        צור תבנית חדשה
                    </button>
                </div>

                {/* Template Modal */}
                <TemplateParserModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    onSave={handleSaveTemplate}
                />

                {/* Template List */}
                {templates.length === 0 ? (
                    <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center">
                        <Sparkles className="mx-auto text-slate-300 mb-4" size={48} />
                        <p className="text-slate-600 text-lg font-medium mb-2">אין תבניות עדיין</p>
                        <p className="text-slate-500 mb-6">צור תבנית ראשונה על ידי הדבקת טקסט חוזה</p>
                        <button
                            onClick={() => setShowModal(true)}
                            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                        >
                            <Plus size={18} />
                            צור תבנית
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {templates.map((template) => (
                            <div
                                key={template.id}
                                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                            {template.title}
                                        </h3>
                                        <p className="text-sm text-slate-600 mb-3">
                                            {template.fieldsMetadata.length} שדות •{' '}
                                            {new Date(template.createdAt.toDate()).toLocaleDateString('he-IL')}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {template.fieldsMetadata.slice(0, 5).map((field) => (
                                                <span
                                                    key={field.id}
                                                    className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-medium"
                                                >
                                                    {field.label}
                                                </span>
                                            ))}
                                            {template.fieldsMetadata.length > 5 && (
                                                <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 text-xs rounded-full font-medium">
                                                    +{template.fieldsMetadata.length - 5} עוד
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        <button
                                            onClick={() => handleDeleteTemplate(template.id)}
                                            disabled={deleting === template.id}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            type="button"
                                        >
                                            {deleting === template.id ? (
                                                <Loader2 size={20} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={20} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
