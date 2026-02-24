import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, Save, Trash2, Plus, MessageSquare } from 'lucide-react';
import { Lead } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { sendWhatsAppWebhook } from '../../utils/webhookClient';
import { updateUserWhatsAppTemplates } from '../../services/userService';

interface BulkWhatsAppModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedLeads: Lead[];
    onSuccess: () => void;
}

export default function BulkWhatsAppModal({ isOpen, onClose, selectedLeads, onSuccess }: BulkWhatsAppModalProps) {
    const { userData } = useAuth();

    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);

    // Templates logic
    const templates = userData?.whatsappTemplates || [];
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [showTemplateForm, setShowTemplateForm] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setMessage('');
            setShowTemplateForm(false);
            setNewTemplateName('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!message.trim()) return;
        setSending(true);

        const selectedLeadsPayload = selectedLeads.map(l => ({ phone: l.phone, name: l.name }));

        try {
            const success = await sendWhatsAppWebhook({
                action: 'bulk_broadcast',
                message: message.trim(),
                leads: selectedLeadsPayload
            });

            if (success) {
                onSuccess();
                onClose();
            } else {
                alert('שגיאה בשליחת הודעות ווטסאפ');
            }
        } catch (e) {
            console.error(e);
            alert('שגיאה בשליחת הודעות ווטסאפ');
        } finally {
            setSending(false);
        }
    };

    const insertNamePlaceholder = () => {
        setMessage(prev => prev + ' {{שם_לקוח}} ');
    };

    const handleSaveTemplate = async () => {
        if (!userData || !userData.id) return;
        if (!newTemplateName.trim() || !message.trim()) return;

        if (templates.length >= 5) {
            alert('ניתן לשמור עד 5 תבניות. מחק תבנית קיימת כדי לשמור חדשה.');
            return;
        }

        setIsSavingTemplate(true);
        const newTemplate = {
            id: Date.now().toString(),
            name: newTemplateName.trim(),
            content: message.trim()
        };

        const updatedTemplates = [...templates, newTemplate];

        try {
            await updateUserWhatsAppTemplates(userData.id, updatedTemplates);
            setShowTemplateForm(false);
            setNewTemplateName('');
        } catch (e) {
            console.error(e);
            alert('שגיאה בשמירת התבנית');
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleDeleteTemplate = async (templateId: string) => {
        if (!userData || !userData.id) return;
        const updatedTemplates = templates.filter(t => t.id !== templateId);
        try {
            await updateUserWhatsAppTemplates(userData.id, updatedTemplates);
        } catch (e) {
            console.error(e);
            alert('שגיאה במחיקת התבנית');
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col" dir="rtl">

                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-emerald-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex flex-col items-center justify-center text-emerald-600">
                            <MessageSquare size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">שליחת הודעת ווטסאפ</h2>
                            <p className="text-sm text-emerald-700 font-medium">שליחה ל-{selectedLeads.length} לידים נבחרים</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row h-full">
                    {/* Templates Sidebar */}
                    <div className="w-full md:w-64 bg-slate-50 border-l border-slate-100 p-4 flex flex-col">
                        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center justify-between">
                            תבניות שמורות ({templates.length}/5)
                        </h3>

                        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                            {templates.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-4">אין תבניות שמורות</p>
                            ) : (
                                templates.map(t => (
                                    <div key={t.id} className="group flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2.5 hover:border-emerald-300 transition-colors cursor-pointer" onClick={() => setMessage(t.content)}>
                                        <span className="text-sm font-medium text-slate-700 truncate ml-2">{t.name}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }}
                                            className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="מחק תבנית"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {showTemplateForm ? (
                            <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-sm space-y-3">
                                <label className="block text-xs font-semibold text-slate-600">שם התבנית:</label>
                                <input
                                    value={newTemplateName}
                                    onChange={e => setNewTemplateName(e.target.value)}
                                    placeholder="לדוגמה: דירה חדשה בנתניה"
                                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                    maxLength={30}
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveTemplate}
                                        disabled={!newTemplateName.trim() || !message.trim() || isSavingTemplate}
                                        className="flex-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-bold py-2 rounded-lg transition-colors flex justify-center disabled:opacity-50"
                                    >
                                        שמור
                                    </button>
                                    <button
                                        onClick={() => { setShowTemplateForm(false); setNewTemplateName(''); }}
                                        className="flex-1 bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold py-2 rounded-lg transition-colors"
                                    >
                                        ביטול
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowTemplateForm(true)}
                                disabled={templates.length >= 5 || !message.trim()}
                                className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-emerald-300 text-emerald-600 hover:bg-emerald-50 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={!message.trim() ? 'כתוב הודעה כדי לשמור תבנית' : ''}
                            >
                                <Plus size={14} />
                                שמר הודעה נוכחית
                            </button>
                        )}
                        <p className="text-[10px] text-slate-400 mt-2 text-center">תוכל לשמור עד 5 תבניות לשימוש חוזר בהמשך</p>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 p-6 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-bold text-slate-700">תוכן ההודעה:</label>
                            <button
                                onClick={insertNamePlaceholder}
                                className="text-xs font-semibold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                            >
                                <Plus size={12} />
                                הוסף שם לקוח בגוף ההודעה
                            </button>
                        </div>

                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="הקלד כאן את תוכן ההודעה שתשלח לכולם..."
                            className="w-full h-48 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none leading-relaxed"
                            dir="auto"
                        />

                        <div className="mt-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
                            <p className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono text-[10px]">{"{{שם_לקוח}}"}</span>
                                = המערכת תחליף טקסט זה בשם של כל אחד מהלידים באופן אוטומטי.
                            </p>
                        </div>

                        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={sending || !message.trim()}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-emerald-600/20"
                            >
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                {sending ? 'שולח...' : 'שגר הודעות'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
