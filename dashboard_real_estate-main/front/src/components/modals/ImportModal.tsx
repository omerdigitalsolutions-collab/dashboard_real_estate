import React, { useState, useRef } from 'react';
import {
    Upload, Table as TableIcon, CheckCircle, AlertCircle,
    X, FileSpreadsheet, Sparkles, ImagePlus, Loader2, Download, ChevronRight, ChevronLeft
} from 'lucide-react';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import {
    parseFile, validateAndTransform, importLeads, importProperties,
    importAgents, importMixed, importDeals, exportErrorsToExcel,
    EntityType, DuplicateStrategy, ValidationResult, TransformedRow,
} from '../../services/importService';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ModalEntityType = EntityType | 'mixed';

// ─── Field definitions ────────────────────────────────────────────────────────

const FIELD_OPTIONS: Record<EntityType, { key: string; label: string; required?: boolean }[]> = {
    lead: [
        { key: 'name', label: 'שם מלא', required: true },
        { key: 'phone', label: 'טלפון', required: true },
        { key: 'email', label: 'אימייל' },
        { key: 'budget', label: 'תקציב מקסימלי' },
        { key: 'city', label: 'עיר מבוקשת' },
        { key: 'notes', label: 'הערות' },
    ],
    property: [
        { key: 'address', label: 'כתובת רחוב', required: true },
        { key: 'city', label: 'עיר' },
        { key: 'type', label: 'סוג עסקה (למכירה/להשכרה)' },
        { key: 'price', label: 'מחיר', required: true },
        { key: 'rooms', label: 'מספר חדרים' },
        { key: 'kind', label: 'סוג נכס (דירת גן, פנטהוז...)' },
        { key: 'description', label: 'תיאור' },
        { key: 'notes', label: 'הערות / היסטוריית טיפול' },
    ],
    agent: [
        { key: 'name', label: 'שם מלא', required: true },
        { key: 'email', label: 'אימייל', required: true },
        { key: 'role', label: 'תפקיד (agent/admin)' },
    ],
    deal: [
        { key: 'propertyName', label: 'כתובת נכס', required: true },
        { key: 'city', label: 'עיר הנכס', required: true },
        { key: 'leadName', label: 'שם לקוח', required: true },
        { key: 'leadPhone', label: 'טלפון לקוח', required: true },
        { key: 'price', label: 'מחיר עסקה', required: true },
        { key: 'stage', label: 'שלב במכירה', required: true },
        { key: 'projectedCommission', label: 'עמלה צפויה', required: true },
        { key: 'probability', label: 'הסתברות (%)' },
        { key: 'agentName', label: 'שם סוכן' },
        { key: 'notes', label: 'הערות' },
    ],
    // Each row = 1 Lead + 1 Property; fields are split on import
    combined: [
        // Lead fields
        { key: 'name', label: 'שם בעל הנכס (ליד)', required: true },
        { key: 'phone', label: 'טלפון (ליד)', required: true },
        { key: 'email', label: 'אימייל (ליד)' },
        { key: 'notes', label: 'הערות (ליד)' },
        // Property fields
        { key: 'address', label: 'כתובת הנכס', required: true },
        { key: 'city', label: 'עיר הנכס', required: true },
        { key: 'price', label: 'מחיר', required: true },
        { key: 'type', label: 'סוג עסקה (למכירה/להשכרה)' },
        { key: 'rooms', label: 'מספר חדרים' },
        { key: 'kind', label: 'סוג נכס' },
        { key: 'description', label: 'תיאור' },
    ],
};

const ENTITY_LABELS: Record<ModalEntityType, string> = {
    lead: 'לידים (לקוחות)',
    property: 'נכסים',
    agent: 'סוכנים (צוות)',
    deal: 'עסקאות',
    mixed: 'לידים + נכסים',
    combined: 'ליד + נכס (שורה אחת)',
};

