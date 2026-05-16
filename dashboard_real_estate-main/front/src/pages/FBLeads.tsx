import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    Facebook,
    Loader2,
    ExternalLink,
    Phone as PhoneIcon,
    User as UserIcon,
    Home as HomeIcon,
    MapPin,
    Search,
    Settings2,
    ChevronDown,
    ChevronUp,
    Download,
    CheckCircle2,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
    getLiveFBLeads,
    updateFBLeadStatus,
    bootstrapFBSellers,
    getLiveFacebookLeadsByCity,
} from '../services/fbLeadService';
import { getAgencyData } from '../services/agencyService';
import FBScraperSettings from '../components/settings/FBScraperSettings';
import { db } from '../config/firebase';
import type { Agency, FBLead, FBLeadStatus, FacebookLead } from '../types';

const STATUS_TABS: { id: 'all' | FBLeadStatus; label: string }[] = [
    { id: 'all', label: 'הכל' },
    { id: 'new', label: 'חדש' },
    { id: 'contacted', label: 'בטיפול' },
    { id: 'irrelevant', label: 'לא רלוונטי' },
];

const STATUS_LABELS: Record<FBLeadStatus, string> = {
    new: 'חדש',
    contacted: 'בטיפול',
    irrelevant: 'לא רלוונטי',
};

