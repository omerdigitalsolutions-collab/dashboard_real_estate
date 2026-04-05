import React, { useState, useRef, useEffect } from 'react';
import {
    Upload, Table as TableIcon, CheckCircle, AlertCircle,
    X, FileSpreadsheet, Sparkles, ImagePlus, Loader2, Download, ChevronRight, ChevronLeft, Lock
} from 'lucide-react';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import {
    parseFile, validateAndTransform, importLeads, importProperties,
    importAgents, importMixed, importDeals, exportErrorsToExcel,
    EntityType, DuplicateStrategy, ValidationResult, TransformedRow,
} from '../../services/importService';
import { useSubscriptionGuard } from '../../hooks/useSubscriptionGuard';
import UpgradeModal from '../ui/UpgradeModal';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ModalEntityType = EntityType | 'mixed';

// ─── Field definitions ────────────────────────────────────────────────────────

const FIELD_OPTIONS: Record<EntityType, { key: string; label: string; required?: boolean }[]> = {
    lead: [
        { key: 'name', label: 'שם מלא', required: true },
        { key: 'phone', label: 'טלפון', required: true },
        { key: 'email', label: 'אימייל' },
        { key: 'leadType', label: 'סוג ליד (קונה/מוכר)' },
        { key: 'source', label: 'מקור הליד' },
        { key: 'budget', label: 'תקציב מקסימלי' },
        { key: 'city', label: 'עיר מבוקשת' },
        { key: 'minRooms', label: 'מינ׳ חדרים' },
        { key: 'maxRooms', label: 'מקס׳ חדרים' },
        { key: 'minSqm', label: 'מינ׳ שטח (מ"ר)' },
        { key: 'floorMin', label: 'קומה מינ׳' },
        { key: 'floorMax', label: 'קומה מקס׳' },
        { key: 'parking', label: 'חניה (כן/לא)' },
        { key: 'balcony', label: 'מרפסת (כן/לא)' },
        { key: 'safeRoom', label: 'ממ"ד (כן/לא)' },
        { key: 'elevator', label: 'מעלית (כן/לא)' },
        { key: 'urgency', label: 'דחיפות (urgent/flexible)' },
        { key: 'agentName', label: 'שם סוכן מטפל' },
        { key: 'description', label: 'תיאור / פרטים' },
        { key: 'notes', label: 'הערות' },
    ],
    property: [
        { key: 'address', label: 'כתובת רחוב', required: true },
        { key: 'city', label: 'עיר' },
        { key: 'type', label: 'סוג עסקה (למכירה/להשכרה/מסחרי)' },
        { key: 'price', label: 'מחיר', required: true },
        { key: 'rooms', label: 'מספר חדרים' },
        { key: 'kind', label: 'סוג נכס (דירת גן, פנטהוז...)' },
        { key: 'sqm', label: 'שטח (מ"ר)' },
        { key: 'floor', label: 'קומה' },
        { key: 'description', label: 'תיאור נכס' },
        { key: 'agentName', label: 'שם סוכן מטפל' },
        { key: 'isExclusive', label: 'בלעדיות (כן/לא)' },
        { key: 'listingType', label: 'סוג שיווק (exclusive/private)' },
        { key: 'exclusivityEndDate', label: 'סיום בלעדיות' },
        { key: 'status', label: 'סטטוס הנכס' },
        { key: 'condition', label: 'מצב נכס' },
        { key: 'floorsTotal', label: 'מספר קומות בבנין' },
        { key: 'hasElevator', label: 'מעלית (כן/לא)' },
        { key: 'hasParking', label: 'חניה (כן/לא)' },
        { key: 'hasBalcony', label: 'מרפסת (כן/לא)' },
        { key: 'hasSafeRoom', label: 'ממ"ד (כן/לא)' },
        { key: 'hasBars', label: 'סורגים (כן/לא)' },
        { key: 'hasAirCondition', label: 'מיזוג (כן/לא)' },
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
        { key: 'type', label: 'סוג עסקה (למכירה/להשכרה/מסחרי)' },
        { key: 'leadName', label: 'שם לקוח' },
        { key: 'leadPhone', label: 'טלפון לקוח' },
        { key: 'leadEmail', label: 'אימייל לקוח' },
        { key: 'price', label: 'מחיר עסקה', required: true },
        { key: 'stage', label: 'שלב במכירה', required: true },
        { key: 'projectedCommission', label: 'עמלה צפויה (₪ או %)', required: true },
        { key: 'probability', label: 'הסתברות (%)' },
        { key: 'agentName', label: 'שם סוכן' },
        { key: 'source', label: 'מקור' },
        { key: 'notes', label: 'הערות' },
    ],
    // Each row = 1 Lead + 1 Property; fields are split on import
    combined: [
        // Lead fields
        { key: 'name', label: 'שם בעל הנכס (ליד)', required: true },
        { key: 'phone', label: 'טלפון (ליד)', required: true },
        { key: 'email', label: 'אימייל (ליד)' },
        { key: 'leadType', label: 'סוג ליד (קונה/מוכר)' },
        { key: 'notes', label: 'הערות (ליד)' },
        // Property fields
        { key: 'address', label: 'כתובת הנכס', required: true },
        { key: 'city', label: 'עיר הנכס', required: true },
        { key: 'price', label: 'מחיר', required: true },
        { key: 'type', label: 'סוג עסקה (למכירה/להשכרה/מסחרי)' },
        { key: 'rooms', label: 'מספר חדרים' },
        { key: 'kind', label: 'סוג נכס' },
        { key: 'sqm', label: 'שטח (מ"ר)' },
        { key: 'floor', label: 'קומה' },
        { key: 'isExclusive', label: 'בלעדיות (כן/לא)' },
        { key: 'description', label: 'תיאור' },
        { key: 'agentName', label: 'סוכן מטפל' },
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

// Hebrew → field key auto-detection — comprehensive dictionary
// Covers: Israeli broker spreadsheets, yad2/madlan exports, manual CRM exports, English variants
const HEBREW_MAP: Record<string, string> = {
    // ── Name / Person ───────────────────────────────────────────────────────────
    'שם': 'name', 'שם מלא': 'name', 'שם הלקוח': 'name', 'לקוח': 'name',
    'fullname': 'name', 'full name': 'name', 'client name': 'name', 'contact': 'name', 'name': 'name',
    'שם_ליד': 'name', 'שם ליד': 'name', 'שם בעל הנכס': 'name', 'בעלים': 'name',
    'שם הבעלים': 'name', 'שם פרטי ושם משפחה': 'name', 'שם בעל': 'name',
    // ── Phone ────────────────────────────────────────────────────────────────────
    'טלפון': 'phone', 'נייד': 'phone', 'פלאפון': 'phone', 'נייד לקוח': 'phone',
    'phone': 'phone', 'mobile': 'phone', 'cell': 'phone', 'tel': 'phone', 'telephone': 'phone',
    'טל': 'phone', "טל'": 'phone', 'מספר טלפון': 'phone', 'מס טלפון': 'phone',
    'טלפון סלולרי': 'phone', 'סלולרי': 'phone', 'מספר נייד': 'phone',
    'phone number': 'phone', 'cell phone': 'phone', 'mobile number': 'phone',
    // ── Email ─────────────────────────────────────────────────────────────────────
    'אימייל': 'email', 'מייל': 'email', 'דואל': 'email', 'דוא"ל': 'email',
    'email': 'email', 'mail': 'email', 'e-mail': 'email', 'e mail': 'email',
    'כתובת מייל': 'email', 'כתובת דוא"ל': 'email',
    // ── City / Location ──────────────────────────────────────────────────────────
    'עיר': 'city', 'יישוב': 'city', 'שכונה': 'city', 'מיקום': 'city',
    'city': 'city', 'location': 'city', 'area': 'city', 'אזור': 'city', 'ישוב': 'city',
    'עיר מבוקשת': 'city', 'עיר הנכס': 'city', 'מיקום הנכס': 'city', 'עיר / ישוב': 'city',
    'neighborhood': 'city', 'area code': 'city', 'עד עיר': 'city',
    // ── Address ──────────────────────────────────────────────────────────────────
    'כתובת': 'address', 'רחוב': 'address', 'כתובת הנכס': 'address', 'כתובת מלאה': 'address',
    'address': 'address', 'street': 'address', "רח'": 'address', 'כתובת רחוב': 'address',
    'רחוב ומספר': 'address', 'כתובת ומספר': 'address', 'מספר בית': 'address',
    'house number': 'address', 'street address': 'address',
    // ── Price ────────────────────────────────────────────────────────────────────
    'מחיר': 'price', 'סכום': 'price', 'מחיר מבוקש': 'price', 'מחיר שיווק': 'price',
    'price': 'price', 'value': 'price', 'ערך': 'price', 'סכום מבוקש': 'price',
    'מחיר אסקינג': 'price', 'עלות': 'price', 'asking price': 'price', 'sale price': 'price',
    'מחיר דורשים': 'price', 'מחיר מכירה': 'price', 'שווי': 'price', 'שווי הנכס': 'price',
    'מחיר להשכרה': 'price', 'שכר דירה': 'price', 'שכ"ד': 'price',
    // ── Transaction type ─────────────────────────────────────────────────────────
    'סוג עסקה': 'type', 'סוג מכירה': 'type', 'עסקה': 'type',
    'מכירה/השכרה': 'type', 'סוג העסקה': 'type', 'מכירה / השכרה': 'type',
    'type': 'type', 'deal type': 'type', 'transaction': 'type', 'transaction type': 'type',
    'listing type': 'type', 'property for': 'type',
    // ── Property kind ────────────────────────────────────────────────────────────
    'סוג נכס': 'kind', 'סוג': 'kind', 'סוג הנכס': 'kind', 'קטגוריה': 'kind',
    'kind': 'kind', 'property type': 'kind', 'נכס סוג': 'kind', 'בניין סוג': 'kind',
    'property kind': 'kind', 'asset type': 'kind', 'סוג בניין': 'kind', 'סוג המבנה': 'kind',
    // ── Rooms ────────────────────────────────────────────────────────────────────
    'חדרים': 'rooms', 'מספר חדרים': 'rooms', 'כמות חדרים': 'rooms',
    'rooms': 'rooms', 'bedrooms': 'rooms', 'br': 'rooms',
    'num rooms': 'rooms', 'number of rooms': 'rooms', 'חד׳': 'rooms',
    // ── Min/Max Rooms (lead requirements) ────────────────────────────────────────
    'חדרים מינ': 'minRooms', 'מינ חדרים': 'minRooms', 'חדרים מינימום': 'minRooms',
    'min rooms': 'minRooms', 'minimum rooms': 'minRooms', 'חדרים לפחות': 'minRooms',
    'חדרים מקס': 'maxRooms', 'מקס חדרים': 'maxRooms', 'חדרים מקסימום': 'maxRooms',
    'max rooms': 'maxRooms', 'maximum rooms': 'maxRooms', 'עד חדרים': 'maxRooms',
    // ── Floor ────────────────────────────────────────────────────────────────────
    'קומה': 'floor', 'מספר קומה': 'floor', 'קומת הנכס': 'floor',
    'floor': 'floor', 'storey': 'floor', 'level': 'floor', 'קומה מ': 'floorMin', 'קומה עד': 'floorMax',
    'floor min': 'floorMin', 'floor max': 'floorMax',
    // ── Sqm ──────────────────────────────────────────────────────────────────────
    'שטח': 'sqm', 'מ"ר': 'sqm', 'גודל': 'sqm', 'שטח מ"ר': 'sqm',
    'שטח בנוי': 'sqm', 'שטח נטו': 'sqm', 'מ"ר בנוי': 'sqm',
    'sqm': 'sqm', 'size': 'sqm', 'area sqm': 'sqm', 'meters': 'sqm',
    'square meters': 'sqm', 'sq m': 'sqm', 'מ׳׳ר': 'sqm', 'מטר רבוע': 'sqm',
    'שטח מינ': 'minSqm', 'min sqm': 'minSqm', 'שטח מינימום': 'minSqm',
    // ── Exclusivity ──────────────────────────────────────────────────────────────
    'בלעדיות': 'isExclusive', 'בלעדי': 'isExclusive', 'exclusive': 'isExclusive',
    'האם בלעדיות': 'isExclusive', 'יש בלעדיות': 'isExclusive', 'is exclusive': 'isExclusive',
    'סיום בלעדיות': 'exclusivityEndDate', 'תאריך סיום בלעדיות': 'exclusivityEndDate',
    'תוקף בלעדיות': 'exclusivityEndDate', 'תאריך תם בלעדיות': 'exclusivityEndDate',
    'exclusivity end': 'exclusivityEndDate', 'exclusive until': 'exclusivityEndDate',
    // ── Listing type ─────────────────────────────────────────────────────────────
    'סוג שיווק': 'listingType', 'שיווק': 'listingType', 'שיווק בלעדי/פרטי': 'listingType',
    'פרטי/בלעדי': 'listingType', 'exclusive/private': 'listingType',
    // ── Notes ────────────────────────────────────────────────────────────────────
    'הערות': 'notes', 'הערה': 'notes', 'היסטוריה': 'notes', 'פירוט': 'notes',
    'היסטוריית טיפול': 'notes', 'הערות טיפול': 'notes', 'notes': 'notes', 'remarks': 'notes',
    'תגובות': 'notes', 'פרטים נוספים': 'notes', 'comments': 'notes', 'memo': 'notes',
    'info': 'notes', 'היסטוריית סוכן': 'notes', 'פירוט טיפול': 'notes',
    // ── Budget ───────────────────────────────────────────────────────────────────
    'תקציב': 'budget', 'תקציב מקסימלי': 'budget', 'budget': 'budget', 'max budget': 'budget',
    'תקציב לקוח': 'budget', 'סכום מקסימלי': 'budget', 'עד כמה': 'budget', 'יכולת כלכלית': 'budget',
    // ── Role ─────────────────────────────────────────────────────────────────────
    'תפקיד': 'role', 'הרשאה': 'role', 'role': 'role', 'permission': 'role', 'access': 'role',
    // ── Description ──────────────────────────────────────────────────────────────
    'תיאור': 'description', 'תיאור נכס': 'description', 'תאור': 'description',
    'description': 'description', 'details': 'description', 'אודות': 'description',
    'תיאור חופשי': 'description', 'פרטי הנכס': 'description',
    // ── Property name (for deals) ─────────────────────────────────────────────
    'נכס': 'propertyName', 'שם הנכס': 'propertyName', 'שם נכס': 'propertyName',
    'property name': 'propertyName', 'property': 'propertyName', 'כתובת נכס': 'propertyName',
    // ── Commission ───────────────────────────────────────────────────────────────
    'עמלה': 'projectedCommission', 'עמלה צפויה': 'projectedCommission',
    'commission': 'projectedCommission', 'projected commission': 'projectedCommission',
    'אחוז עמלה': 'projectedCommission', 'עמלה %': 'projectedCommission',
    'commission %': 'projectedCommission', 'fee': 'projectedCommission',
    // ── Stage ────────────────────────────────────────────────────────────────────
    'שלב': 'stage', 'שלב בעסקה': 'stage', 'stage': 'stage', 'סטטוס': 'stage',
    'סטטוס עסקה': 'stage', 'שלב העסקה': 'stage', 'מצב עסקה': 'stage', 'deal stage': 'stage',
    // ── Property status ──────────────────────────────────────────────────────────
    'סטטוס נכס': 'status', 'property status': 'status',
    'active': 'status', 'pending': 'status', 'sold': 'status', 'זמין': 'status', 'נמכר': 'status',
    // ── Probability ──────────────────────────────────────────────────────────────
    'סבירות': 'probability', 'אחוז סבירות': 'probability', 'probability': 'probability',
    'chance': 'probability', 'אחוז': 'probability', 'הסתברות': 'probability',
    // ── Agent ────────────────────────────────────────────────────────────────────
    'סוכן 1': 'agentName', 'שם סוכן': 'agentName', 'סוכן מטפל': 'agentName',
    'סוכן': 'agentName', 'agent': 'agentName', 'agent name': 'agentName',
    'אחראי': 'agentName', 'מטפל': 'agentName', 'שם הסוכן': 'agentName',
    'איש קשר': 'agentName', 'responsible agent': 'agentName', 'broker': 'agentName',
    'sales agent': 'agentName', 'assigned agent': 'agentName',
    // ── Lead name/phone (for deal imports) ───────────────────────────────────────
    'שם לקוח': 'leadName', 'טלפון לקוח': 'leadPhone', 'מייל לקוח': 'leadEmail',
    'lead name': 'leadName', 'buyer name': 'leadName', 'client': 'leadName',
    'buyer phone': 'leadPhone', 'client phone': 'leadPhone',
    'lead email': 'leadEmail', 'buyer email': 'leadEmail', 'client email': 'leadEmail',
    // ── Lead type (buyer/seller) ─────────────────────────────────────────────────
    'סוג ליד': 'leadType', 'סוג לקוח': 'leadType', 'קונה/מוכר': 'leadType',
    'lead type': 'leadType', 'client type': 'leadType', 'buyer or seller': 'leadType',
    // ── Source ───────────────────────────────────────────────────────────────────
    'מקור': 'source', 'מקור ליד': 'source', 'מקור לקוח': 'source',
    'source': 'source', 'lead source': 'source', 'referral source': 'source',
    'ממה': 'source', 'ממי': 'source', 'איך הגיע': 'source',
    // ── Amenities (lead requirements) ────────────────────────────────────────────
    'חניה': 'parking', 'parking': 'parking', 'מקום חנייה': 'parking',
    'מרפסת': 'balcony', 'balcony': 'balcony', 'מרפסת שמש': 'balcony',
    'ממ"ד': 'safeRoom', 'safe room': 'safeRoom', 'mamad': 'safeRoom', 'ממד': 'safeRoom',
    'מעלית': 'elevator', 'elevator': 'elevator', 'lift': 'elevator',
    'דחיפות': 'urgency', 'urgency': 'urgency', 'עד מתי': 'urgency',
    'תנאי': 'condition', 'מצב נכס מבוקש': 'condition', 'condition': 'condition',
    'מצב נכס': 'condition', 'מצב': 'condition',
    'מספר קומות': 'floorsTotal', 'קומות בבנין': 'floorsTotal', 'סה"כ קומות': 'floorsTotal',
    'סורגים': 'hasBars', 'bars': 'hasBars',
    'מיזוג': 'hasAirCondition', 'מזגן': 'hasAirCondition', 'air condition': 'hasAirCondition', 'ac': 'hasAirCondition',
};

// ─── Smart column mapping utilities ─────────────────────────────────────────

/** Levenshtein distance between two strings (used for fuzzy header matching). */
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/** Normalise header for comparison: lowercase, strip spaces/underscores/dashes. */
const normalise = (s: string) => s.toLowerCase().replace(/[\s_\-'"]/g, '');

/**
 * Attempts to match a raw Excel column header to a system field key.
 * Priority: 1) Exact HEBREW_MAP hit  2) Fuzzy HEBREW_MAP hit  3) Fallback to __custom__
 */
function smartMatchHeader(header: string, validFieldKeys: string[]): string {
    const clean = header.trim();
    const lower = clean.toLowerCase();
    const norm = normalise(clean);

    // 1. Exact dictionary hit
    const exact = HEBREW_MAP[clean] ?? HEBREW_MAP[lower];
    if (exact && validFieldKeys.includes(exact)) return exact;

    // 2. Fuzzy dictionary: find closest HEBREW_MAP key within edit distance 2
    let bestKey: string | null = null;
    let bestScore = Infinity;
    for (const dictKey of Object.keys(HEBREW_MAP)) {
        const dist = levenshtein(norm, normalise(dictKey));
        const maxLen = Math.max(norm.length, normalise(dictKey).length);
        // Similarity threshold: ≥80% similarity
        if (dist < bestScore && dist / maxLen < 0.25) {
            bestScore = dist;
            bestKey = HEBREW_MAP[dictKey];
        }
    }
    if (bestKey && validFieldKeys.includes(bestKey)) return bestKey;

    // 3. Try matching the header directly against field key names or labels
    const directMatch = validFieldKeys.find(k => normalise(k) === norm);
    if (directMatch) return directMatch;

    return `__custom__${clean}`;
}

/**
 * Improved auto-mapping using the extended HEBREW_MAP + fuzzy matching.
 * Replaces the old buildAutoMapping (simple dictionary lookup only).
 */
function buildSmartAutoMapping(headers: string[], type: EntityType): Record<string, string> {
    const opts = FIELD_OPTIONS[type];
    const validFieldKeys = opts.map(o => o.key);
    const newMapping: Record<string, string> = {};
    headers.forEach(h => {
        newMapping[h] = smartMatchHeader(h, validFieldKeys);
    });
    return newMapping;
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = ['העלאה', 'מיפוי', 'אימות', 'טיוב', 'סיום'];

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
    const { features, loading: billingLoading } = useSubscriptionGuard();
    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
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
    const [agentMapping, setAgentMapping] = useState<Record<string, string>>({});

    // validated rows for mixed mode (stored separately so import knows which is which)
    const [validLeadRows, setValidLeadRows] = useState<TransformedRow[]>([]);
    const [validPropertyRows, setValidPropertyRows] = useState<TransformedRow[]>([]);
    const [validAgentRows, setValidAgentRows] = useState<TransformedRow[]>([]);

    // shared state
    const [validation, setValidation] = useState<ValidationResult>({ valid: [], invalid: [] });
    const [resolvedRows, setResolvedRows] = useState<TransformedRow[]>([]);
    const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [errorMsg, setErrorMsg] = useState('');
    const [summary, setSummary] = useState({ success: 0, failed: 0, leads: 0, properties: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [scanningImage, setScanningImage] = useState<string | null>(null);

    // ── Handlers ──────────────────────────────────────────────────────────────

    // Listen to global paste events (to support pasting images directly from clipboard)
    useEffect(() => {
        if (!isOpen || step !== 1 || isExtracting || isProcessing) return;

        const handlePaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        if (!features.canAccessAiImport) {
                            setIsUpgradeModalOpen(true);
                        } else {
                            await processImage(file);
                        }
                        break; // Process one image at a time
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [isOpen, step, isExtracting, isProcessing, features.canAccessAiImport]);

    if (!isOpen) return null;

    // ── Handlers ──────────────────────────────────────────────────────────────


    const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!features.canAccessAiImport) {
                setIsUpgradeModalOpen(true);
            } else {
                await processImage(file);
            }
        }
        e.target.value = '';
    };

    const resizeImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1600;
                    const MAX_HEIGHT = 1600;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    };

    const processImage = async (file: File) => {
        setErrorMsg('');
        setIsExtracting(true);
        try {
            // Resize image to ensure payload size is manageable
            const base64data = await resizeImage(file);
            setScanningImage(base64data);

            // Determine target entity type
            let targetEntity = entityType;
            if (targetEntity === 'mixed' || targetEntity === 'combined') {
                targetEntity = defaultEntityType;
            }

            // Map frontend types to backend types
            const typeMap: Record<string, string> = {
                lead: 'leads',
                property: 'properties',
                deal: 'deals',
                agent: 'agents'
            };
            const backendEntityType = typeMap[targetEntity] || 'leads';

            const fns = getFunctions(undefined, 'europe-west1');
            const extractAiData = httpsCallable<{ payload: string, mode: string, entityType: string }, { success: boolean, data: any[] }>(fns, 'ai-extractAiData');

            const result = await extractAiData({
                payload: base64data,
                mode: 'bulk',
                entityType: backendEntityType
            });

            if (result.data.success && Array.isArray(result.data.data) && result.data.data.length > 0) {
                const rows = result.data.data;
                const headers = Object.keys(rows[0]);
                setRawHeaders(headers);
                setRawRows(rows);
                setMapping(buildSmartAutoMapping(headers, targetEntity as EntityType));
                setDiscriminatorCol('');
                setStep(2);
            } else {
                setErrorMsg('ה-AI לא הצליח לזהות נתונים בתמונה. נסה תמונה ברורה יותר.');
            }
        } catch (err: any) {
            console.error('Image processing error:', err);
            setErrorMsg(err.message || 'אירעה שגיאה בעיבוד התמונה.');
        } finally {
            setIsExtracting(false);
            setScanningImage(null);
        }
    };


    const processFile = async (file: File) => {
        setErrorMsg('');
        try {
            const { headers, rows } = await parseFile(file);
            setRawHeaders(headers);
            setRawRows(rows);

            // Code-based smart mapping (no AI calls needed for structured files)
            if (entityType === 'mixed') {
                const { nl, np } = buildMixedMapping(headers);
                setLeadMapping(nl);
                setPropertyMapping(np);
            } else {
                setMapping(buildSmartAutoMapping(headers, entityType as EntityType));
            }

            setDiscriminatorCol('');
            setStep(2);
        } catch (err: any) {
            setErrorMsg(err.message);
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
                if (!features.canAccessAiImport) {
                    setIsUpgradeModalOpen(true);
                } else {
                    await processImage(file);
                }
            } else {
                await processFile(file);
            }
        }
    };

    const buildMixedMapping = (headers: string[]) => {
        const leadOpts = FIELD_OPTIONS.lead;
        const propOpts = FIELD_OPTIONS.property;
        const agentOpts = FIELD_OPTIONS.agent;
        const nl: Record<string, string> = {};
        const np: Record<string, string> = {};
        const na: Record<string, string> = {};
        headers.forEach(h => {
            const clean = h.trim();
            const dictMap = HEBREW_MAP[clean] || HEBREW_MAP[clean.toLowerCase()];
            let leadMatch = leadOpts.find(o => o.key === dictMap || o.label === clean)?.key;
            let propMatch = propOpts.find(o => o.key === dictMap || o.label === clean)?.key;
            let agentMatch = agentOpts.find(o => o.key === dictMap || o.label === clean)?.key;
            if (leadMatch) nl[h] = leadMatch; else nl[h] = `__custom__${h}`;
            if (propMatch) np[h] = propMatch; else np[h] = `__custom__${h}`;
            if (agentMatch) na[h] = agentMatch; else na[h] = `__custom__${h}`;
        });
        return { nl, np, na };
    };

    const handleAutoMap = () => {
        if (entityType === 'mixed') {
            const { nl, np, na } = buildMixedMapping(rawHeaders);
            setLeadMapping(nl);
            setPropertyMapping(np);
            setAgentMapping(na);
            return;
        }
        setMapping(buildSmartAutoMapping(rawHeaders, entityType as EntityType));
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
            const agentRows = rawRows.filter(r => /סוכן|agent/i.test(String(r[discriminatorCol] ?? '')));

            const lr = validateAndTransform(leadRows, leadMapping, 'lead');
            const pr = validateAndTransform(propRows, propertyMapping, 'property');
            const ar = validateAndTransform(agentRows, agentMapping, 'agent');

            setValidLeadRows(lr.valid);
            setValidPropertyRows(pr.valid);
            setValidAgentRows(ar.valid);

            setValidation({
                valid: [...lr.valid, ...pr.valid, ...ar.valid],
                invalid: [...lr.invalid, ...pr.invalid, ...ar.invalid]
            });
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
        setResolvedRows(result.valid);
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
            const dataToImport = resolvedRows.length > 0 ? resolvedRows : validation.valid;

            if (entityType === 'mixed') {
                const leads = dataToImport.filter(r => r.rowType === 'lead');
                const properties = dataToImport.filter(r => r.rowType === 'property');
                const agents = dataToImport.filter(r => r.rowType === 'agent');

                const total = leads.length + properties.length + agents.length;
                setProgress({ current: 0, total });
                let base = 0;

                // Agents first
                let agentCount = 0;
                if (agents.length > 0) {
                    const hasAdmin = agents.some(r => r.role === 'admin');
                    let proceed = true;
                    if (hasAdmin) {
                        proceed = window.confirm("שימו לב: בקובץ (מעורב) קיימים מנהלים ('admin'). למנהל יש הרשאה מלאה לכל נתוני המשרד. האם להמשיך בייבוא מנהלים?");
                    }
                    if (proceed) {
                        const agentRes = await importAgents(
                            userData.agencyId, agents,
                            (c, _t) => setProgress({ current: base + c, total })
                        );
                        agentCount = agentRes.importedCount;
                    }
                    base += agents.length;
                }

                const leadCount = await importLeads(
                    userData.agencyId, userData.uid, leads, strategy,
                    (c, _t) => setProgress({ current: base + c, total })
                );
                base += leads.length;

                const propCount = await importProperties(
                    userData.agencyId, userData.uid, properties, strategy,
                    (c, _t) => setProgress({ current: base + c, total })
                );

                setSummary({ success: leadCount + propCount + agentCount, failed: validation.invalid.length, leads: leadCount, properties: propCount });
            } else if (entityType === 'lead') {
                const leadRows = leadSubType === 'mixed'
                    ? dataToImport
                    : dataToImport.map(r => ({ ...r, type: leadSubType }));
                const count = await importLeads(userData.agencyId, userData.uid, leadRows, strategy, onProgress);
                setSummary({ success: count, failed: validation.invalid.length, leads: count, properties: 0 });
            } else if (entityType === 'property') {
                const count = await importProperties(userData.agencyId, userData.uid, dataToImport, strategy, onProgress);
                setSummary({ success: count, failed: validation.invalid.length, leads: 0, properties: count });
            } else if (entityType === 'combined') {
                const count = await importMixed(userData.agencyId, userData.uid, dataToImport, strategy, onProgress);
                setSummary({ success: count, failed: validation.invalid.length, leads: count, properties: count });
            } else if (entityType === 'deal') {
                const count = await importDeals(userData.agencyId, userData.uid, dataToImport, strategy, onProgress);
                setSummary({ success: count, failed: validation.invalid.length, leads: count, properties: count });
            } else {
                const hasAdmin = dataToImport.some(r => r.role === 'admin');
                if (hasAdmin && !window.confirm("שימו לב: בקובץ קיימים מנהלים ('admin'). למנהל יש הרשאה מלאה לכל נתוני המשרד. האם להמשיך בייבוא מנהלים?")) {
                    return;
                }
                const res = await importAgents(userData.agencyId, dataToImport, onProgress);
                setSummary({ success: res.importedCount, failed: res.failedCount + validation.invalid.length, leads: 0, properties: 0 });
            }
            setStep(5);
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
        setMapping({}); setLeadMapping({}); setPropertyMapping({}); setAgentMapping({});
        setDiscriminatorCol('');
        setValidLeadRows([]); setValidPropertyRows([]); setValidAgentRows([]);
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
                                        במצב מעורב, הקובץ צריך לכלול עמודה שמציינת לכל שורה אם היא <strong>ליד</strong>, <strong>נכס</strong> או <strong>סוכן</strong>.
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
                                    onClick={() => {
                                        if (isExtracting) return;
                                        if (!features.canAccessAiImport) {
                                            setIsUpgradeModalOpen(true);
                                        } else {
                                            imageInputRef.current?.click();
                                        }
                                    }}
                                    className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all overflow-hidden ${isExtracting ? 'border-purple-300 bg-purple-50/50 cursor-not-allowed opacity-100' : 'border-purple-200 cursor-pointer hover:border-purple-400 hover:bg-purple-50/50'}`}
                                >
                                    {!features.canAccessAiImport && (
                                        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 text-[10px] font-black uppercase tracking-wider">
                                            <Lock size={10} />
                                            <span>Premium</span>
                                        </div>
                                    )}

                                    {/* Scanning Overlay Animation */}
                                    {isExtracting && (
                                        <div className="absolute inset-0 z-0 flex items-center justify-center">
                                            {scanningImage && (
                                                <img src={scanningImage} alt="Scanning" className="w-full h-full object-cover opacity-20 grayscale brightness-125" />
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-purple-50/80 via-transparent to-purple-50/80"></div>
                                            <div className="absolute top-0 left-0 w-full h-[3px] bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.9)] animate-scan"></div>
                                            <style>{`
                                                @keyframes scan {
                                                    0% { top: 0%; opacity: 0; }
                                                    10% { opacity: 1; }
                                                    90% { opacity: 1; }
                                                    100% { top: 100%; opacity: 0; }
                                                }
                                                .animate-scan {
                                                    animation: scan 2s linear infinite;
                                                }
                                            `}</style>
                                        </div>
                                    )}

                                    <div className="z-10 w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center relative">
                                        {isExtracting ? (
                                            <Loader2 size={24} className="text-purple-600 animate-spin" />
                                        ) : (
                                            <>
                                                <ImagePlus size={24} className="text-purple-600" />
                                                <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 border border-purple-100 shadow-sm">
                                                    <Sparkles size={10} className="text-purple-500" />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="z-10 text-center">
                                        <p className="font-bold text-slate-700 text-sm">
                                            {isExtracting ? 'מפענח תמונה באמצעות AI...' : 'ייבוא חכם מתמונה (AI)'}
                                        </p>
                                        <p className="text-slate-400 text-xs mt-1">צילום מסך, תמונת טופס או כתב יד</p>
                                    </div>
                                    <input ref={imageInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageInput} disabled={isExtracting} />
                                    
                                    {isExtracting && (
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setIsExtracting(false); setScanningImage(null); }}
                                            className="z-20 mt-2 text-[10px] font-bold text-purple-600 hover:text-purple-800 underline underline-offset-2"
                                        >
                                            ביטול פעולה
                                        </button>
                                    )}
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
                                <div className="flex items-center gap-2">
                                    <button onClick={handleAutoMap} className="flex items-center gap-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors">
                                        <TableIcon size={15} />
                                        זיהוי שדות אוטומטי
                                    </button>
                                </div>
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
                                <div className="flex items-center gap-2">
                                    <button onClick={handleAutoMap} className="flex items-center gap-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors">
                                        <TableIcon size={15} />
                                        זיהוי שדות אוטומטי
                                    </button>
                                </div>
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
                                <p className="text-xs text-amber-600 mt-1.5">ערכים מקובלים: <strong>ליד</strong> / <strong>lead</strong> , <strong>נכס</strong> / <strong>property</strong>, <strong>סוכן</strong> / <strong>agent</strong></p>
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

                            {/* Agent mapping */}
                            <div>
                                <p className="text-sm font-semibold text-purple-700 mb-2 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 bg-purple-500 rounded-full inline-block"></span>
                                    מיפוי שדות סוכנים
                                </p>
                                <MappingTable
                                    headers={rawHeaders}
                                    currentMapping={agentMapping}
                                    onChange={(h, v) => setAgentMapping(prev => ({ ...prev, [h]: v }))}
                                    options={FIELD_OPTIONS.agent}
                                    colorClass="purple"
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
                                            <p className="text-emerald-500 text-xs mt-0.5">{validLeadRows.length} לידים · {validPropertyRows.length} נכסים{validAgentRows.length > 0 ? ` · ${validAgentRows.length} סוכנים` : ''}</p>
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

                    {/* ─ STEP 4: Resolution */}
                    {step === 4 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                <Sparkles size={18} className="text-blue-600 flex-shrink-0" />
                                <p className="text-xs text-blue-800 leading-relaxed font-medium">
                                    המערכת זיהתה נכסים. תוכל לשייך כל אחד מהם למשרד שלך (בלעדיות), למשרד אחר (שת"פ) או להגדיר כפרטי.
                                </p>
                            </div>

                            <ResolutionTable
                                rows={resolvedRows}
                                onChange={(idx, updates) => {
                                    const newRows = [...resolvedRows];
                                    newRows[idx] = { ...newRows[idx], ...updates };
                                    setResolvedRows(newRows);
                                }}
                            />
                        </div>
                    )}

                    {/* ─ STEP 5: Done */}
                    {step === 5 && (
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
                        {step === 5 ? (
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
                                        onClick={() => {
                                            const hasProperties = entityType === 'property' || entityType === 'combined' || entityType === 'mixed' || entityType === 'deal';
                                            if (hasProperties) {
                                                setStep(4);
                                            } else {
                                                executeImport();
                                            }
                                        }}
                                        disabled={validation.valid.length === 0 || isProcessing}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-xl text-sm shadow-sm transition-colors min-w-[150px] justify-center"
                                    >
                                        המשך לשלב הטיוב
                                        <ChevronLeft size={16} />
                                    </button>
                                )}

                                {step === 4 && (
                                    <button
                                        onClick={executeImport}
                                        disabled={resolvedRows.length === 0 || isProcessing}
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

            <UpgradeModal
                isOpen={isUpgradeModalOpen}
                onClose={() => setIsUpgradeModalOpen(false)}
                featureName="ייבוא חכם מתמונה (AI)"
            />
        </div>
    );
};

// ─── Resolution Table (Refining property sources) ───────────────────────────

interface ResolutionTableProps {
    rows: TransformedRow[];
    onChange: (idx: number, updates: Partial<TransformedRow>) => void;
}

const ResolutionTable: React.FC<ResolutionTableProps> = ({ rows, onChange }) => {
    return (
        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 text-slate-500 font-semibold w-2/5">נכס</th>
                        <th className="px-3 py-2 text-slate-500 font-semibold">סוג שיווק</th>
                        <th className="px-3 py-2 text-slate-500 font-semibold">פרטי משרד אחר</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => {
                        // For combined/mixed, only show properties
                        if (row.rowType && row.rowType !== 'property') return null;

                        return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-3 py-3 font-medium text-slate-700">
                                    <div className="flex flex-col">
                                        <span>{row.address || row.propertyName || 'ללא כתובת'}</span>
                                        <span className="text-[10px] text-slate-400">{row.city || ''}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <select
                                        value={row.listingType || 'exclusive'}
                                        onChange={(e) => onChange(idx, {
                                            listingType: e.target.value as any,
                                            isExclusive: e.target.value === 'exclusive'
                                        })}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        <option value="exclusive">בלעדיות המשרד</option>
                                        <option value="external">שת"פ (משרד אחר)</option>
                                        <option value="private">פרטי</option>
                                    </select>
                                </td>
                                <td className="px-3 py-3">
                                    {row.listingType === 'external' ? (
                                        <div className="flex flex-col gap-1.5">
                                            <input
                                                placeholder="שם משרד"
                                                value={row.externalAgencyName || ''}
                                                onChange={(e) => onChange(idx, { externalAgencyName: e.target.value })}
                                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                            />
                                            <input
                                                placeholder="שם איש קשר"
                                                value={row.externalContactName || ''}
                                                onChange={(e) => onChange(idx, { externalContactName: e.target.value })}
                                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                            />
                                        </div>
                                    ) : (
                                        <span className="text-slate-300 italic">—</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default ImportModal;