// Hebrew → field key auto-detection
const HEBREW_MAP: Record<string, string> = {
    'שם': 'name', 'שם מלא': 'name', 'שם הלקוח': 'name', 'לקוח': 'name',
    'טלפון': 'phone', 'נייד': 'phone', 'פלאפון': 'phone', 'נייד לקוח': 'phone',
    'אימייל': 'email', 'מייל': 'email', 'דואל': 'email', 'דוא"ל': 'email',
    'עיר': 'city', 'יישוב': 'city', 'שכונה': 'city',
    'כתובת': 'address', 'רחוב': 'address', 'כתובת הנכס': 'address',
    'מחיר': 'price', 'סכום': 'price', 'מחיר מבוקש': 'price', 'מחיר שיווק': 'price',
    'סוג עסקה': 'type', 'סוג מכירה': 'type', 'עסקה': 'type',
    'סוג נכס': 'kind', 'סוג': 'kind', 'סוג הנכס': 'kind', 'קטגוריה': 'kind',
    'חדרים': 'rooms', 'מספר חדרים': 'rooms',
    'קומה': 'floor', 'מספר קומה': 'floor',
    'הערות': 'notes', 'הערה': 'notes', 'היסטוריה': 'notes', 'פירוט': 'notes', 'היסטוריית טיפול': 'notes', 'הערות טיפול': 'notes',
    'תקציב': 'budget', 'תקציב מקסימלי': 'budget',
    'תפקיד': 'role', 'הרשאה': 'role',
    'תיאור': 'description', 'תיאור נכס': 'description',
    'נכס': 'propertyName', 'שם הנכס': 'propertyName', 'שם נכס': 'propertyName',
    'עמלה': 'projectedCommission', 'עמלה צפויה': 'projectedCommission',
    'שלב': 'stage', 'שלב בעסקה': 'stage',
    'סבירות': 'probability', 'אחוז סבירות': 'probability',
    'שם סוכן': 'agentName', 'סוכן': 'agentName',
    'שם לקוח': 'leadName', 'טלפון לקוח': 'leadPhone',
};

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = ['העלאה', 'מיפוי', 'אימות', 'סיום'];

