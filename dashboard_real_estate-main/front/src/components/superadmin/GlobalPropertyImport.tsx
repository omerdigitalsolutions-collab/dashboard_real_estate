import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
    Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle,
    Trash2, Sparkles, ChevronLeft, ChevronRight, Table as TableIcon,
    CalendarClock, ShieldAlert,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

// ─── Field options for global properties ─────────────────────────────────────

const GLOBAL_PROPERTY_FIELDS: { key: string; label: string }[] = [
    { key: 'city',         label: 'עיר' },
    { key: 'street',       label: 'רחוב / כתובת' },
    { key: 'neighborhood', label: 'שכונה' },
    { key: 'price',        label: 'מחיר' },
    { key: 'rooms',        label: 'חדרים' },
    { key: 'sqm',          label: 'שטח מ"ר' },
    { key: 'floor',        label: 'קומה' },
    { key: 'type',         label: 'סוג עסקה (מכירה/השכרה/מסחרי)' },
    { key: 'kind',         label: 'סוג נכס (דירה, פנטהוז...)' },
    { key: 'description',  label: 'תיאור נכס' },
    { key: 'agentName',    label: 'שם סוכן / סוכנות' },
    { key: 'listingType',  label: 'סוג שיווק' },
    { key: 'notes',        label: 'הערות' },
    { key: 'imageUrl',     label: 'קישור לתמונה (Image URL)' },
    { key: 'listingUrl',   label: 'קישור למודעה (Listing URL)' },
    { key: 'hasBalcony',   label: 'מרפסת (כן/לא)' },
    { key: 'hasElevator',  label: 'מעלית (כן/לא)' },
    { key: 'hasParking',   label: 'חניה (כן/לא)' },
    { key: 'parkingSpots', label: 'מספר חניות (0/1/2...)' },
    { key: 'hasSafeRoom',  label: 'ממ"ד (כן/לא)' },
    { key: 'hasAgent',     label: 'יש תיווך (כן/לא)' },
    { key: 'contactName',  label: 'שם איש קשר' },
    { key: 'contactPhone', label: 'טלפון איש קשר' },
    { key: 'listingId',    label: 'מזהה מודעה חיצוני' },
];

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['העלאה', 'מיפוי', 'ייבוא'];

const StepIndicator: React.FC<{ current: number }> = ({ current }) => (
    <div className="flex items-center gap-2 justify-center mb-6">
        {STEPS.map((label, i) => {
            const idx = i + 1;
            const done = idx < current;
            const active = idx === current;
            return (
                <React.Fragment key={idx}>
                    <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            done ? 'bg-emerald-500 text-white' :
                            active ? 'bg-orange-500 text-white ring-4 ring-orange-500/20' :
                            'bg-slate-700 text-slate-400'
                        }`}>
                            {done ? <CheckCircle2 size={14} /> : idx}
                        </div>
                        <span className={`text-[10px] font-medium ${active ? 'text-orange-400' : done ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {label}
                        </span>
                    </div>
                    {i < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 mb-4 transition-all ${done ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                    )}
                </React.Fragment>
            );
        })}
    </div>
);

// ─── Mapping table ────────────────────────────────────────────────────────────

