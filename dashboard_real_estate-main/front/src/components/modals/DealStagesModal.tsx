import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Tag, Save, ArrowUp, ArrowDown } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { CustomDealStage } from '../../types';

interface DealStagesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const COLOR_PRESETS = [
    { id: 'sky', label: 'תכלת', color: 'text-sky-700', bg: 'bg-sky-100', border: 'border-sky-200', headerBg: 'bg-sky-50' },
    { id: 'amber', label: 'כתום', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200', headerBg: 'bg-amber-50' },
    { id: 'rose', label: 'אדום', color: 'text-rose-700', bg: 'bg-rose-100', border: 'border-rose-200', headerBg: 'bg-rose-50' },
    { id: 'indigo', label: 'אינדיגו', color: 'text-indigo-700', bg: 'bg-indigo-100', border: 'border-indigo-200', headerBg: 'bg-indigo-50' },
    { id: 'teal', label: 'טורקיז', color: 'text-teal-700', bg: 'bg-teal-100', border: 'border-teal-200', headerBg: 'bg-teal-50' },
    { id: 'purple', label: 'סגול', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200', headerBg: 'bg-purple-50' },
    { id: 'slate', label: 'אפור', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-200', headerBg: 'bg-slate-50' },
];

export default function DealStagesModal({ isOpen, onClose }: DealStagesModalProps) {
    const { userData } = useAuth();
    const { agencySettings } = useLiveDashboardData();

    const [stages, setStages] = useState<CustomDealStage[]>([]);
    const [newStageLabel, setNewStageLabel] = useState('');
    const [newStageColor, setNewStageColor] = useState(COLOR_PRESETS[0]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (agencySettings?.customDealStages) {
            setStages(agencySettings.customDealStages);
        }
    }, [agencySettings?.customDealStages]);

    if (!isOpen) return null;

    const handleAddStage = () => {
        if (!newStageLabel.trim()) return;

        const newStage: CustomDealStage = {
            id: `stage_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
            label: newStageLabel.trim(),
            color: newStageColor.color,
            bg: newStageColor.bg,
            border: newStageColor.border,
            headerBg: newStageColor.headerBg
        };

        setStages([...stages, newStage]);
        setNewStageLabel('');
    };

    const handleRemoveStage = (idToRemove: string) => {
        setStages(stages.filter(s => s.id !== idToRemove));
    };

    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        const newStages = [...stages];
        const temp = newStages[index - 1];
        newStages[index - 1] = newStages[index];
        newStages[index] = temp;
        setStages(newStages);
    };

    const handleMoveDown = (index: number) => {
        if (index === stages.length - 1) return;
        const newStages = [...stages];
        const temp = newStages[index + 1];
        newStages[index + 1] = newStages[index];
        newStages[index] = temp;
        setStages(newStages);
    };

    const handleSave = async () => {
        if (!userData?.agencyId) return;
        setIsSaving(true);
        try {
            const agencyRef = doc(db, 'agencies', userData.agencyId);
            await updateDoc(agencyRef, {
                'settings.customDealStages': stages
            });
            onClose();
        } catch (error) {
            console.error('Failed to save custom stages:', error);
            alert('אירעה שגיאה בשמירת הסטטוסים. נסה שוב.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" dir="rtl">
            <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">הגדרות שלבי עסקה</h2>
                        <p className="text-sm text-slate-500 mt-1">נהל את השלבים המותאמים אישית בלוח העסקאות (עד 3)</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 rounded-full transition-colors shadow-sm"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">שלב סגירה (קבוע)</label>
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-100 opacity-80 cursor-not-allowed">
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                                <Tag size={16} className="text-emerald-700" />
                            </div>
                            <span className="font-bold text-emerald-700">נסגר בהצלחה</span>
                            <span className="mr-auto text-xs font-medium text-slate-500">שלב חובה בסוף התהליך</span>
                        </div>
                    </div>
                    {/* Custom Stages List */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-semibold text-slate-700">שלבי הפייפליין שלכם</label>
                            <span className="text-xs font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-600">
                                {stages.length} שלבים
                            </span>
                        </div>



                        <div className="space-y-2">
                            {stages.length === 0 ? (
                                <div className="text-center py-6 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
                                    <p className="text-sm text-slate-500 font-medium">לא הוגדרו שלבים. אנא הוסף לפחות שלב אחד.</p>
                                </div>
                            ) : (
                                stages.map((stage, index) => (
                                    <div key={stage.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${stage.border} ${stage.bg}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col gap-0.5 ml-1">
                                                <button
                                                    onClick={() => handleMoveUp(index)}
                                                    disabled={index === 0}
                                                    className="text-slate-400 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                                >
                                                    <ArrowUp size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleMoveDown(index)}
                                                    disabled={index === stages.length - 1}
                                                    className="text-slate-400 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                                                >
                                                    <ArrowDown size={14} />
                                                </button>
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                                                <Tag size={16} className={stage.color} />
                                            </div>
                                            <span className={`font-bold ${stage.color}`}>{stage.label}</span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveStage(stage.id)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors"
                                            title="מחק שלב"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Add New Stage Form */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                            <Plus size={16} className="text-blue-600" />
                            הוסף שלב חדש
                        </h4>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">שם השלב</label>
                                <input
                                    type="text"
                                    value={newStageLabel}
                                    onChange={(e) => setNewStageLabel(e.target.value)}
                                    placeholder="לדוגמה: תיאום ציפיות"
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none bg-white text-slate-900"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1.5">צבע אפיון</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_PRESETS.map(preset => (
                                        <button
                                            key={preset.id}
                                            onClick={() => setNewStageColor(preset)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${newStageColor.id === preset.id
                                                ? `${preset.bg} ${preset.border} ${preset.color} ring-2 ring-offset-1 ring-${preset.color.split('-')[1]}-500`
                                                : `bg-white border-slate-200 text-slate-600 hover:bg-slate-50`
                                                }`}
                                        >
                                            <div className={`w-2.5 h-2.5 rounded-full ${preset.color.replace('text', 'bg')}`} />
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleAddStage}
                                disabled={!newStageLabel.trim()}
                                className="w-full mt-2 py-2.5 flex items-center justify-center gap-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                הוסף לרשימה
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                        ביטול
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-2 shadow-sm shadow-blue-600/30 disabled:opacity-70"
                    >
                        {isSaving ? 'שומר...' : (
                            <>
                                <Save size={16} />
                                שמור שינויים
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