function formatDate(val: any): string {
    if (!val) return '';
    // Firestore Timestamp (from client SDK)
    if (typeof val?.toDate === 'function') return formatDate(val.toDate());
    const d = val instanceof Date ? val : new Date(val as string);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function truncate(text: string, max = 120): string {
    if (!text) return '';
    return text.length > max ? text.slice(0, max).trim() + '…' : text;
}

export default function FBLeads() {
    const { userData } = useAuth();
    const navigate = useNavigate();

    // ── Top-level tab ──────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<'daily' | 'sellers'>('daily');

    // ── Daily scan state ───────────────────────────────────────────────────────
    const [leads, setLeads] = useState<FBLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'all' | FBLeadStatus>('all');
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    // ── Sellers import state ───────────────────────────────────────────────────
    const [agencyCity, setAgencyCity] = useState<string>('');
    const [cityBootstrapped, setCityBootstrapped] = useState<boolean | null>(null);
    const [fbLastDailySync, setFbLastDailySync] = useState<Date | null>(null);
    const [sellerLeads, setSellerLeads] = useState<FacebookLead[]>([]);
    const [sellersLoading, setSellersLoading] = useState(true);
    const [sellerSearch, setSellerSearch] = useState('');
    const [sellerExpandedId, setSellerExpandedId] = useState<string | null>(null);
    const [bootstrapping, setBootstrapping] = useState(false);
    const [bootstrapTotalImported, setBootstrapTotalImported] = useState<number | null>(null);

    // ── Load agency city ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!userData?.agencyId) return;
        const unsub = getAgencyData(userData.agencyId, (agency: Agency) => {
            setAgencyCity(agency.mainServiceArea || '');
        });
        return () => unsub();
    }, [userData?.agencyId]);

    // ── Watch cities/{city} for bootstrap status ───────────────────────────────
    useEffect(() => {
        if (!agencyCity) return;
        const unsub = onSnapshot(doc(db, 'cities', agencyCity), (snap) => {
            const data = snap.data();
            setCityBootstrapped(data?.fbBootstrapped === true);
            const raw = data?.fbLastDailySync;
            setFbLastDailySync(raw?.toDate ? raw.toDate() : null);
        });
        return () => unsub();
    }, [agencyCity]);

    // ── Daily scan leads ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!userData?.agencyId) return;
        const unsub = getLiveFBLeads(userData.agencyId, (rows) => {
            setLeads(rows);
            setLoading(false);
        });
        return () => unsub();
    }, [userData?.agencyId]);

    // ── Seller leads (real-time, city-scoped) ─────────────────────────────────
    useEffect(() => {
        if (!agencyCity) {
            setSellersLoading(false); // no city configured — stop the spinner
            return;
        }
        setSellersLoading(true);
        const unsub = getLiveFacebookLeadsByCity(agencyCity, (rows) => {
            setSellerLeads(rows);
            setSellersLoading(false);
        });
        return () => unsub();
    }, [agencyCity]);

    // ── Filtered daily leads ───────────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return leads.filter(l => {
            if (statusFilter !== 'all' && l.status !== statusFilter) return false;
            if (!q) return true;
            return (
                (l.text || '').toLowerCase().includes(q) ||
                (l.publisherName || '').toLowerCase().includes(q) ||
                (l.city || '').toLowerCase().includes(q) ||
                (l.phone || '').includes(q)
            );
        });
    }, [leads, statusFilter, search]);

    const counts = useMemo(() => ({
        all: leads.length,
        new: leads.filter(l => l.status === 'new').length,
        contacted: leads.filter(l => l.status === 'contacted').length,
        irrelevant: leads.filter(l => l.status === 'irrelevant').length,
    }), [leads]);

    // ── Filtered seller leads ──────────────────────────────────────────────────
    const filteredSellerLeads = useMemo(() => {
        const q = sellerSearch.trim().toLowerCase();
        if (!q) return sellerLeads;
        return sellerLeads.filter(l =>
            (l.text || '').toLowerCase().includes(q) ||
            (l.publisherName || '').toLowerCase().includes(q) ||
            (l.phone || '').includes(q)
        );
    }, [sellerLeads, sellerSearch]);

    if (userData && userData.role !== 'admin') {
        return <Navigate to="/dashboard" replace />;
    }

    const handleStatusChange = (id: string, status: FBLeadStatus) => {
        updateFBLeadStatus(id, status).catch(err => console.error(err));
    };

    const handleBootstrap = async () => {
        setBootstrapping(true);
        try {
            const result = await bootstrapFBSellers();
            const totalImported = result.results.reduce(
                (sum, r) => sum + (r.imported ?? 0),
                0
            );
            setBootstrapTotalImported(totalImported);
            const errors = result.results.filter(r => r.status === 'error');
            const allCached = result.results.every(r => r.status === 'cached');
            if (errors.length > 0) {
                toast.error(`שגיאה בייבוא: ${errors.map(e => e.city).join(', ')}`);
            } else if (allCached) {
                toast.success('הנתונים כבר מעודכנים — אין צורך בייבוא חוזר');
            } else {
                toast.success(`יובאו ${totalImported} מוכרים בהצלחה!`);
            }
        } catch (err: any) {
            toast.error(err?.message || 'שגיאה בייבוא מוכרים');
        } finally {
            setBootstrapping(false);
        }
    };

    return (
        <div dir="rtl" className="min-h-screen bg-[#0a0f1c] p-4 sm:p-6 lg:p-8">
            <div className="max-w-[1400px] mx-auto">
                <div className="bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden">

                    {/* ── Header ─────────────────────────────────────────────────────────── */}
                    <div className="px-6 py-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center shadow-lg">
                                <Facebook size={22} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl sm:text-2xl font-black text-white">סורק פייסבוק</h1>
                                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                                    {activeTab === 'daily'
                                        ? 'פוסטים שנסרקו מקבוצות פייסבוק שהגדרתם. פוסטים פרטיים נכנסים אוטומטית למערכת כליד מוכר ונכס בטיוטה.'
                                        : 'ייבוא 14 ימים אחרונים של מוכרים מקבוצות פייסבוק — פעם אחת לעיר, עם סנכרון יומי אוטומטי לאחר מכן.'}
                                </p>
                            </div>
                        </div>

                        {activeTab === 'daily' && (
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowSettings(v => !v)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition ${
                                        showSettings
                                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600'
                                    }`}
                                >
                                    <Settings2 size={15} />
                                    הגדרת קבוצות
                                    {showSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                                <div className="relative">
                                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="חיפוש בטקסט, שם, עיר או טלפון"
                                        className="bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none w-full sm:w-72"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Top-level tab switcher ──────────────────────────────────────────── */}
                    <div className="px-6 pt-4 pb-0 flex gap-2 border-b border-slate-800">
                        {[
                            { id: 'daily' as const, label: 'סריקה יומית' },
                            { id: 'sellers' as const, label: 'מוכרים — 14 יום' },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className={`px-4 py-2.5 text-sm font-bold border-b-2 transition -mb-px ${
                                    activeTab === t.id
                                        ? 'text-blue-400 border-blue-500'
                                        : 'text-slate-500 border-transparent hover:text-slate-300'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* ══════════════════════════════════════════════════════════════════════ */}
                    {/* DAILY SCAN TAB                                                        */}
                    {/* ══════════════════════════════════════════════════════════════════════ */}
                    {activeTab === 'daily' && (
                        <>
                            {showSettings && (
                                <div className="border-b border-slate-800 px-6 py-6">
                                    <FBScraperSettings />
                                </div>
                            )}

                            <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap gap-2">
                                {STATUS_TABS.map(tab => {
                                    const isActive = statusFilter === tab.id;
                                    const count = counts[tab.id as keyof typeof counts];
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setStatusFilter(tab.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                                                isActive
                                                    ? 'bg-blue-600 text-white border-blue-500 shadow'
                                                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                                            }`}
                                        >
                                            {tab.label}
                                            <span className="opacity-70 mr-1.5">({count})</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {loading ? (
                                <div className="flex items-center justify-center py-24 text-slate-400">
                                    <Loader2 size={28} className="animate-spin" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="py-16 text-center text-slate-400 text-sm">
                                    <Facebook size={42} className="mx-auto mb-3 text-slate-700" />
                                    <p className="mb-4">אין עדיין פוסטים שנסרקו.</p>
                                    {!showSettings && (
                                        <button
                                            onClick={() => setShowSettings(true)}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition"
                                        >
                                            <Settings2 size={15} />
                                            הגדרת קבוצות לסריקה
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-900/40 text-slate-400 text-xs uppercase">
                                            <tr>
                                                <th className="text-right px-4 py-3 font-semibold">תמונה</th>
                                                <th className="text-right px-4 py-3 font-semibold">פרסם</th>
                                                <th className="text-right px-4 py-3 font-semibold">תאריך</th>
                                                <th className="text-right px-4 py-3 font-semibold">עיר</th>
                                                <th className="text-right px-4 py-3 font-semibold">סוג</th>
                                                <th className="text-right px-4 py-3 font-semibold">טלפון</th>
                                                <th className="text-right px-4 py-3 font-semibold">תוכן</th>
                                                <th className="text-right px-4 py-3 font-semibold">סטטוס</th>
                                                <th className="text-right px-4 py-3 font-semibold">פעולות</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map(lead => {
                                                const isExpanded = expandedId === lead.id;
                                                const isPrivate = lead.type === 'PRIVATE';
                                                return (
                                                    <tr
                                                        key={lead.id}
                                                        className="border-t border-slate-800 hover:bg-slate-900/40 align-top"
                                                    >
                                                        <td className="px-4 py-3">
                                                            {lead.thumbnail ? (
                                                                <img
                                                                    src={lead.thumbnail}
                                                                    alt=""
                                                                    className="w-12 h-12 rounded-lg object-cover border border-slate-700"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                                                                    <HomeIcon size={16} className="text-slate-600" />
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-200 font-medium whitespace-nowrap">
                                                            {lead.publisherName}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                                                            {formatDate(lead.publishedAt)}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                                                            <span className="inline-flex items-center gap-1">
                                                                <MapPin size={12} className="text-slate-500" />
                                                                {lead.city}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            {isPrivate ? (
                                                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                                    בעל נכס
                                                                </span>
                                                            ) : (
                                                                <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                                                    מתווך
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            {lead.phone ? (
                                                                <a
                                                                    href={`tel:${lead.phone}`}
                                                                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                                                                    dir="ltr"
                                                                >
                                                                    <PhoneIcon size={12} />
                                                                    {lead.phone}
                                                                </a>
                                                            ) : (
                                                                <span className="text-slate-600 text-xs">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 max-w-md">
                                                            <div
                                                                className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap cursor-pointer"
                                                                onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                                                            >
                                                                {isExpanded ? lead.text : truncate(lead.text)}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <select
                                                                value={lead.status}
                                                                onChange={(e) => handleStatusChange(lead.id, e.target.value as FBLeadStatus)}
                                                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                                                            >
                                                                {(Object.keys(STATUS_LABELS) as FBLeadStatus[]).map(s => (
                                                                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                {isPrivate && lead.leadId && (
                                                                    <button
                                                                        title="פתח את הליד שנוצר"
                                                                        onClick={() => navigate(`/dashboard/leads?id=${lead.leadId}`)}
                                                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                                                                    >
                                                                        <UserIcon size={14} />
                                                                    </button>
                                                                )}
                                                                {isPrivate && lead.propertyId && (
                                                                    <button
                                                                        title="פתח את הנכס שנוצר"
                                                                        onClick={() => navigate(`/dashboard/properties?id=${lead.propertyId}`)}
                                                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                                                                    >
                                                                        <HomeIcon size={14} />
                                                                    </button>
                                                                )}
                                                                <a
                                                                    href={lead.postUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    title="פתח את הפוסט בפייסבוק"
                                                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                                                                >
                                                                    <ExternalLink size={14} />
                                                                </a>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}

                    {/* ══════════════════════════════════════════════════════════════════════ */}
                    {/* SELLERS TAB                                                           */}
                    {/* ══════════════════════════════════════════════════════════════════════ */}
                    {activeTab === 'sellers' && (
                        <div className="p-6 space-y-6">

                            {/* Bootstrap card */}
                            <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    {cityBootstrapped === null ? (
                                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>טוען...</span>
                                        </div>
                                    ) : cityBootstrapped ? (
                                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                                            <CheckCircle2 size={17} />
                                            <span>יובאו בהצלחה · סנכרון יומי פעיל</span>
                                            {bootstrapTotalImported !== null && (
                                                <span className="text-slate-400 font-normal">({bootstrapTotalImported} מוכרים)</span>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-slate-200 font-bold text-sm">
                                            ייבוא מוכרים מפייסבוק — 14 יום אחרונים
                                        </p>
                                    )}
                                    <p className="text-slate-400 text-xs mt-1">
                                        {agencyCity ? (
                                            <>
                                                עיר המשרד: <span className="text-blue-300 font-semibold">{agencyCity}</span>
                                                {fbLastDailySync && (
                                                    <> · סנכרון אחרון: <span className="text-slate-300">{formatDate(fbLastDailySync)}</span></>
                                                )}
                                            </>
                                        ) : (
                                            'לא הוגדרה עיר משרד — הגדירו ב-Settings'
                                        )}
                                    </p>
                                </div>
                                {!cityBootstrapped && (
                                    <button
                                        onClick={handleBootstrap}
                                        disabled={bootstrapping || !agencyCity || cityBootstrapped === null}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {bootstrapping
                                            ? <Loader2 size={15} className="animate-spin" />
                                            : <Download size={15} />}
                                        {bootstrapping ? 'מייבא…' : 'ייבוא מוכרים'}
                                    </button>
                                )}
                            </div>

                            {/* Search bar */}
                            <div className="relative">
                                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    type="text"
                                    value={sellerSearch}
                                    onChange={(e) => setSellerSearch(e.target.value)}
                                    placeholder="חיפוש בטקסט, שם או טלפון"
                                    className="bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none w-full sm:w-72"
                                />
                            </div>

                            {/* Lead list */}
                            {sellersLoading ? (
                                <div className="flex items-center justify-center py-16 text-slate-400">
                                    <Loader2 size={28} className="animate-spin" />
                                </div>
                            ) : !cityBootstrapped && sellerLeads.length === 0 ? (
                                <div className="py-16 text-center text-slate-400 text-sm">
                                    <Download size={42} className="mx-auto mb-3 text-slate-700" />
                                    <p className="mb-4">לחצו על "ייבוא מוכרים" כדי לאתר מוכרים מהקבוצות שהגדרתם.</p>
                                    <p className="text-xs text-slate-600">הייבוא מתבצע פעם אחת לעיר — לאחר מכן הנתונים מתעדכנים אוטומטית כל יום.</p>
                                </div>
                            ) : filteredSellerLeads.length === 0 ? (
                                <div className="py-10 text-center text-slate-500 text-sm">
                                    לא נמצאו תוצאות
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredSellerLeads.map(lead => {
                                        const isExpanded = sellerExpandedId === lead.id;
                                        return (
                                            <div
                                                key={lead.id}
                                                className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition"
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                                    {lead.thumbnail ? (
                                                        <img
                                                            src={lead.thumbnail}
                                                            alt=""
                                                            className="w-14 h-14 rounded-xl object-cover border border-slate-700 flex-shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                                                            <HomeIcon size={18} className="text-slate-600" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                            <span className="text-slate-100 font-semibold text-sm">
                                                                {lead.publisherName}
                                                            </span>
                                                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                                                <MapPin size={11} />
                                                                {lead.city}
                                                            </span>
                                                            {lead.publishedAt && (
                                                                <span className="text-xs text-slate-600">
                                                                    {formatDate(lead.publishedAt)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div
                                                            className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap cursor-pointer"
                                                            onClick={() => setSellerExpandedId(isExpanded ? null : lead.id)}
                                                        >
                                                            {isExpanded ? lead.text : truncate(lead.text, 160)}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        {lead.phone && (
                                                            <a
                                                                href={`tel:${lead.phone}`}
                                                                title={lead.phone}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600/10 border border-blue-600/30 text-blue-400 hover:bg-blue-600/20 text-xs font-medium transition"
                                                                dir="ltr"
                                                            >
                                                                <PhoneIcon size={12} />
                                                                {lead.phone}
                                                            </a>
                                                        )}
                                                        <a
                                                            href={lead.postUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title="פתח בפייסבוק"
                                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition"
                                                        >
                                                            <ExternalLink size={13} />
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