const MappingTable: React.FC<{
    headers: string[];
    mapping: Record<string, string>;
    onChange: (header: string, value: string) => void;
}> = ({ headers, mapping, onChange }) => (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                    <th className="px-4 py-2.5 font-semibold text-slate-400 text-xs">עמודה בקובץ</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-400 text-xs">שדה במערכת</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
                {headers.map(header => (
                    <tr key={header} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-2 text-slate-300 font-medium text-xs">
                                <TableIcon size={12} className="text-slate-500 shrink-0" />
                                {header}
                            </span>
                        </td>
                        <td className="px-4 py-2.5">
                            <select
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all"
                                value={mapping[header] ?? ''}
                                onChange={e => onChange(header, e.target.value)}
                            >
                                <option value="">— התעלם מעמודה זו —</option>
                                <optgroup label="שדות מערכת">
                                    {GLOBAL_PROPERTY_FIELDS.map(f => (
                                        <option key={f.key} value={f.key}>{f.label}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

type PurgeReport = {
    success: boolean;
    dryRun: boolean;
    cutoffISO: string;
    keepMissingDate: boolean;
    totals: { kept: number; deleted: number; missingDate: number; citiesEmptied: number };
    perCity: Record<string, { kept: number; deleted: number; missingDate: number }>;
};

const GlobalPropertyImport: React.FC = () => {
    const [step, setStep]             = useState<1 | 2 | 3>(1);
    const [file, setFile]             = useState<File | null>(null);
    const [rawRows, setRawRows]       = useState<any[]>([]);
    const [rawHeaders, setRawHeaders] = useState<string[]>([]);
    const [mapping, setMapping]       = useState<Record<string, string>>({});
    const [isParsing, setIsParsing]   = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [results, setResults]       = useState<{ success: boolean; count?: number; message?: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Purge panel state ────────────────────────────────────────────────────
    const [purgeCutoff, setPurgeCutoff]       = useState('2026-04-21');
    const [keepMissingDate, setKeepMissingDate] = useState(false);
    const [isPurging, setIsPurging]           = useState(false);
    const [purgeReport, setPurgeReport]       = useState<PurgeReport | null>(null);
    const [purgeError, setPurgeError]         = useState<string | null>(null);
    const [confirmText, setConfirmText]       = useState('');

    const runPurge = async (dryRun: boolean) => {
        setPurgeError(null);
        setIsPurging(true);
        try {
            const purgeFn = httpsCallable(functions, 'superadmin-superAdminPurgeOldGlobalPropertiesV2');
            const res = await purgeFn({ cutoffISO: purgeCutoff, dryRun, keepMissingDate });
            setPurgeReport(res.data as PurgeReport);
            if (!dryRun) setConfirmText('');
        } catch (err: any) {
            setPurgeError(err?.message || 'שגיאה בהפעלת המחיקה');
        } finally {
            setIsPurging(false);
        }
    };

    // ── File upload & parse ──────────────────────────────────────────────────

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;

        setFile(selected);
        setResults(null);
        setIsParsing(true);

        try {
            const data = await selected.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) as any[];

            if (rows.length === 0) throw new Error('הקובץ ריק');

            const headers = Object.keys(rows[0]);
            setRawRows(rows);
            setRawHeaders(headers);

            // Auto-map via backend
            const getMappingFn = httpsCallable(functions, 'superadmin-superAdminGetImportMappingV2');
            const res = await getMappingFn({ headers, sampleData: [rows[0]] });
            setMapping((res.data as any).mapping ?? {});
            setStep(2);
        } catch (err: any) {
            setResults({ success: false, message: 'שגיאה בקריאת הקובץ: ' + err.message });
        } finally {
            setIsParsing(false);
        }
    };

    // ── Re-run auto-mapping ──────────────────────────────────────────────────

    const handleAutoMap = async () => {
        if (!rawHeaders.length) return;
        setIsParsing(true);
        try {
            const getMappingFn = httpsCallable(functions, 'superadmin-superAdminGetImportMappingV2');
            const res = await getMappingFn({ headers: rawHeaders, sampleData: rawRows.slice(0, 1) });
            setMapping((res.data as any).mapping ?? {});
        } finally {
            setIsParsing(false);
        }
    };

    // ── Execute import ───────────────────────────────────────────────────────

    const handleImport = async () => {
        if (!rawRows.length) return;

        setIsUploading(true);
        setResults(null);

        try {
            const NUMERIC_FIELDS = new Set(['price', 'sqm', 'rooms', 'floor', 'parkingSpots']);

            const mappedProperties = rawRows.map(row => {
                const item: Record<string, any> = {};
                Object.entries(mapping).forEach(([excelKey, dbKey]) => {
                    if (!dbKey) return;
                    const raw = row[excelKey];
                    if (raw === undefined || raw === null || raw === '') return;

                    if (dbKey === 'imageUrl') {
                        // Accumulate all image URLs into an array
                        const url = String(raw).trim();
                        if (url) {
                            item['imageUrls'] = [...(item['imageUrls'] ?? []), url];
                        }
                        return;
                    }

                    if (NUMERIC_FIELDS.has(dbKey)) {
                        // For numeric fields: keep first non-empty value
                        if (item[dbKey] === undefined) {
                            const num = Number(String(raw).replace(/[^\d.]/g, ''));
                            if (!isNaN(num)) item[dbKey] = num;
                        }
                        return;
                    }

                    // For all other fields: concatenate multiple values with " | " (skip if identical)
                    const str = String(raw).trim();
                    if (str) {
                        if (!item[dbKey]) {
                            item[dbKey] = str;
                        } else if (item[dbKey] !== str) {
                            item[dbKey] = `${item[dbKey]} | ${str}`;
                        }
                    }
                });
                return item;
            });

            const importFn = httpsCallable(functions, 'superadmin-superAdminImportGlobalPropertiesV2');
            const importRes = await importFn({ properties: mappedProperties });
            const resData = importRes.data as any;

            setResults({
                success: true,
                count: resData.insertedCount,
                message: `ייבוא הושלם בהצלחה! ${resData.insertedCount} נכסים נוספו למאגר.`,
            });
            clearAll();
        } catch (err: any) {
            setResults({ success: false, message: 'שגיאה בייבוא: ' + err.message });
        } finally {
            setIsUploading(false);
        }
    };

    // ── Clear state ──────────────────────────────────────────────────────────

    const clearAll = () => {
        setFile(null);
        setRawRows([]);
        setRawHeaders([]);
        setMapping({});
        setStep(1);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const mappedCount = Object.values(mapping).filter(Boolean).length;

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-orange-500/20 rounded-2xl p-6 shadow-xl" dir="rtl">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                    <FileSpreadsheet className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-white">ייבוא נכסים גלובלי (Excel)</h2>
                    <p className="text-xs text-slate-400">העלאת קבצים למאגר ה-Cities המשותף</p>
                </div>
            </div>

            <StepIndicator current={step} />

            {/* ── Step 1: Upload ─────────────────────────────────────────── */}
            {step === 1 && (
                <div className="space-y-4">
                    <div
                        onClick={() => !isParsing && fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-700 hover:border-orange-500/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all hover:bg-orange-500/5 group"
                    >
                        <div className="p-4 bg-slate-800 rounded-full group-hover:scale-110 transition-transform">
                            {isParsing
                                ? <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                                : <Upload className="w-8 h-8 text-slate-500 group-hover:text-orange-400" />
                            }
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-bold text-slate-300">
                                {isParsing ? 'מנתח קובץ ומבצע מיפוי אוטומטי...' : 'לחץ להעלאת קובץ אקסל או CSV'}
                            </p>
                            {!isParsing && <p className="text-xs text-slate-500 mt-1">גרור לכאן את הקובץ או בחר מהמחשב</p>}
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                        />
                    </div>

                    {results && !results.success && (
                        <div className="p-4 rounded-xl flex items-start gap-3 bg-red-900/20 border border-red-500/30 text-red-400">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <p className="text-sm font-medium">{results.message}</p>
                        </div>
                    )}
                </div>
            )}

            {/* ── Step 2: Field Mapping ──────────────────────────────────── */}
            {step === 2 && (
                <div className="space-y-4">
                    {/* File info bar */}
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                        <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                            <div>
                                <p className="text-sm font-bold text-white">{file?.name}</p>
                                <p className="text-xs text-slate-500">{rawRows.length} שורות | {rawHeaders.length} עמודות</p>
                            </div>
                        </div>
                        <button onClick={clearAll} className="p-2 text-slate-400 hover:text-red-400 transition-colors">
                            <Trash2 size={16} />
                        </button>
                    </div>

                    {/* Auto-map button */}
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">שייך כל עמודה לשדה המתאים במערכת:</p>
                        <button
                            onClick={handleAutoMap}
                            disabled={isParsing}
                            className="flex items-center gap-1.5 text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors disabled:opacity-50"
                        >
                            {isParsing
                                ? <Loader2 size={12} className="animate-spin" />
                                : <Sparkles size={12} />
                            }
                            זיהוי שדות אוטומטי
                        </button>
                    </div>

                    {/* Mapping table */}
                    <div className="max-h-[360px] overflow-y-auto rounded-xl">
                        <MappingTable
                            headers={rawHeaders}
                            mapping={mapping}
                            onChange={(h, v) => setMapping(prev => ({ ...prev, [h]: v }))}
                        />
                    </div>

                    <p className="text-xs text-slate-500 text-center">{mappedCount} מתוך {rawHeaders.length} עמודות ממופות</p>

                    {/* Navigation */}
                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={clearAll}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all"
                        >
                            <ChevronRight size={14} />
                            חזור
                        </button>
                        <button
                            onClick={() => setStep(3)}
                            disabled={mappedCount === 0}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.25)]"
                        >
                            המשך לייבוא
                            <ChevronLeft size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step 3: Import ─────────────────────────────────────────── */}
            {step === 3 && (
                <div className="space-y-4">
                    {/* Summary */}
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-3">
                        <p className="text-sm font-bold text-white">סיכום לפני ייבוא</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-900/60 rounded-lg p-3 text-center">
                                <p className="text-2xl font-black text-orange-400">{rawRows.length}</p>
                                <p className="text-xs text-slate-400 mt-0.5">נכסים לייבוא</p>
                            </div>
                            <div className="bg-slate-900/60 rounded-lg p-3 text-center">
                                <p className="text-2xl font-black text-emerald-400">{mappedCount}</p>
                                <p className="text-xs text-slate-400 mt-0.5">שדות ממופים</p>
                            </div>
                        </div>

                        {/* Mapped fields list */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {Object.entries(mapping)
                                .filter(([, v]) => v)
                                .map(([col, field]) => {
                                    const fieldLabel = GLOBAL_PROPERTY_FIELDS.find(f => f.key === field)?.label ?? field;
                                    return (
                                        <span key={col} className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                                            {col} → {fieldLabel}
                                        </span>
                                    );
                                })}
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex gap-3">
                        <button
                            onClick={() => setStep(2)}
                            disabled={isUploading}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all disabled:opacity-40"
                        >
                            <ChevronRight size={14} />
                            חזור למיפוי
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={isUploading}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-400 text-white shadow-[0_0_20px_rgba(249,115,22,0.25)]"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    מייבא נכסים...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    בצע ייבוא גלובלי
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Results ────────────────────────────────────────────────── */}
            {results && (
                <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 border ${
                    results.success
                        ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-900/20 border-red-500/30 text-red-400'
                }`}>
                    {results.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <p className="text-sm font-medium">{results.message}</p>
                </div>
            )}

            {/* ── Purge old global properties ─────────────────────────────── */}
            <div className="mt-8 border-t border-red-500/20 pt-6">
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-red-500/20 rounded-lg">
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">מחיקת נכסים גלובליים ישנים</h3>
                        <p className="text-xs text-slate-400">
                            שומר נכסים שנוצרו בתאריך הקיצוץ ואחריו, מוחק את כל השאר מ-<code className="text-slate-300">cities/*/properties</code>.
                        </p>
                    </div>
                </div>

                <div className="bg-slate-800/40 border border-red-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                            <CalendarClock size={14} className="text-red-400" />
                            תאריך קיצוץ (שמור מתאריך זה ואילך):
                        </label>
                        <input
                            type="date"
                            value={purgeCutoff}
                            onChange={e => setPurgeCutoff(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500/40"
                        />
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={keepMissingDate}
                                onChange={e => setKeepMissingDate(e.target.checked)}
                                className="accent-red-500"
                            />
                            השאר נכסים ללא תאריך יצירה
                        </label>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => runPurge(true)}
                            disabled={isPurging || !purgeCutoff}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-40"
                        >
                            {isPurging ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            סימולציה (ספירה בלבד)
                        </button>

                        <input
                            type="text"
                            placeholder='לאישור: כתוב DELETE'
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500/40 w-40"
                        />

                        <button
                            onClick={() => runPurge(false)}
                            disabled={isPurging || confirmText !== 'DELETE' || !purgeCutoff}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isPurging ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            מחק עכשיו
                        </button>
                    </div>

                    {purgeError && (
                        <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>{purgeError}</span>
                        </div>
                    )}

                    {purgeReport && (
                        <div className={`p-3 rounded-lg border text-xs space-y-2 ${
                            purgeReport.dryRun
                                ? 'bg-slate-900/40 border-slate-700 text-slate-300'
                                : 'bg-emerald-900/20 border-emerald-500/30 text-emerald-300'
                        }`}>
                            <p className="font-bold">
                                {purgeReport.dryRun ? 'תוצאות סימולציה' : 'מחיקה הושלמה'} — קיצוץ: {purgeReport.cutoffISO}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="bg-slate-900/60 rounded p-2 text-center">
                                    <p className="text-lg font-black text-emerald-400">{purgeReport.totals.kept}</p>
                                    <p className="text-[10px] text-slate-400">נשמרו</p>
                                </div>
                                <div className="bg-slate-900/60 rounded p-2 text-center">
                                    <p className="text-lg font-black text-red-400">{purgeReport.totals.deleted}</p>
                                    <p className="text-[10px] text-slate-400">{purgeReport.dryRun ? 'יימחקו' : 'נמחקו'}</p>
                                </div>
                                <div className="bg-slate-900/60 rounded p-2 text-center">
                                    <p className="text-lg font-black text-amber-400">{purgeReport.totals.missingDate}</p>
                                    <p className="text-[10px] text-slate-400">ללא תאריך</p>
                                </div>
                                <div className="bg-slate-900/60 rounded p-2 text-center">
                                    <p className="text-lg font-black text-slate-300">{purgeReport.totals.citiesEmptied}</p>
                                    <p className="text-[10px] text-slate-400">ערים ריקות שנוקו</p>
                                </div>
                            </div>
                            <details className="text-[11px] text-slate-400">
                                <summary className="cursor-pointer hover:text-slate-200">פירוט לפי עיר ({Object.keys(purgeReport.perCity).length})</summary>
                                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                                    {Object.entries(purgeReport.perCity)
                                        .sort((a, b) => b[1].deleted - a[1].deleted)
                                        .map(([city, s]) => (
                                            <div key={city} className="flex justify-between px-2 py-0.5 hover:bg-slate-800/50 rounded">
                                                <span>{city}</span>
                                                <span className="text-slate-500">
                                                    שמור: <span className="text-emerald-400">{s.kept}</span> · {purgeReport.dryRun ? 'יימחק' : 'נמחק'}: <span className="text-red-400">{s.deleted}</span>
                                                    {s.missingDate > 0 && <> · ללא תאריך: <span className="text-amber-400">{s.missingDate}</span></>}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            </details>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GlobalPropertyImport;
