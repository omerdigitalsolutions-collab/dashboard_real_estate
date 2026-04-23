import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText,
    PenTool,
    CheckCircle,
    Clock,
    Link2,
    ExternalLink,
    FilePlus,
    Loader2,
    AlertCircle,
    Search,
    History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getLiveContracts } from '../services/contractService';
import { Contract } from '../types';

type ContractWithId = Contract & { id: string };

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; chip: string }> = {
    draft:     { label: 'טיוטה',      icon: <Clock size={12} />,        chip: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    active:    { label: 'פעיל',       icon: <PenTool size={12} />,      chip: 'bg-blue-100 text-blue-700 border-blue-200' },
    completed: { label: 'נחתם',       icon: <CheckCircle size={12} />,  chip: 'bg-green-100 text-green-700 border-green-200' },
    default:   { label: 'לא ידוע',    icon: <AlertCircle size={12} />,  chip: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function statusMeta(status: string) {
    return STATUS_META[status] ?? STATUS_META.default;
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

    const [contracts, setContracts] = useState<ContractWithId[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // ── Live listener ──────────────────────────────────────────────────────────
    useEffect(() => {
        let isMounted = true;
        if (!userData?.agencyId) return;

        const unsub = getLiveContracts(
            userData.agencyId,
            (data) => {
                if (isMounted) {
                    setContracts(data);
                    setLoading(false);
                }
            },
            (err) => {
                if (isMounted) {
                    console.error('Contracts listener error:', err);
                    setLoading(false);
                }
            }
        );

        return () => {
            isMounted = false;
            unsub();
        };
    }, [userData?.agencyId]);

    // ── Copy signing link ──────────────────────────────────────────────────────
    const copySigningLink = (contractId: string) => {
        const url = `${window.location.origin}/sign/${userData?.agencyId}/${contractId}`;
        navigator.clipboard.writeText(url)
            .then(() => toast.success('קישור חתימה הועתק ללוח'))
            .catch(() => toast.error('לא ניתן להעתיק את הקישור'));
    };

    // ── Filtered list ──────────────────────────────────────────────────────────
    const filtered = search.trim()
        ? contracts.filter(c =>
            c.id.toLowerCase().includes(search.toLowerCase()) ||
            c.dealId?.toLowerCase().includes(search.toLowerCase()) ||
            c.status?.toLowerCase().includes(search.toLowerCase())
          )
        : contracts;

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">חוזים</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        ניהול חוזי עסקה וחתימות דיגיטליות
                    </p>
                </div>
            </div>

            {/* Search bar */}
            <div className="relative max-w-xs">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="חיפוש חוזה..."
                    className="w-full pr-9 pl-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ring-blue-500 bg-white"
                />
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-slate-400" />
                </div>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
                <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <FileText size={28} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700 mb-1">
                        {search ? 'לא נמצאו חוזים' : 'אין חוזים עדיין'}
                    </h3>
                    <p className="text-sm text-slate-400 mb-6">
                        {search
                            ? 'נסה לחפש עם מילים אחרות'
                            : 'צור חוזה ראשון מתוך דף העסקאות'}
                    </p>
                    {!search && (
                        <button
                            onClick={() => navigate('/dashboard/transactions')}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                        >
                            <FilePlus size={16} />
                            עבור לעסקאות
                        </button>
                    )}
                </div>
            )}

            {/* Contracts table */}
            {!loading && filtered.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <span>חוזה</span>
                        <span className="text-center">סטטוס</span>
                        <span className="text-center hidden sm:block">תאריך</span>
                        <span className="text-center">קישור</span>
                        <span className="text-center">פעולות</span>
                    </div>

                    {/* Rows */}
                    <div className="divide-y divide-slate-100">
                        {filtered.map(contract => {
                            const meta = statusMeta(contract.status);
                            const isComplete = contract.status === 'completed';

                            return (
                                <div
                                    key={contract.id}
                                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-slate-50 transition-colors"
                                >
                                    {/* Contract info */}
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <FileText size={14} className="text-slate-400 flex-shrink-0" />
                                            <span className="text-sm font-semibold text-slate-800 truncate">
                                                חוזה #{contract.id.slice(-6).toUpperCase()}
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
                                                onClick={e => e.stopPropagation()}
                                                className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 pr-5 mt-0.5"
                                            >
                                                <ExternalLink size={10} />
                                                הורד חוזה חתום
                                            </a>
                                        )}
                                    </div>

                                    {/* Status badge */}
                                    <div className="flex justify-center">
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${meta.chip}`}>
                                            {meta.icon}
                                            {meta.label}
                                        </span>
                                    </div>

                                    {/* Date */}
                                    <div className="text-xs text-slate-400 text-center hidden sm:block whitespace-nowrap">
                                        {formatDate(contract.createdAt)}
                                    </div>

                                    {/* Copy signing link */}
                                    <div className="flex justify-center">
                                        <button
                                            onClick={() => copySigningLink(contract.id)}
                                            disabled={isComplete}
                                            title={isComplete ? 'חוזה כבר נחתם' : 'העתק קישור חתימה ללקוח'}
                                            className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <Link2 size={16} />
                                        </button>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex justify-center">
                                        {!isComplete && contract.dealId && (
                                            <button
                                                onClick={() => navigate(`/dashboard/contracts/${contract.dealId}/edit`)}
                                                title="ערוך תבנית חוזה"
                                                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                            >
                                                <PenTool size={16} />
                                            </button>
                                        )}
                                        {contract.dealId && (
                                            <button
                                                onClick={() => navigate(`/dashboard/contracts/${contract.id}/logs`)}
                                                title="היסטוריית פעולות"
                                                className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                            >
                                                <History size={16} />
                                            </button>
                                        )}
                                        {isComplete && (
                                            <span className="p-2 text-green-500">
                                                <CheckCircle size={16} />
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer count */}
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
                        {filtered.length} חוז{filtered.length === 1 ? '' : 'ים'}
                    </div>
                </div>
            )}
        </div>
    );
}
