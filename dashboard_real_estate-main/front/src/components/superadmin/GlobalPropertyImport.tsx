import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

interface MappedProperty {
    city?: string;
    street?: string;
    price?: number;
    rooms?: number | string;
    sqm?: number;
    floor?: number | string;
    type?: string;
    kind?: string;
    [key: string]: any;
}

const GlobalPropertyImport: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [results, setResults] = useState<{ success: boolean; count?: number; message?: string } | null>(null);
    const [mapping, setMapping] = useState<Record<string, string> | null>(null);
    const [rawRows, setRawRows] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setResults(null);
        setMapping(null);
        setIsParsing(true);

        try {
            const data = await selectedFile.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet);

            if (rows.length === 0) {
                throw new Error('הקובץ ריק');
            }

            setRawRows(rows);

            // Get Headers for AI mapping
            const headers = Object.keys(rows[0] as object);
            const sampleData = [rows[0]];

            // Call AI mapping function
            const getMappingFn = httpsCallable(functions, 'superadmin-superAdminGetImportMapping');
            const mappingRes = await getMappingFn({ headers, sampleData });

            const aiMapping = (mappingRes.data as any).mapping;
            setMapping(aiMapping);
        } catch (err: any) {
            setResults({ success: false, message: 'שגיאה בקריאת הקובץ: ' + err.message });
        } finally {
            setIsParsing(false);
        }
    };

    const handleUpload = async () => {
        if (!file || !mapping || rawRows.length === 0) return;

        setIsUploading(true);
        setResults(null);

        try {
            // Apply mapping to all rows
            const mappedProperties: MappedProperty[] = rawRows.map((row) => {
                const item: MappedProperty = {};
                Object.entries(mapping).forEach(([excelKey, dbKey]) => {
                    let value = row[excelKey];

                    // Basic type coercion for numeric fields
                    if (['price', 'sqm', 'rooms', 'floor'].includes(dbKey) && value !== undefined) {
                        const num = Number(value.toString().replace(/[^\d.]/g, ''));
                        if (!isNaN(num)) value = num;
                    }

                    item[dbKey] = value;
                });
                return item;
            });

            // Call bulk import function
            const importFn = httpsCallable(functions, 'superadmin-superAdminImportGlobalProperties');
            const importRes = await importFn({ properties: mappedProperties });

            const data = importRes.data as any;
            setResults({
                success: true,
                count: data.insertedCount,
                message: `ייבוא הושלם בהצלחה! ${data.insertedCount} נכסים נוספו למאגר.`
            });

            // Clear state after success
            setFile(null);
            setMapping(null);
            setRawRows([]);
            if (fileInputRef.current) fileInputRef.current.value = '';

        } catch (err: any) {
            setResults({ success: false, message: 'שגיאה בייבוא: ' + err.message });
        } finally {
            setIsUploading(false);
        }
    };

    const clearFile = () => {
        setFile(null);
        setMapping(null);
        setRawRows([]);
        setResults(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-orange-500/20 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                    <FileSpreadsheet className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-white">ייבוא נכסים גלובלי (Excel)</h2>
                    <p className="text-xs text-slate-400">העלאת קבצים למאגר ה-Cities המשותף</p>
                </div>
            </div>

            {!file ? (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-orange-500/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all hover:bg-orange-500/5 group"
                >
                    <div className="p-4 bg-slate-800 rounded-full group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 text-slate-500 group-hover:text-orange-400" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-bold text-slate-300">לחץ להעלאת קובץ אקסל או CSV</p>
                        <p className="text-xs text-slate-500 mt-1">גרור לכאן את הקובץ או בחר מהמחשב</p>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".xlsx, .xls, .csv"
                        className="hidden"
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                        <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                            <div>
                                <p className="text-sm font-bold text-white">{file.name}</p>
                                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB | {rawRows.length} שורות זוהו</p>
                            </div>
                        </div>
                        <button
                            onClick={clearFile}
                            disabled={isUploading}
                            className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>

                    {isParsing && (
                        <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Gemini מנתח את מבנה הקובץ ומבצע מיפוי שדות...
                        </div>
                    )}

                    {mapping && !isParsing && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs font-bold text-emerald-400">מיפוי שדות אוטומטי הושלם</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {Object.entries(mapping).map(([excelKey, dbKey]) => (
                                    <div key={excelKey} className="text-[10px] bg-slate-800 px-2 py-1 rounded border border-slate-700 flex flex-col">
                                        <span className="text-slate-500">עמודה: {excelKey}</span>
                                        <span className="text-white font-bold">יעד: {dbKey}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleUpload}
                        disabled={isUploading || isParsing || !mapping}
                        className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${isUploading
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-orange-500 hover:bg-orange-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.3)]'
                            }`}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                מייבא נכסים למאגר...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                בצע ייבוא גלובלי
                            </>
                        )}
                    </button>
                </div>
            )}

            {results && (
                <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 border ${results.success
                        ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-900/20 border-red-500/30 text-red-400'
                    }`}>
                    {results.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <p className="text-sm font-medium">{results.message}</p>
                </div>
            )}
        </div>
    );
};

export default GlobalPropertyImport;
