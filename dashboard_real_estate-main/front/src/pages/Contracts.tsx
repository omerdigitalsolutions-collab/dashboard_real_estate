import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText,
    PenTool,
    CheckCircle,
    Clock,
    Link2,
    ExternalLink,
    Loader2,
    AlertCircle,
    Search,
    History,
    Sparkles,
    Trash2,
    Plus,
    Upload,
    GitMerge,
    Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getLiveContracts } from '../services/contractService';
import { getLiveTemplates, createTemplate, deleteTemplate } from '../services/contractTemplateService';
import { getLiveInstances } from '../services/contractInstanceService';
import { Contract, ContractTemplate, ContractInstance, TemplateField } from '../types';
import TemplateParserModal from '../components/contracts/TemplateParserModal';
import AssignToDealModal from '../components/contracts/AssignToDealModal';

// ─── Types ─────────────────────────────────────────────────────────────────────
type ContractWithId = Contract & { id: string };
type ContractTemplateWithId = ContractTemplate & { id: string };
type ContractInstanceWithId = ContractInstance & { id: string };
type ActiveTab = 'templates' | 'active';

// ─── Status configs ────────────────────────────────────────────────────────────
const INSTANCE_STATUS: Record<string, { label: string; icon: React.ReactNode; chip: string }> = {
    draft:  { label: 'טיוטה',  icon: <Clock size={12} />,       chip: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    sent:   { label: 'נשלח',   icon: <PenTool size={12} />,     chip: 'bg-blue-100 text-blue-700 border-blue-200' },
    signed: { label: 'נחתם',   icon: <CheckCircle size={12} />, chip: 'bg-green-100 text-green-700 border-green-200' },
    default:{ label: 'לא ידוע',icon: <AlertCircle size={12} />, chip: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const PDF_STATUS: Record<string, { label: string; icon: React.ReactNode; chip: string }> = {
    draft:     { label: 'טיוטה', icon: <Clock size={12} />,       chip: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    active:    { label: 'פעיל',  icon: <PenTool size={12} />,     chip: 'bg-blue-100 text-blue-700 border-blue-200' },
    completed: { label: 'נחתם',  icon: <CheckCircle size={12} />, chip: 'bg-green-100 text-green-700 border-green-200' },
    default:   { label: 'לא ידוע',icon:<AlertCircle size={12} />, chip: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function statusMeta(map: typeof INSTANCE_STATUS, status: string) {
    return map[status] ?? map.default;
}

function formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function Contracts() {
    const navigate = useNavigate();
    const { userData } = useAuth();

    const [activeTab, setActiveTab] = useState<ActiveTab>('templates');
    const [search, setSearch] = useState('');

    // Tab 1 — Templates
    const [templates, setTemplates] = useState<ContractTemplateWithId[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(true);
    const [showParserModal, setShowParserModal] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [assignTemplate, setAssignTemplate] = useState<ContractTemplateWithId | null>(null);

    // Tab 2 — Active contracts (instances + PDF contracts)
    const [instances, setInstances] = useState<ContractInstanceWithId[]>([]);
    const [pdfContracts, setPdfContracts] = useState<ContractWithId[]>([]);
    const [activeLoading, setActiveLoading] = useState(true);

    // ── Live listeners ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!userData?.agencyId) return;

        let mounted = true;
        // Track per-listener readiness via refs so closures always read current values
        const done = { instances: false, pdf: false };
        const checkDone = () => {
            if (mounted && done.instances && done.pdf) setActiveLoading(false);
        };

        const unsubTemplates = getLiveTemplates(
            userData.agencyId,
            (data) => { if (mounted) { setTemplates(data); setTemplatesLoading(false); } },
            () => { if (mounted) setTemplatesLoading(false); }
        );

        const unsubInstances = getLiveInstances(
            userData.agencyId,
            (data) => { if (mounted) { setInstances(data); done.instances = true; checkDone(); } },
            () => { if (mounted) { done.instances = true; checkDone(); } }
        );

        const unsubPdf = getLiveContracts(
            userData.agencyId,
            (data) => { if (mounted) { setPdfContracts(data); done.pdf = true; checkDone(); } },
            () => { if (mounted) { done.pdf = true; checkDone(); } }
        );

        return () => {
            mounted = false;
            unsubTemplates();
            unsubInstances();
            unsubPdf();
        };
    }, [userData?.agencyId]);

    // ── Template handlers ───────────────────────────────────────────────────────
    const handleSaveTemplate = async (data: {
        title: string;
        rawText: string;
        taggedText: string;
        fieldsMetadata: TemplateField[];
    }) => {
        if (!userData?.agencyId) return;
        try {
            await createTemplate(userData.agencyId, data, userData.uid!);
            setShowParserModal(false);
            toast.success('התבנית נשמרה בהצלחה');
        } catch {
            toast.error('שגיאה בשמירת התבנית');
            throw new Error('save failed');
        }
    };

    const handleDeleteTemplate = async (templateId: string) => {
        if (!userData?.agencyId) return;
        if (!window.confirm('האם אתה בטוח שברצונך למחוק תבנית זו?')) return;
        try {
            setDeleting(templateId);
            await deleteTemplate(userData.agencyId, templateId);
            toast.success('התבנית נמחקה');
        } catch {
            toast.error('שגיאה במחיקת התבנית');
        } finally {
            setDeleting(null);
        }
    };

    // ── Active contract handlers ─────────────────────────────────────────────────
    const copySigningLink = (contractId: string) => {
        const url = `${window.location.origin}/sign/${userData?.agencyId}/${contractId}`;
        navigator.clipboard.writeText(url)
            .then(() => toast.success('קישור חתימה הועתק ללוח'))
            .catch(() => toast.error('לא ניתן להעתיק את הקישור'));
    };

    const copyInstanceSigningLink = (instanceId: string) => {
        const url = `${window.location.origin}/sign-instance/${userData?.agencyId}/${instanceId}`;
        navigator.clipboard.writeText(url)
            .then(() => toast.success('קישור חתימה הועתק ללוח'))
            .catch(() => toast.error('לא ניתן להעתיק את הקישור'));
    };

    // ── Filtered lists ──────────────────────────────────────────────────────────
    const q = search.trim().toLowerCase();

    const filteredTemplates = q
        ? templates.filter(t => t.title.toLowerCase().includes(q))
        : templates;

    const filteredInstances = q
        ? instances.filter(i =>
            i.id.toLowerCase().includes(q) ||
            i.dealId?.toLowerCase().includes(q) ||
            i.status?.toLowerCase().includes(q))
        : instances;

    const filteredPdf = q
        ? pdfContracts.filter(c =>
            c.id.toLowerCase().includes(q) ||
            c.dealId?.toLowerCase().includes(q) ||
            c.status?.toLowerCase().includes(q))
        : pdfContracts;

    const activeCount = filteredInstances.length + filteredPdf.length;

    // ──────────────────────────────────────────────────────────────────────────
    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6" dir="rtl">

            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">חוזים</h1>
                <p className="text-sm text-slate-500 mt-0.5">ניהול תבניות, שיוך לעסקאות וחתימות דיגיטליות</p>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                        activeTab === 'templates'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <Sparkles size={15} />
                    תבניות כלליות
                    {templates.length > 0 && (
                        <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">
                            {templates.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('active')}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                        activeTab === 'active'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <FileText size={15} />
                    חוזים בתהליך
                    {(instances.length + pdfContracts.length) > 0 && (
                        <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">
                            {instances.length + pdfContracts.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Shared search bar */}
            <div className="relative max-w-xs">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="חיפוש..."
                    className="w-full pr-9 pl-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ring-blue-500 bg-white"
                />
            </div>

            {/* ══════════════════════════════════════════════════
                TAB 1 — תבניות כלליות
            ══════════════════════════════════════════════════ */}
            {activeTab === 'templates' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowParserModal(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Plus size={16} />
                            צור תבנית כללית חדשה
                        </button>
                    </div>

                    {templatesLoading && (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={32} className="animate-spin text-slate-400" />
                        </div>
                    )}

                    {!templatesLoading && filteredTemplates.length === 0 && (
                        <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-300">
                            <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Sparkles size={28} className="text-purple-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 mb-1">
                                {search ? 'לא נמצאו תבניות' : 'אין תבניות עדיין'}
                            </h3>
                            <p className="text-sm text-slate-400 mb-6">
                                {search
                                    ? 'נסה לחפש עם מילים אחרות'
                                    : 'הדבק טקסט חוזה והבינה המלאכותית תזהה את השדות'}
                            </p>
                            {!search && (
                                <button
                                    onClick={() => setShowParserModal(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                >
                                    <Plus size={16} />
                                    צור תבנית ראשונה
                                </button>
                            )}
                        </div>
                    )}

                    {!templatesLoading && filteredTemplates.length > 0 && (
                        <div className="grid gap-3">
                            {filteredTemplates.map(template => (
                                <div
                                    key={template.id}
                                    className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Sparkles size={14} className="text-purple-500 flex-shrink-0" />
                                                <h3 className="text-base font-semibold text-slate-900 truncate">
                                                    {template.title}
                                                </h3>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-3">
                                                {template.fieldsMetadata.length} שדות •{' '}
                                                {formatDate(template.createdAt)}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {template.fieldsMetadata.slice(0, 5).map(f => (
                                                    <span
                                                        key={f.id}
                                                        className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium"
                                                    >
                                                        {f.label}
                                                    </span>
                                                ))}
                                                {template.fieldsMetadata.length > 5 && (
                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                                                        +{template.fieldsMetadata.length - 5} עוד
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <button
                                                onClick={() => setAssignTemplate(template)}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors"
                                            >
                                                <GitMerge size={13} />
                                                שייך לעסקה
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTemplate(template.id)}
                                                disabled={deleting === template.id}
                                                className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                {deleting === template.id
                                                    ? <Loader2 size={16} className="animate-spin" />
                                                    : <Trash2 size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════
                TAB 2 — חוזים בתהליך
            ══════════════════════════════════════════════════ */}
            {activeTab === 'active' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2 justify-end">
                        <button
                            onClick={() => {
                                if (templates.length === 0) {
                                    toast.error('צור תחילה תבנית כללית');
                                    setActiveTab('templates');
                                } else {
                                    setAssignTemplate(templates[0]);
                                }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
                        >
                            <GitMerge size={15} />
                            שיוך תבנית לעסקה
                        </button>
                        <button
                            onClick={() => navigate('/dashboard/transactions')}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Upload size={15} />
                            העלה חוזה מוכן לחתימה
                        </button>
                    </div>

                    {activeLoading && (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={32} className="animate-spin text-slate-400" />
                        </div>
                    )}

                    {!activeLoading && activeCount === 0 && (
                        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <FileText size={28} className="text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700 mb-1">
                                {search ? 'לא נמצאו חוזים' : 'אין חוזים בתהליך'}
                            </h3>
                            <p className="text-sm text-slate-400">
                                {search ? 'נסה לחפש עם מילים אחרות' : 'שייך תבנית לעסקה או העלה חוזה PDF'}
                            </p>
                        </div>
                    )}

                    {/* Template Instances */}
                    {!activeLoading && filteredInstances.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    חוזי תבנית ({filteredInstances.length})
                                </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {filteredInstances.map(inst => {
                                    const meta = statusMeta(INSTANCE_STATUS, inst.status);
                                    const isSigned = inst.status === 'signed';
                                    return (
                                        <div
                                            key={inst.id}
                                            className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-slate-50 transition-colors"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <Sparkles size={13} className="text-purple-400 flex-shrink-0" />
                                                    <span className="text-sm font-semibold text-slate-800 truncate">
                                                        חוזה תבנית #{inst.id.slice(-6).toUpperCase()}
                                                    </span>
                                                </div>
                                                {inst.dealId && (
                                                    <p className="text-xs text-slate-400 pr-5 truncate">
                                                        עסקה: {inst.dealId.slice(-6).toUpperCase()}
                                                    </p>
                                                )}
                                            </div>

                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${meta.chip}`}>
                                                {meta.icon}{meta.label}
                                            </span>

                                            <span className="text-xs text-slate-400 hidden sm:block whitespace-nowrap">
                                                {formatDate(inst.createdAt)}
                                            </span>

                                            <button
                                                onClick={() => copyInstanceSigningLink(inst.id)}
                                                disabled={isSigned}
                                                title={isSigned ? 'החוזה נחתם' : 'העתק קישור חתימה'}
                                                className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Link2 size={16} />
                                            </button>

                                            <div className="flex items-center gap-1">
                                                {!isSigned && (
                                                    <button
                                                        onClick={() => navigate(`/dashboard/contracts/instances/${inst.id}/edit`)}
                                                        title="ערוך"
                                                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                                    >
                                                        <PenTool size={15} />
                                                    </button>
                                                )}
                                                {isSigned && (
                                                    <span className="p-2 text-green-500">
                                                        <CheckCircle size={15} />
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* PDF Contracts */}
                    {!activeLoading && filteredPdf.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    חוזי PDF ({filteredPdf.length})
                                </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {filteredPdf.map(contract => {
                                    const meta = statusMeta(PDF_STATUS, contract.status);
                                    const isComplete = contract.status === 'completed';
                                    return (
                                        <div
                                            key={contract.id}
                                            className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-slate-50 transition-colors"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <FileText size={14} className="text-slate-400 flex-shrink-0" />
                                                    <span className="text-sm font-semibold text-slate-800 truncate">
                                                        חוזה PDF #{contract.id.slice(-6).toUpperCase()}
                                                    </span>
                                                </div>
                                                {contract.dealId && (
                                                    <p className="text-xs text-slate-400 pr-5 truncate">
                                                        עסקה: {contract.dealId.slice(-6).toUpperCase()}
                                                    </p>
                                                )}
                                                {isComplete && contract.signedPdfUrl && (
                                                    <a
                                                        href={contract.signedPdfUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 pr-5 mt-0.5"
                                                    >
                                                        <Download size={10} />
                                                        הורד חוזה חתום
                                                    </a>
                                                )}
                                            </div>

                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${meta.chip}`}>
                                                {meta.icon}{meta.label}
                                            </span>

                                            <span className="text-xs text-slate-400 hidden sm:block whitespace-nowrap">
                                                {formatDate(contract.createdAt)}
                                            </span>

                                            <button
                                                onClick={() => copySigningLink(contract.id)}
                                                disabled={isComplete}
                                                title={isComplete ? 'החוזה נחתם' : 'העתק קישור חתימה'}
                                                className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Link2 size={16} />
                                            </button>

                                            <div className="flex items-center gap-1">
                                                {!isComplete && contract.dealId && (
                                                    <button
                                                        onClick={() => navigate(`/dashboard/contracts/${contract.dealId}/edit`)}
                                                        title="ערוך שדות"
                                                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                                    >
                                                        <PenTool size={15} />
                                                    </button>
                                                )}
                                                {contract.dealId && (
                                                    <button
                                                        onClick={() => navigate(`/dashboard/contracts/${contract.id}/logs`)}
                                                        title="היסטוריה"
                                                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                    >
                                                        <History size={15} />
                                                    </button>
                                                )}
                                                {isComplete && (
                                                    <span className="p-2 text-green-500">
                                                        <CheckCircle size={15} />
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            <TemplateParserModal
                isOpen={showParserModal}
                onClose={() => setShowParserModal(false)}
                onSave={handleSaveTemplate}
            />

            <AssignToDealModal
                isOpen={assignTemplate !== null}
                onClose={() => setAssignTemplate(null)}
                template={assignTemplate}
                allTemplates={templates}
            />
        </div>
    );
}