function StepIndicator({ current }: { current: number }) {
    return (
        <div className="flex items-center justify-center gap-1 rtl:flex-row-reverse">
            {STEPS.map((label, i) => {
                const stepNum = i + 1;
                const done = current > stepNum;
                const active = current === stepNum;
                return (
                    <React.Fragment key={label}>
                        <div className="flex flex-col items-center gap-1">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${done ? 'bg-emerald-500 text-white' :
                                active ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                                    'bg-slate-100 text-slate-400'
                                }`}>
                                {done ? <CheckCircle size={14} /> : stepNum}
                            </div>
                            <span className={`text-[10px] font-medium hidden sm:block ${active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {label}
                            </span>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div className={`h-0.5 w-10 sm:w-16 mb-4 transition-colors ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    defaultEntityType?: EntityType;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const ImportModal: React.FC<ImportModalProps> = ({
    isOpen,
    onClose,
    defaultEntityType = 'lead',
}) => {
    const { userData } = useAuth();
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [entityType, setEntityType] = useState<ModalEntityType>(defaultEntityType);
    const [leadSubType, setLeadSubType] = useState<'buyer' | 'seller' | 'mixed'>('mixed');

    // file data
    const [rawHeaders, setRawHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<any[]>([]);

    // single-entity mapping
    const [mapping, setMapping] = useState<Record<string, string>>({});

    // mixed-mode mapping
    const [discriminatorCol, setDiscriminatorCol] = useState('');
    const [leadMapping, setLeadMapping] = useState<Record<string, string>>({});
    const [propertyMapping, setPropertyMapping] = useState<Record<string, string>>({});

    // validated rows for mixed mode (stored separately so import knows which is which)
    const [validLeadRows, setValidLeadRows] = useState<TransformedRow[]>([]);
    const [validPropertyRows, setValidPropertyRows] = useState<TransformedRow[]>([]);

    // shared state
    const [validation, setValidation] = useState<ValidationResult>({ valid: [], invalid: [] });
    const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [errorMsg, setErrorMsg] = useState('');
    const [summary, setSummary] = useState({ success: 0, failed: 0, leads: 0, properties: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await processImage(file);
        e.target.value = '';
    };

    const processImage = async (file: File) => {
        setErrorMsg('');
        setIsExtracting(true);
        try {
            // Convert file to base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onloadend = async () => {
                const base64data = reader.result as string;

                // Determine target entity type
                let targetEntity = entityType;
                if (targetEntity === 'mixed' || targetEntity === 'combined') {
                    // AI mixed extraction might be slightly complex, default to the page context or properties
                    targetEntity = defaultEntityType;
                }

                const fns = getFunctions(undefined, 'europe-west1');
                const extractAiData = httpsCallable<{ payload: string, mode: string, entityType: string }, { success: boolean, data: any[] }>(fns, 'ai-extractAiData');

                const result = await extractAiData({
                    payload: base64data,
                    mode: 'bulk',
                    entityType: targetEntity === 'lead' ? 'leads' : 'properties'
                });

                if (result.data.success && Array.isArray(result.data.data) && result.data.data.length > 0) {
                    const rows = result.data.data;
                    // Auto-generate headers from the keys of the first row
                    const headers = Object.keys(rows[0]);

                    setRawHeaders(headers);
                    setRawRows(rows);

                    // Try to auto-map based on the headers
                    setMapping(buildAutoMapping(headers, targetEntity as EntityType));
                    setDiscriminatorCol('');
                    setStep(2);
                } else {
                    setErrorMsg('ה-AI לא הצליח לזהות נתונים בתמונה. נסה תמונה ברורה יותר.');
                }
                setIsExtracting(false);
            };
            reader.onerror = () => {
                setErrorMsg('שגיאה בקריאת התמונה.');
                setIsExtracting(false);
            };
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || 'אירעה שגיאה בחילוץ הנתונים מהתמונה.');
            setIsExtracting(false);
        }
    };

    const processFile = async (file: File) => {
        setErrorMsg('');
        try {
            const { headers, rows } = await parseFile(file);
            setRawHeaders(headers);
            setRawRows(rows);

            // HYBRID LOGIC: If <= 1500 data rows and entityType is property or lead, use AI.
            if (rows.length > 0 && rows.length <= 1500 && (entityType === 'property' || entityType === 'lead')) {
                setIsExtracting(true); // Re-using isExtracting state for loading UI
                try {
                    // 1. Rebuild a lightweight CSV representation (headers + stringified rows)
                    const csvLines = [headers.join(',')];
                    rows.forEach((r: any) => {
                        const line = headers.map((h: string) => {
                            const val = r[h] ?? '';
                            return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
                        }).join(',');
                        csvLines.push(line);
                    });
                    const payloadCsv = csvLines.join('\n');

                    // 2. Call the AI Function
                    const fns = getFunctions(undefined, 'europe-west1');
                    const extractAiData = httpsCallable<{ payload: string, mode: string, entityType: string }, { success: boolean, data: any[] }>(fns, 'ai-extractAiData');

                    const targetEntity = entityType === 'property' ? 'properties' : 'leads';

                    const result = await extractAiData({
                        payload: payloadCsv,
                        mode: 'bulk',
                        entityType: targetEntity
                    });

                    if (result.data.success && Array.isArray(result.data.data)) {
                        // 3. Skip Mapping Step -> Go straight to Validation (Step 3)
                        const extractedRows = result.data.data;

                        // We must format them as ValidationResult shape
                        const validRows: TransformedRow[] = extractedRows.map(r => ({ ...r, _status: 'valid' } as TransformedRow));

                        setValidation({ valid: validRows, invalid: [] }); // Assume AI cleaned it perfectly for now
                        setStep(3);
                        setIsExtracting(false);
                        return; // Early return to completely bypass standard flow!
                    }
                } catch (aiErr: any) {
                    console.error('AI Hybrid mapping failed, falling back to traditional routing:', aiErr);
                    // Silently fall through to standard mapping if AI errors out (rate limits, context limits etc)
                }
                setIsExtracting(false);
            }

            // TRADITIONAL FALLBACK LOGIC
            if (entityType === 'mixed') {
                const { nl, np } = buildMixedMapping(headers);
                setLeadMapping(nl);
                setPropertyMapping(np);
            } else {
                setMapping(buildAutoMapping(headers, entityType as EntityType));
            }

            setDiscriminatorCol('');
            setStep(2);
        } catch (err: any) {
            setErrorMsg(err.message);
            setIsExtracting(false);
        }
    };

    const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await processFile(file);
        e.target.value = '';
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            if (file.type.startsWith('image/')) {
                await processImage(file);
            } else {
                await processFile(file);
            }
        }
    };

    const buildMixedMapping = (headers: string[]) => {
        const leadOpts = FIELD_OPTIONS.lead;
        const propOpts = FIELD_OPTIONS.property;
        const nl: Record<string, string> = {};
        const np: Record<string, string> = {};
        headers.forEach(h => {
            const clean = h.trim();
            const dictMap = HEBREW_MAP[clean] || HEBREW_MAP[clean.toLowerCase()];
            let leadMatch = leadOpts.find(o => o.key === dictMap || o.label === clean)?.key;
            let propMatch = propOpts.find(o => o.key === dictMap || o.label === clean)?.key;
            if (leadMatch) nl[h] = leadMatch; else nl[h] = `__custom__${h}`;
            if (propMatch) np[h] = propMatch; else np[h] = `__custom__${h}`;
        });
        return { nl, np };
    };

    const buildAutoMapping = (headers: string[], type: EntityType) => {
        const newMapping: Record<string, string> = {};
        const opts = FIELD_OPTIONS[type];
        headers.forEach(h => {
            const clean = h.trim();
            const dictMap = HEBREW_MAP[clean] || HEBREW_MAP[clean.toLowerCase()];
            const match = opts.find(o => o.key === dictMap || o.label === clean)?.key;
            if (match) newMapping[h] = match;
            else newMapping[h] = `__custom__${h}`;
        });
        return newMapping;
    };

    const handleAutoMap = () => {
        if (entityType === 'mixed') {
            const { nl, np } = buildMixedMapping(rawHeaders);
            setLeadMapping(nl);
            setPropertyMapping(np);
            return;
        }
        setMapping(buildAutoMapping(rawHeaders, entityType as EntityType));
    };

    const handleValidate = () => {
        setErrorMsg('');

        if (entityType === 'mixed') {
            if (!discriminatorCol) {
                setErrorMsg('בחר עמודה שמציינת את סוג השורה (ליד / נכס).');
                return;
            }
            const leadRequired = FIELD_OPTIONS.lead.filter(f => f.required).map(f => f.key);
            const missingLead = leadRequired.filter(k => !Object.values(leadMapping).includes(k));
            if (missingLead.length > 0) {
                const labels = missingLead.map(k => FIELD_OPTIONS.lead.find(f => f.key === k)?.label || k);
                setErrorMsg(`חסרים שדות חובה ללידים: ${labels.join(', ')}`);
                return;
            }
            const leadRows = rawRows.filter(r => /ליד|lead/i.test(String(r[discriminatorCol] ?? '')));
            const propRows = rawRows.filter(r => /נכס|property|דירה|בית/i.test(String(r[discriminatorCol] ?? '')));
            const lr = validateAndTransform(leadRows, leadMapping, 'lead');
            const pr = validateAndTransform(propRows, propertyMapping, 'property');
            setValidLeadRows(lr.valid);
            setValidPropertyRows(pr.valid);
            setValidation({ valid: [...lr.valid, ...pr.valid], invalid: [...lr.invalid, ...pr.invalid] });
            setStep(3);
            return;
        }

        const et = entityType as EntityType;
        const requiredKeys = FIELD_OPTIONS[et].filter(f => f.required).map(f => f.key);
        const mappedValues = Object.values(mapping).filter(Boolean);
        const missing = requiredKeys.filter(k => !mappedValues.includes(k));
        if (missing.length > 0) {
            const labels = missing.map(k => FIELD_OPTIONS[et].find(f => f.key === k)?.label || k);
            setErrorMsg(`חסר מיפוי לשדות חובה: ${labels.join(', ')}`);
            return;
        }
        const result = validateAndTransform(rawRows, mapping, et);
        setValidation(result);
        setStep(3);
    };

    const executeImport = async () => {
        if (!userData?.agencyId || !userData?.uid) {
            setErrorMsg('שגיאת מערכת: מזהה משרד חסר. נסה להתנתק ולהתחבר שוב.');
            return;
        }
        setIsProcessing(true);
        setErrorMsg('');
        setProgress({ current: 0, total: validation.valid.length });

        const onProgress = (current: number, total: number) =>
            setProgress({ current: Math.min(current, total), total });

        try {
            if (entityType === 'mixed') {
                const total = validLeadRows.length + validPropertyRows.length;
                setProgress({ current: 0, total });
                let base = 0;
                const leadCount = await importLeads(
                    userData.agencyId, userData.uid, validLeadRows, strategy,
                    (c, _t) => setProgress({ current: base + c, total })
                );
                base = validLeadRows.length;
                const propCount = await importProperties(
                    userData.agencyId, userData.uid, validPropertyRows, strategy,
                    (c, _t) => setProgress({ current: base + c, total })
                );
                setSummary({ success: leadCount + propCount, failed: validation.invalid.length, leads: leadCount, properties: propCount });
            } else if (entityType === 'lead') {
                // Apply lead sub-type override if not mixed
                const leadRows = leadSubType === 'mixed'
                    ? validation.valid
                    : validation.valid.map(r => ({ ...r, type: leadSubType }));
                const count = await importLeads(userData.agencyId, userData.uid, leadRows, strategy, onProgress);
                setSummary({ success: count, failed: validation.invalid.length, leads: count, properties: 0 });
            } else if (entityType === 'property') {
                const count = await importProperties(userData.agencyId, userData.uid, validation.valid, strategy, onProgress);
                setSummary({ success: count, failed: validation.invalid.length, leads: 0, properties: count });
            } else if (entityType === 'combined') {
                const count = await importMixed(userData.agencyId, userData.uid, validation.valid, strategy, onProgress);
                setSummary({ success: count, failed: validation.invalid.length, leads: count, properties: count });
            } else if (entityType === 'deal') {
                const count = await importDeals(userData.agencyId, userData.uid, validation.valid, strategy, onProgress);
                setSummary({ success: count, failed: validation.invalid.length, leads: count, properties: count });
            } else {
                const hasAdmin = validation.valid.some(r => r.role === 'admin');
                if (hasAdmin && !window.confirm("שימו לב: בקובץ קיימים מנהלים ('admin'). למנהל יש הרשאה מלאה לכל נתוני המשרד. האם להמשיך בייבוא מנהלים?")) {
                    return;
                }
                const res = await importAgents(userData.agencyId, validation.valid, onProgress);
                setSummary({ success: res.importedCount, failed: res.failedCount + validation.invalid.length, leads: 0, properties: 0 });
            }
            setStep(4);
        } catch (err: any) {
            if (err?.code === 'permission-denied') {
                setErrorMsg('אין לך הרשאה לייבא נתונים. פנה למנהל המשרד.');
            } else {
                setErrorMsg(err.message || 'אירעה שגיאה בלתי צפויה במהלך הייבוא.');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClose = () => {
        setStep(1);
        setRawHeaders([]); setRawRows([]);
        setMapping({}); setLeadMapping({}); setPropertyMapping({});
        setDiscriminatorCol('');
        setValidLeadRows([]); setValidPropertyRows([]);
        setValidation({ valid: [], invalid: [] });
        setStrategy('skip');
        setProgress({ current: 0, total: 0 });
        setErrorMsg('');
        setSummary({ success: 0, failed: 0, leads: 0, properties: 0 });
        setEntityType(defaultEntityType);
        setLeadSubType('mixed');
        onClose();
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const MappingTable = ({
        headers,
        currentMapping,
        onChange,
        options,
        colorClass = 'slate',
    }: {
        headers: string[];
        currentMapping: Record<string, string>;
        onChange: (h: string, val: string) => void;
        options: { key: string; label: string; required?: boolean }[];
        colorClass?: string;
    }) => (
        <div className={`border border-${colorClass}-200 rounded-xl overflow-hidden`}>
            <table className="w-full text-right text-sm">
                <thead className={`bg-${colorClass}-50 border-b border-${colorClass}-200`}>
                    <tr>
                        <th className="px-4 py-2.5 font-semibold text-slate-600 text-xs">עמודה בקובץ</th>
                        <th className="px-4 py-2.5 font-semibold text-slate-600 text-xs">שדה במערכת</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {headers.map(header => (
                        <tr key={header} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-2 text-slate-700 font-medium">
                                    <TableIcon size={13} className="text-slate-400" />
                                    {header}
                                </span>
                            </td>
                            <td className="px-4 py-2.5">
                                <select
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all font-medium"
                                    value={currentMapping[header] !== undefined ? currentMapping[header] : `__custom__${header}`}
                                    onChange={e => { setErrorMsg(''); onChange(header, e.target.value); }}
                                >
                                    <option value={`__custom__${header}`}>{header}</option>
                                    <optgroup label="שדות מערכת">
                                        {options.map(opt => (
                                            <option key={opt.key} value={opt.key}>
                                                {opt.label}{opt.required ? ' *' : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                    <option value="">— התעלם מעמודה זו —</option>
                                </select>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[999] p-4"
            dir="rtl"
            onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">

                {/* ── Header */}
                <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                            <FileSpreadsheet size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800">ייבוא נתונים מקובץ</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Excel / CSV</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* ── Step Indicator */}
                <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0">
                    <StepIndicator current={step} />
                </div>

                {/* ── Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {errorMsg && (
                        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* ─ STEP 1: Upload */}
                    {step === 1 && (
                        <div className="space-y-5">
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-3">מה מכיל הקובץ?</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {(['lead', 'property', 'deal', 'agent', 'mixed'] as ModalEntityType[]).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setEntityType(type)}
                                            className={`p-3 rounded-xl border-2 text-center text-sm font-semibold transition-all ${entityType === type
                                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                                }`}
                                        >
                                            {type === 'mixed' && <span className="block text-xs text-blue-400 mb-0.5">▲ חדש</span>}
                                            {ENTITY_LABELS[type]}
                                        </button>
                                    ))}
                                </div>
                                {entityType === 'mixed' && (
                                    <p className="text-xs text-slate-500 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                        במצב מעורב, הקובץ צריך לכלול עמודה שמציינת לכל שורה אם היא <strong>ליד</strong> או <strong>נכס</strong>.
                                    </p>
                                )}
                                {entityType === 'lead' && (
                                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                                        <p className="text-xs font-semibold text-slate-600 mb-2">סוג הלקוחות בקובץ:</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {([
                                                { val: 'buyer', label: 'מחפשי נכס', emoji: '🔍' },
                                                { val: 'seller', label: 'מוכרי נכס', emoji: '🏠' },
                                                { val: 'mixed', label: 'משולב', emoji: '🔀' },
                                            ] as const).map(({ val, label, emoji }) => (
                                                <button
                                                    key={val}
                                                    type="button"
                                                    onClick={() => setLeadSubType(val)}
                                                    className={`py-2 px-2 rounded-xl border-2 text-center text-xs font-semibold transition-all ${leadSubType === val
                                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                                                        }`}
                                                >
                                                    <span className="block text-base mb-0.5">{emoji}</span>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        {leadSubType === 'mixed' && (
                                            <p className="text-xs text-slate-400 pt-1">
                                                במצב משולב, הקובץ צריך לכלול עמודת "סוג" עם הערכים buyer / seller.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Standard Excel Box */}
                                <div
                                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/50'}`}
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                                        <FileSpreadsheet size={24} className="text-blue-600" />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-slate-700 text-sm">ייבוא קובץ טבלה</p>
                                        <p className="text-slate-400 text-xs mt-1">.xlsx, .xls, .csv</p>
                                    </div>
                                    <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileInput} />
                                </div>

                                {/* AI Image Box */}
                                <div
                                    onClick={() => { if (!isExtracting) imageInputRef.current?.click(); }}
                                    className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all ${isExtracting ? 'border-purple-300 bg-purple-50/50 cursor-not-allowed opacity-80' : 'border-purple-200 cursor-pointer hover:border-purple-400 hover:bg-purple-50/50'}`}
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center relative">
                                        {isExtracting ? (
                                            <Loader2 size={24} className="text-purple-600 animate-spin" />
                                        ) : (
                                            <>
                                                <ImagePlus size={24} className="text-purple-600" />
                                                <div className="absolute -top-1 -right-1 bg-white rounded-full">
                                                    <Sparkles size={12} className="text-purple-500" />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-slate-700 text-sm">{isExtracting ? 'מפענח תמונה...' : 'ייבוא חכם מתמונה (AI)'}</p>
                                        <p className="text-slate-400 text-xs mt-1">צילום מסך או תמונה של טבלה</p>
                                    </div>
                                    <input ref={imageInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageInput} disabled={isExtracting} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─ STEP 2: Column Mapping — Single entity */}
                    {step === 2 && entityType !== 'mixed' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">שייך עמודות לשדות במערכת</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{rawRows.length} שורות זוהו בקובץ</p>
                                </div>
                                <button onClick={handleAutoMap} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-colors">
                                    <Sparkles size={15} />
                                    זיהוי אוטומטי
                                </button>
                            </div>
                            <MappingTable
                                headers={rawHeaders}
                                currentMapping={mapping}
                                onChange={(h, v) => setMapping(prev => ({ ...prev, [h]: v }))}
                                options={FIELD_OPTIONS[entityType as EntityType]}
                            />
                            <p className="text-xs text-slate-400">* שדות חובה</p>
                        </div>
                    )}

                    {/* ─ STEP 2: Column Mapping — Mixed */}
                    {step === 2 && entityType === 'mixed' && (
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-700">מיפוי עמודות – לידים ונכסים</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{rawRows.length} שורות זוהו</p>
                                </div>
                                <button onClick={handleAutoMap} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-colors">
                                    <Sparkles size={15} />
                                    זיהוי אוטומטי
                                </button>
                            </div>

                            {/* Discriminator */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <p className="text-sm font-semibold text-amber-800 mb-2">עמודת סוג שורה <span className="text-red-500">*</span></p>
                                <select
                                    value={discriminatorCol}
                                    onChange={e => setDiscriminatorCol(e.target.value)}
                                    className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                                >
                                    <option value="">-- בחר עמודה --</option>
                                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <p className="text-xs text-amber-600 mt-1.5">ערכים מקובלים: <strong>ליד</strong> / <strong>lead</strong> לשורות לידים, <strong>נכס</strong> / <strong>property</strong> לשורות נכסים</p>
                            </div>

                            {/* Lead mapping */}
                            <div>
                                <p className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full inline-block"></span>
                                    מיפוי שדות לידים
                                </p>
                                <MappingTable
                                    headers={rawHeaders}
                                    currentMapping={leadMapping}
                                    onChange={(h, v) => setLeadMapping(prev => ({ ...prev, [h]: v }))}
                                    options={FIELD_OPTIONS.lead}
                                    colorClass="blue"
                                />
                            </div>

                            {/* Property mapping */}
                            <div>
                                <p className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block"></span>
                                    מיפוי שדות נכסים
                                </p>
                                <MappingTable
                                    headers={rawHeaders}
                                    currentMapping={propertyMapping}
                                    onChange={(h, v) => setPropertyMapping(prev => ({ ...prev, [h]: v }))}
                                    options={FIELD_OPTIONS.property}
                                    colorClass="emerald"
                                />
                            </div>
                            <p className="text-xs text-slate-400">* שדות חובה</p>
                        </div>
                    )}

                    {/* ─ STEP 3: Validation Preview */}
                    {step === 3 && (
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-emerald-700 font-bold text-2xl">{validation.valid.length}</p>
                                        <p className="text-emerald-600 text-sm font-semibold mt-0.5">שורות מוכנות לייבוא</p>
                                        {entityType === 'mixed' && (
                                            <p className="text-emerald-500 text-xs mt-0.5">{validLeadRows.length} לידים · {validPropertyRows.length} נכסים</p>
                                        )}
                                    </div>
                                    <CheckCircle size={32} className="text-emerald-400" />
                                </div>
                                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-red-700 font-bold text-2xl">{validation.invalid.length}</p>
                                        <p className="text-red-600 text-sm font-semibold mt-0.5">שורות עם שגיאות</p>
                                    </div>
                                    <AlertCircle size={32} className="text-red-400" />
                                </div>
                            </div>

                            {validation.invalid.length > 0 && (
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                                        <span className="text-sm font-semibold text-slate-700">פירוט שגיאות</span>
                                        <button onClick={() => exportErrorsToExcel(validation.invalid)} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                                            <Download size={14} />
                                            הורד קובץ שגיאות
                                        </button>
                                    </div>
                                    <ul className="max-h-36 overflow-y-auto divide-y divide-slate-100">
                                        {validation.invalid.map((inv, idx) => (
                                            <li key={idx} className="px-4 py-2.5 text-xs text-red-600 bg-red-50/30">{inv.reason}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {entityType !== 'agent' && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                                    <p className="text-sm font-semibold text-slate-700 mb-3">טיפול בכפילויות</p>
                                    {([
                                        ['skip', 'דלג על רשומות קיימות (ברירת מחדל)', 'בדיקה לפי טלפון/כתובת'],
                                        ['update', 'עדכן רשומות קיימות', 'ימזג שדות לפי מזהה ייחודי'],
                                        ['always_create', 'צור רשומה חדשה בכל מקרה', 'ללא בדיקת כפילויות'],
                                    ] as [DuplicateStrategy, string, string][]).map(([val, label, desc]) => (
                                        <label key={val} className="flex items-start gap-3 cursor-pointer group">
                                            <input type="radio" name="strategy" checked={strategy === val} onChange={() => setStrategy(val)} className="mt-0.5 text-blue-600 accent-blue-600" />
                                            <div>
                                                <p className="text-sm font-semibold text-slate-700">{label}</p>
                                                <p className="text-xs text-slate-400">{desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─ STEP 4: Done */}
                    {step === 4 && (
                        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                                <CheckCircle size={40} className="text-emerald-500" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">הייבוא הושלם!</h3>
                            {entityType === 'mixed' ? (
                                <p className="text-slate-500 text-sm">
                                    יובאו בהצלחה{' '}
                                    <span className="font-bold text-blue-600">{summary.leads}</span> לידים
                                    {' '}ו-{' '}
                                    <span className="font-bold text-emerald-600">{summary.properties}</span> נכסים.
                                </p>
                            ) : (
                                <p className="text-slate-500 text-sm">
                                    יובאו בהצלחה{' '}
                                    <span className="font-bold text-emerald-600 text-base">{summary.success}</span>{' '}
                                    {entityType === 'lead' ? 'לידים' : entityType === 'property' ? 'נכסים' : entityType === 'deal' ? 'עסקאות' : 'סוכנים'}.
                                </p>
                            )}
                            {summary.failed > 0 && (
                                <p className="text-xs text-red-500">
                                    {summary.failed} שורות נכשלו או דולגו (כפילויות / שגיאות).
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex-shrink-0 space-y-3">
                    {isProcessing && progress.total > 0 && (
                        <div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
                            </div>
                            <p className="text-xs text-slate-500 text-center mt-1.5">מעבד {progress.current} מתוך {progress.total}...</p>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                        {step === 4 ? (
                            <button onClick={handleClose} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 rounded-xl transition-colors">
                                סגור
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => step > 1 ? setStep((step - 1) as any) : handleClose()}
                                    disabled={isProcessing}
                                    className="flex items-center gap-1 px-4 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40"
                                >
                                    <ChevronRight size={16} />
                                    {step === 1 ? 'ביטול' : 'חזור'}
                                </button>

                                {step === 2 && (
                                    <button onClick={handleValidate} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-sm transition-colors">
                                        המשך לאימות
                                        <ChevronLeft size={16} />
                                    </button>
                                )}

                                {step === 3 && (
                                    <button
                                        onClick={executeImport}
                                        disabled={validation.valid.length === 0 || isProcessing}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-sm shadow-sm transition-colors min-w-[150px] justify-center"
                                    >
                                        {isProcessing ? (
                                            <span className="flex items-center gap-2">
                                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                                </svg>
                                                מייבא...
                                            </span>
                                        ) : (
                                            <>
                                                <Upload size={16} />
                                                התחל ייבוא
                                            </>
                                        )}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
