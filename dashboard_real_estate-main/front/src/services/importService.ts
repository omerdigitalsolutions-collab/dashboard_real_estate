import * as XLSX from 'xlsx';
import {
    collection,
    query,
    where,
    getDocs,
    writeBatch,
    doc,
    updateDoc,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { inviteAgent } from './teamService';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType = 'lead' | 'property' | 'agent' | 'combined' | 'deal';
export type DuplicateStrategy = 'skip' | 'update' | 'always_create';

export interface TransformedRow {
    [key: string]: any;
}

export interface InvalidRow {
    row: TransformedRow;
    reason: string;
}

export interface ValidationResult {
    valid: TransformedRow[];
    invalid: InvalidRow[];
}

export type ProgressCallback = (current: number, total: number) => void;

// ─── Parse ────────────────────────────────────────────────────────────────────

/**
 * Reads an Excel or CSV file using SheetJS and returns headers + raw rows.
 */
export async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target!.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
                    defval: '',
                    raw: false,
                });

                if (rows.length === 0) {
                    reject(new Error('הקובץ ריק או שאינו מכיל שורות נתונים.'));
                    return;
                }

                const headers = Object.keys(rows[0]);
                resolve({ headers, rows });
            } catch {
                reject(new Error('קובץ לא תקין. אנא ודא שמדובר בקובץ Excel או CSV תקני.'));
            }
        };
        reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ.'));
        reader.readAsArrayBuffer(file);
    });
}

// ─── Generic Value Helpers ────────────────────────────────────────────────────

/**
 * Normalizes Israeli phone numbers from any common format.
 * Handles: +972, 00972, 0972, international formatting, dashes, spaces.
 * Output: 10-digit Israeli format (e.g. 0501234567)
 */
export function normalizePhone(raw: string | number): string {
    let s = String(raw ?? '').trim();
    // Strip all non-digit chars first
    const digits = s.replace(/\D/g, '');

    // Handle country code prefixes: +972, 00972, 972 (without leading 0)
    if (digits.startsWith('972') && digits.length >= 12) {
        // International format: 972501234567 → 0501234567
        return '0' + digits.slice(3);
    }
    if (digits.startsWith('00972')) {
        return '0' + digits.slice(5);
    }

    // Remove any leading 0 prefix and re-add single leading 0
    // e.g. "00501234567" → "0501234567"
    const normalized = digits.replace(/^0+/, '0');
    return normalized.length >= 9 ? normalized : digits; // fallback to original digits if too short
}

/**
 * Parses a monetary value string into a number.
 * Handles: ₪, $, €, K/M suffixes, European decimal formats (1.500.000 or 1,500,000)
 */
export function parseMoney(raw: string | number | undefined): number | null {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'number') return isNaN(raw) ? null : raw;

    let s = String(raw).trim();

    // Handle shorthand: 1.5M, 2.3K
    const shorthand = s.match(/^[\d.,]+\s*([KkMm])$/);
    if (shorthand) {
        const num = parseFloat(s.replace(/[KkMm]/g, '').replace(/,/g, '.'));
        const mult = shorthand[1].toLowerCase() === 'm' ? 1_000_000 : 1_000;
        return isNaN(num) ? null : Math.round(num * mult);
    }

    // Strip currency symbols, whitespace, RTL marks
    s = s.replace(/[₪$€£\u200E\u200F\u202A-\u202E]/g, '').trim();

    // Determine if using European format (1.500.000 or 1.500,00 style)
    const dotCount = (s.match(/\./g) || []).length;
    const commaCount = (s.match(/,/g) || []).length;

    if (dotCount > 1) {
        // e.g. 1.500.000 — dots are thousands separators
        s = s.replace(/\./g, '');
    } else if (commaCount > 1) {
        // e.g. 1,500,000 — commas are thousands separators
        s = s.replace(/,/g, '');
    } else if (dotCount === 1 && commaCount === 1) {
        // e.g. 1.500,00 (EU) or 1,500.00 (US)
        const dotPos = s.indexOf('.');
        const commaPos = s.indexOf(',');
        if (dotPos < commaPos) {
            // EU: dot is thousands sep, comma is decimal
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // US: comma is thousands sep, dot is decimal
            s = s.replace(/,/g, '');
        }
    } else {
        // Single separator — just strip commas (likely thousands)
        s = s.replace(/,/g, '');
    }

    const num = parseFloat(s);
    return isNaN(num) ? null : num;
}

/**
 * Parses boolean-ish string/number values.
 * "כן", "yes", "true", "1", 1 → true
 * "לא", "no", "false", "0", 0 → false
 * Returns undefined for unrecognized values (caller decides default).
 */
export function parseBooleanish(raw: string | number | boolean | undefined): boolean | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    const s = String(raw).trim().toLowerCase();
    if (['כן', 'yes', 'true', '1', 'v', '✓', 'כן ✓'].includes(s)) return true;
    if (['לא', 'no', 'false', '0', 'x', '✗'].includes(s)) return false;
    return undefined;
}


// ─── Validate & Transform ─────────────────────────────────────────────────────

const REQUIRED_FIELDS: Record<EntityType, string[]> = {
    lead: ['name', 'phone'],
    property: ['address', 'price'],
    agent: ['name', 'email'],
    combined: ['name', 'phone', 'address', 'price'],
    deal: ['propertyName', 'price', 'stage', 'projectedCommission'],
};

const VALID_PROPERTY_TYPES = [
    'sale', 'rent', 'commercial',
    'למכירה', 'להשכרה', 'מכירה', 'השכרה', 'מסחרי', 'מסחר',
    'for sale', 'rental', 'מכירה', 'שכירות', 'שכ"ד',
    'חנות', 'משרד', 'תעשייה', 'קליניקה', 'מחסן',
];
const PROPERTY_TYPE_MAP: Record<string, 'sale' | 'rent' | 'commercial'> = {
    // Sale
    'למכירה': 'sale', 'מכירה': 'sale', 'for sale': 'sale', 'sale': 'sale',
    // Rent
    'להשכרה': 'rent', 'השכרה': 'rent', 'rental': 'rent', 'rent': 'rent',
    'שכירות': 'rent', 'שכ"ד': 'rent', 'שכד': 'rent',
    // Commercial
    'מסחרי': 'commercial', 'commercial': 'commercial', 'מסחר': 'commercial',
    'חנות': 'commercial', 'משרד': 'commercial', 'תעשייה': 'commercial',
    'קליניקה': 'commercial', 'מחסן': 'commercial', 'office': 'commercial',
    'shop': 'commercial', 'industrial': 'commercial', 'warehouse': 'commercial',
};

/** Infer property type from 'kind' or 'address' if not set explicitly. */
function inferPropertyType(kind: string, address: string): 'sale' | 'rent' | 'commercial' {
    const combined = `${kind} ${address}`.toLowerCase();
    const commercialKeywords = ['חנות', 'משרד', 'מסחר', 'תעשייה', 'קליניקה', 'מחסן', 'office', 'shop', 'industrial', 'warehouse', 'מרלו"ג'];
    const rentKeywords = ['להשכרה', 'השכרה', 'שכירות', 'שכ"ד', 'rent', 'rental'];
    if (commercialKeywords.some(k => combined.includes(k))) return 'commercial';
    if (rentKeywords.some(k => combined.includes(k))) return 'rent';
    return 'sale';
}

const LISTING_TYPE_MAP: Record<string, 'exclusive' | 'external' | 'private'> = {
    'exclusive': 'exclusive', 'בלעדיות': 'exclusive', 'בלעדי': 'exclusive', 'בלעדי המשרד': 'exclusive',
    'external': 'external', 'שת"פ': 'external', 'משרד אחר': 'external', 'שיתוף פעולה': 'external', 'שיתוף': 'external',
    'private': 'private', 'פרטי': 'private', 'רגיל': 'private'
};

// Comprehensive Hebrew + English stage name mapping
const STAGE_MAP: Record<string, string> = {
    // English keys
    'qualification': 'qualification', 'lead': 'qualification', 'new': 'qualification',
    'viewing': 'viewing', 'visit': 'viewing', 'tour': 'viewing', 'showing': 'viewing',
    'offer': 'offer', 'proposal': 'offer', 'bid': 'offer',
    'negotiation': 'negotiation', 'negotiating': 'negotiation', 'counter': 'negotiation',
    'contract': 'contract', 'signing': 'contract', 'closing': 'contract', 'due diligence': 'contract',
    'won': 'won', 'closed': 'won', 'sold': 'won', 'complete': 'won', 'completed': 'won',
    'lost': 'lost', 'failed': 'lost', 'cancelled': 'lost', 'canceled': 'lost',
    // Hebrew keys – general
    'הכשרה ראשונית': 'qualification', 'ראשוני': 'qualification', 'בירור צרכים': 'qualification', 'כישורים': 'qualification',
    'טיפול ראשוני': 'qualification', 'ליד חדש': 'qualification', 'חדש': 'qualification',
    'ביקור': 'viewing', 'סיור': 'viewing', 'תצפית': 'viewing', 'הצגת הנכס': 'viewing',
    'הגשת הצעה': 'offer', 'הצעה': 'offer', 'הצעת מחיר': 'offer',
    'משא ומתן': 'negotiation', 'ניגוציאציה': 'negotiation', 'מו"מ': 'negotiation', 'ניהול מו"מ': 'negotiation', 'ניהול מו׳׳מ': 'negotiation',
    'חוזה': 'contract', 'חתימה': 'contract', 'סגירה': 'contract', 'טיפול בחוזה': 'contract', 'בדיקת נאותות': 'contract',
    'נסגר': 'won', 'הושלם': 'won', 'זכייה': 'won', 'עסקה נסגרה': 'won', 'נחתם': 'won',
    'אבוד': 'lost', 'נכשל': 'lost', 'ביטול': 'lost', 'בוטל': 'lost', 'לא רלוונטי': 'lost',
};

// Source value normalizations
const SOURCE_MAP: Record<string, string> = {
    'יד2': 'yad2', 'יד 2': 'yad2', 'yad2': 'yad2',
    'מדלן': 'madlan', 'madlan': 'madlan',
    'הומלי': 'homely', 'homely': 'homely',
    'ווינ': 'waze', 'גוגל': 'google', 'google': 'google',
    'פייסבוק': 'facebook', 'facebook': 'facebook',
    'אינסטגרם': 'instagram', 'instagram': 'instagram',
    'פה לפה': 'referral', 'המלצה': 'referral', 'referral': 'referral',
    'ייבוא': 'ייבוא', 'import': 'ייבוא', 'excel': 'אקסל',
    'ידני': 'manual', 'manual': 'manual',
    'טלפון': 'phone_call', 'שיחה': 'phone_call',
};

/**
 * Applies the user-defined column mapping to raw rows, then validates each row.
 */
export function validateAndTransform(
    rows: Record<string, any>[],
    mapping: Record<string, string>,
    entityType: EntityType
): ValidationResult {
    const valid: TransformedRow[] = [];
    const invalid: InvalidRow[] = [];
    const required = REQUIRED_FIELDS[entityType];

    rows.forEach((rawRow, idx) => {
        const transformed: TransformedRow = {};
        const customData: Record<string, any> = {};

        // Apply mapping
        for (const [excelCol, firestoreField] of Object.entries(mapping)) {
            const val = rawRow[excelCol];
            if (firestoreField && val !== undefined && val !== null && val !== '') {
                if (firestoreField.startsWith('__custom__')) {
                    const customKey = firestoreField.substring(10); // remove __custom__
                    customData[customKey] = val;
                } else if (firestoreField === 'address' && transformed[firestoreField]) {
                    // Smart join for address parts (e.g. Street Name + House Number)
                    transformed[firestoreField] = `${transformed[firestoreField]} ${val}`;
                } else if ((firestoreField === 'description' || firestoreField === 'notes') && transformed[firestoreField]) {
                    // Join multiple description/notes columns with newline
                    transformed[firestoreField] = `${transformed[firestoreField]}\n${val}`;
                } else {
                    transformed[firestoreField] = val;
                }
            }
        }

        if (Object.keys(customData).length > 0) {
            transformed.customData = customData;
        }

        // Validate required fields
        const missingFields = required.filter(
            (f) => !transformed[f] || String(transformed[f]).trim() === ''
        );
        if (missingFields.length > 0) {
            const labels: Record<string, string> = {
                name: 'שם', phone: 'טלפון', email: 'אימייל',
                address: 'כתובת', city: 'עיר', type: 'סוג נכס', price: 'מחיר',
                propertyName: 'כתובת נכס/שם נכס', stage: 'שלב עסקה', projectedCommission: 'עמלה צפויה',
                leadName: 'שם לקוח', leadPhone: 'טלפון לקוח',
            };
            invalid.push({
                row: rawRow,
                reason: `שורה ${idx + 2}: חסרים שדות חובה — ${missingFields.map(f => labels[f] || f).join(', ')}`,
            });
            return;
        }

        // Entity-specific validation
        if (entityType === 'property' || entityType === 'combined') {
            const rawPrice = transformed['price'];
            const price = parseMoney(rawPrice);
            if (price === null || price <= 0) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: מחיר לא תקין — "${rawPrice}"` });
                return;
            }
            transformed['price'] = price;

            // type (sale/rent/commercial) — auto-detect from 'סוג עסקה' column, then infer from kind/address
            const rawType = String(transformed['type'] || '').trim().toLowerCase();
            if (rawType && PROPERTY_TYPE_MAP[rawType]) {
                // Exact match in keyword map (e.g. 'מכירה', 'להשכרה', 'מסחרי', 'חנות')
                transformed['type'] = PROPERTY_TYPE_MAP[rawType];
            } else if (rawType && VALID_PROPERTY_TYPES.includes(rawType)) {
                transformed['type'] = PROPERTY_TYPE_MAP[rawType.toLowerCase()] ?? 'sale';
            } else {
                // If type field contains a building category (e.g. "דירה"), move it to kind
                if (rawType && !transformed['kind']) {
                    transformed['kind'] = rawType;
                }
                // Infer from kind + address before falling back to 'sale'
                const kindStr = String(transformed['kind'] || '').trim();
                const addrStr = String(transformed['address'] || '').trim();
                transformed['type'] = inferPropertyType(kindStr, addrStr);
            }

            // kind — free-text (e.g. דירה, פנטהאוז, דירת גן)
            transformed['kind'] = transformed['kind'] ? String(transformed['kind']).trim() : 'דירה';

            if (transformed['rooms']) {
                const rooms = parseFloat(String(transformed['rooms']));
                transformed['rooms'] = isNaN(rooms) ? undefined : rooms;
            }
            if (transformed['floor']) {
                const floor = parseFloat(String(transformed['floor']).replace(/[^\d.-]/g, ''));
                transformed['floor'] = isNaN(floor) ? undefined : floor;
            }
            if (transformed['sqm']) {
                const sqm = parseMoney(transformed['sqm']);
                transformed['sqm'] = sqm ?? undefined;
            }
            // Cast notes to string — Excel might parse free-text as a date or number
            transformed['notes'] = transformed['notes'] !== undefined && transformed['notes'] !== ''
                ? String(transformed['notes']).trim()
                : null;

            // isExclusive — parse booleanish values
            const rawExclusive = transformed['isExclusive'];
            if (rawExclusive !== undefined && rawExclusive !== '') {
                const parsed = parseBooleanish(rawExclusive);
                transformed['isExclusive'] = parsed !== undefined ? parsed : true; // default exclusive
            } else {
                transformed['isExclusive'] = true;
            }

            // Parse new amenity and metadata fields
            const parseBool = (key: string) => {
                if (transformed[key] !== undefined && transformed[key] !== '') {
                    transformed[key] = !!parseBooleanish(transformed[key]);
                }
            };
            parseBool('hasElevator');
            parseBool('hasParking');
            parseBool('hasBalcony');
            parseBool('hasSafeRoom');
            parseBool('hasBars');
            parseBool('hasAirCondition');

            if (transformed['condition']) {
                transformed['condition'] = String(transformed['condition']).trim();
            }
            if (transformed['floorsTotal']) {
                const floors = parseInt(String(transformed['floorsTotal']).replace(/[^\d]/g, ''), 10);
                transformed['floorsTotal'] = isNaN(floors) ? undefined : floors;
            }

            // Normalize listingType
            const rawListing = String(transformed['listingType'] || '').trim().toLowerCase();
            if (rawListing && LISTING_TYPE_MAP[rawListing]) {
                transformed['listingType'] = LISTING_TYPE_MAP[rawListing];
            }
            if (transformed['listingType'] === 'private' || transformed['listingType'] === 'external') {
                transformed['isExclusive'] = false;
            }
        }

        if (entityType === 'lead' || entityType === 'combined') {
            // Normalize phone number
            transformed['phone'] = normalizePhone(transformed['phone'] || '');

            if (entityType !== 'combined') {
                transformed['notes'] = transformed['notes'] !== undefined && transformed['notes'] !== ''
                    ? String(transformed['notes']).trim()
                    : null;
            }

            // Normalize lead type (buyer/seller) from Hebrew or English
            const fallbackType = entityType === 'combined' ? 'seller' : 'buyer';
            const rawLeadType = String(transformed['leadType'] || transformed['type'] || '').trim().toLowerCase();
            const LEAD_TYPE_MAP: Record<string, 'buyer' | 'seller'> = {
                'buyer': 'buyer', 'קונה': 'buyer', 'מחפש': 'buyer', 'מחפש נכס': 'buyer',
                'לקוח': 'buyer', 'מתעניין': 'buyer', 'רוכש': 'buyer',
                'seller': 'seller', 'מוכר': 'seller', 'מוכר נכס': 'seller',
                'בעל נכס': 'seller', 'בעלנכס': 'seller',
            };
            if (entityType === 'combined') {
                transformed['leadTypeOverride'] = LEAD_TYPE_MAP[rawLeadType] ?? fallbackType;
            } else {
                transformed['type'] = LEAD_TYPE_MAP[rawLeadType] ?? fallbackType;
            }

            // Parse budget — stored in requirements.maxBudget
            if (transformed['budget']) {
                const budget = parseMoney(transformed['budget']);
                transformed['budget'] = budget ?? undefined;
            }
            // Parse minRooms / maxRooms
            if (transformed['minRooms']) {
                const r = parseFloat(String(transformed['minRooms']));
                transformed['minRooms'] = isNaN(r) ? undefined : r;
            }
            if (transformed['maxRooms']) {
                const r = parseFloat(String(transformed['maxRooms']));
                transformed['maxRooms'] = isNaN(r) ? undefined : r;
            }

            // Normalize source
            if (transformed['source']) {
                const rawSource = String(transformed['source']).trim().toLowerCase();
                transformed['source'] = SOURCE_MAP[rawSource] ?? SOURCE_MAP[String(transformed['source']).trim()] ?? rawSource;
            }
        }

        if (entityType === 'agent') {
            const email = String(transformed['email']).trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: כתובת אימייל לא תקינה — "${email}"` });
                return;
            }
            transformed['email'] = email;
            if (!transformed['role'] || !['admin', 'agent'].includes(transformed['role'])) {
                transformed['role'] = 'agent';
            }
        }

        if (entityType === 'deal') {
            // price — must be positive number
            const rawPrice = transformed['price'];
            const price = parseMoney(rawPrice);
            if (price === null || price <= 0) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: מחיר לא תקין — "${rawPrice}"` });
                return;
            }
            transformed['price'] = price;

            // projectedCommission — can be either an absolute value or a percentage (auto-detect)
            const rawComm = transformed['projectedCommission'];
            let commission = parseMoney(rawComm);
            if (commission === null || commission < 0) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: עמלה לא תקינה — "${rawComm}"` });
                return;
            }
            // If commission value looks like a percentage (≤100), compute the actual amount
            if (commission <= 100 && price > 0) {
                commission = (price * commission) / 100;
            }
            transformed['projectedCommission'] = commission;

            // stage — normalize to DealStage values
            const rawStage = String(transformed['stage'] || '').trim();
            if (!rawStage) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: שלב עסקה חסר` });
                return;
            }
            transformed['stage'] = STAGE_MAP[rawStage.toLowerCase()] ?? STAGE_MAP[rawStage] ?? 'qualification';

            // probability — optional 0-100
            if (transformed['probability'] !== undefined && transformed['probability'] !== '') {
                const prob = parseFloat(String(transformed['probability']).replace(/[%\s]/g, ''));
                transformed['probability'] = isNaN(prob) ? undefined : Math.min(100, Math.max(0, prob));
            }

            // Deal type (sale/rent/commercial) for the generated property
            const rawType = String(transformed['type'] || '').trim().toLowerCase();
            if (rawType && VALID_PROPERTY_TYPES.includes(rawType)) {
                transformed['type'] = PROPERTY_TYPE_MAP[rawType] ?? PROPERTY_TYPE_MAP[rawType.toLowerCase()] ?? 'sale';
            } else {
                transformed['type'] = 'sale';
            }

            // Normalize leadPhone
            if (transformed['leadPhone']) {
                transformed['leadPhone'] = normalizePhone(transformed['leadPhone']);
            }
        }

        valid.push(transformed);
    });

    return { valid, invalid };
}

// ─── Batch Helpers ────────────────────────────────────────────────────────────

const BATCH_SIZE = 400;

async function getBatchChunks<T>(items: T[]): Promise<T[][]> {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        chunks.push(items.slice(i, i + BATCH_SIZE));
    }
    return chunks;
}

async function geocodeAddress(address?: string, city?: string): Promise<{ lat: number, lng: number, formatted: string } | null> {
    if (!address) return null;
    try {
        const fullAddress = `${address}${city ? `, ${city}` : ''}`;
        const functions = getFunctions(undefined, 'europe-west1');
        const getCoords = httpsCallable<{ address: string }, { lat: number, lng: number, formattedAddress: string }>(functions, 'properties-getCoordinates');
        
        const result = await getCoords({ address: fullAddress });
        if (result.data) {
            return {
                lat: result.data.lat,
                lng: result.data.lng,
                formatted: result.data.formattedAddress
            };
        }
    } catch (error) {
        console.error('Geocoding error via Cloud Function:', error);
    }
    return null;
}

// ─── Shared: Agent lookup map ─────────────────────────────────────────────────

async function buildAgentMap(agencyId: string): Promise<Map<string, string>> {
    const snap = await getDocs(query(collection(db, 'users'), where('agencyId', '==', agencyId)));
    const agentMap = new Map<string, string>();
    snap.docs.forEach((d) => {
        const data = d.data();
        if (data.name) agentMap.set(String(data.name).trim().toLowerCase(), d.id);
        if (data.email) agentMap.set(String(data.email).trim().toLowerCase(), d.id);
    });
    return agentMap;
}

function resolveAgent(row: TransformedRow, agentMap: Map<string, string>, fallback: string): string {
    // 1. Try resolving by email (most precise)
    if (row.agentEmail) {
        const email = String(row.agentEmail).trim().toLowerCase();
        if (agentMap.has(email)) return agentMap.get(email)!;
    }
    // 2. Try resolving by name
    if (row.agentName) {
        const name = String(row.agentName).trim().toLowerCase();
        if (agentMap.has(name)) return agentMap.get(name)!;
    }
    return fallback;
}

// ─── Shared: Property defaults builder ───────────────────────────────────────

function buildPropertyDefaults(
    row: TransformedRow,
    agencyId: string,
    agentId: string,
    createdBy: string,
    extra?: Partial<Record<string, any>>
): Record<string, any> {
    const lat = extra?.lat || null;
    const lng = extra?.lng || null;
    return {
        agencyId,
        transactionType: row.type === 'rent' ? 'rent' : 'forsale',
        propertyType: row.kind || 'דירה',
        status: extra?.status || 'active',
        rooms: row.rooms ?? null,
        floor: row.floor ?? null,
        squareMeters: row.sqm ?? null,
        address: {
            city: row.city || 'לא צויינה עיר',
            fullAddress: row.address || row.propertyName || 'לא צויין רחוב',
            neighborhood: row.neighborhood || null,
            ...(lat && lng ? { coords: { lat, lng } } : {}),
        },
        features: {
            hasElevator: row.hasElevator ?? null,
            hasParking: row.hasParking ?? null,
            hasBalcony: row.hasBalcony ?? null,
            hasMamad: row.hasSafeRoom ?? null,
            hasAirConditioning: row.hasAirCondition ?? null,
        },
        financials: { price: row.price || 1 },
        media: { images: [] },
        management: {
            assignedAgentId: agentId,
            descriptions: row.description ? String(row.description).trim() : null,
        },
        isExclusive: row.isExclusive !== undefined ? !!row.isExclusive : true,
        listingType: row.listingType || (row.isExclusive === false ? 'private' : 'exclusive'),
        exclusivityEndDate: row.exclusivityEndDate
            ? (typeof row.exclusivityEndDate === 'string'
                ? Timestamp.fromDate(new Date(row.exclusivityEndDate))
                : row.exclusivityEndDate)
            : null,
        createdBy,
        notes: row.notes ? String(row.notes).trim() : null,
        ...(row.customData ? { customData: row.customData } : {}),
        condition: row.condition || null,
        totalFloors: row.floorsTotal ?? null,
        externalAgencyName: row.externalAgencyName || null,
        externalContactName: row.externalContactName || null,
        createdAt: serverTimestamp(),
        ...extra,
    };
}

// ─── Import Leads ─────────────────────────────────────────────────────────────

export async function importLeads(
    agencyId: string,
    createdBy: string,
    rows: TransformedRow[],
    strategy: DuplicateStrategy,
    onProgress: ProgressCallback
): Promise<number> {
    let imported = 0;

    // Fetch existing phones for duplicate detection
    let existingPhones = new Set<string>();
    const existingDocsMap = new Map<string, string>(); // phone → docId

    if (strategy !== 'always_create') {
        const snap = await getDocs(query(collection(db, 'leads'), where('agencyId', '==', agencyId)));
        snap.docs.forEach((d) => {
            const phone = d.data().phone as string;
            if (phone) {
                existingPhones.add(phone);
                existingDocsMap.set(phone, d.id);
            }
        });
    }

    const agentMap = await buildAgentMap(agencyId);
    const chunks = await getBatchChunks(rows);

    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batch = writeBatch(db);

        for (const row of chunk) {
            const phone = normalizePhone(String(row['phone']));

            if (strategy === 'skip' && existingPhones.has(phone)) continue;

            const assignedAgentId = resolveAgent(row, agentMap, null as any) || null;

            if (strategy === 'update' && existingPhones.has(phone)) {
                const existingId = existingDocsMap.get(phone)!;
                const ref = doc(db, 'leads', existingId);
                const updateData: any = { ...row, updatedAt: serverTimestamp() };
                if (assignedAgentId) updateData.assignedAgentId = assignedAgentId;
                batch.update(ref, updateData);
            } else {
                const ref = doc(collection(db, 'leads'));
                batch.set(ref, {
                    ...buildLeadDefaults(row),
                    assignedAgentId,
                    agencyId,
                    createdBy,
                    source: row.source || 'ייבוא',
                    status: 'new',
                    createdAt: serverTimestamp(),
                });
            }
            imported++;
        }

        await batch.commit();
        onProgress((ci + 1) * BATCH_SIZE, rows.length);
    }

    return imported;
}

function buildLeadDefaults(row: TransformedRow): TransformedRow {
    return {
        name: row.name ?? '',
        phone: normalizePhone(String(row.phone ?? '')),
        email: row.email ? String(row.email).trim().toLowerCase() : null,
        type: row.type ?? 'buyer',
        notes: row.notes ? String(row.notes).trim() : null,
        description: row.description ? String(row.description).trim() : null,
        assignedAgentId: null,
        requirements: {
            desiredCity: row.city ? [row.city] : (row.desiredCity ? [row.desiredCity] : []),
            maxBudget: parseMoney(row.budget),
            minRooms: row.minRooms ?? null,
            maxRooms: row.maxRooms ?? null,
            minSizeSqf: row.minSqm ?? null,
            floorMin: row.floorMin ?? null,
            floorMax: row.floorMax ?? null,
            propertyType: row.propertyType ? [row.propertyType] : [],
            mustHaveElevator: parseBooleanish(row.elevator) ?? false,
            mustHaveParking: parseBooleanish(row.parking) ?? false,
            mustHaveBalcony: parseBooleanish(row.balcony) ?? false,
            mustHaveSafeRoom: parseBooleanish(row.safeRoom) ?? false,
            condition: row.condition || 'any',
            urgency: row.urgency || 'flexible',
        },
        ...(row.customData ? { customData: row.customData } : {}),
    };
}

// ─── Import Properties ────────────────────────────────────────────────────────

export async function importProperties(
    agencyId: string,
    createdBy: string,
    rows: TransformedRow[],
    strategy: DuplicateStrategy,
    onProgress: ProgressCallback
): Promise<number> {
    let imported = 0;

    const existingKeys = new Set<string>();
    const existingDocsMap = new Map<string, string>();

    if (strategy !== 'always_create') {
        const snap = await getDocs(collection(db, 'agencies', agencyId, 'properties'));
        snap.docs.forEach((d) => {
            const data = d.data();
            const key = `${String(data.address?.fullAddress ?? data.address ?? '').trim().toLowerCase()}|${String(data.address?.city ?? data.city ?? '').trim().toLowerCase()}`;
            existingKeys.add(key);
            existingDocsMap.set(key, d.id);
        });
    }

    const agentMap = await buildAgentMap(agencyId);
    const chunks = await getBatchChunks(rows);

    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batch = writeBatch(db);

        // Geocode addresses in this chunk in parallel (Google Maps is fast)
        const geocodePromises = chunk.map(row => geocodeAddress(row.address, row.city));
        const geocodeResults = await Promise.all(geocodePromises);

        for (let i = 0; i < chunk.length; i++) {
            const row = chunk[i];
            const geo = geocodeResults[i];
            const key = `${String(row.address ?? '').trim().toLowerCase()}|${String(row.city ?? '').trim().toLowerCase()}`;

            if (strategy === 'skip' && existingKeys.has(key)) continue;

            const resolvedAgentId = resolveAgent(row, agentMap, createdBy);

            if (strategy === 'update' && existingKeys.has(key)) {
                const existingId = existingDocsMap.get(key)!;
                const ref = doc(db, 'agencies', agencyId, 'properties', existingId);
                const updateData: any = {
                    ...row,
                    'management.assignedAgentId': resolvedAgentId,
                    updatedAt: serverTimestamp(),
                    ...(geo ? { 'address.coords': { lat: geo.lat, lng: geo.lng } } : {})
                };
                batch.update(ref, updateData);
            } else {
                const ref = doc(collection(db, 'agencies', agencyId, 'properties'));
                batch.set(ref, buildPropertyDefaults(row, agencyId, resolvedAgentId, createdBy, geo ? {
                    lat: geo.lat,
                    lng: geo.lng,
                    formattedAddress: geo.formatted
                } : undefined));
            }
            imported++;
        }

        await batch.commit();
        onProgress((ci + 1) * BATCH_SIZE, rows.length);
    }

    return imported;
}

// ─── Import Mixed (Combined Lead+Property) ────────────────────────────────────

export async function importMixed(
    agencyId: string,
    createdBy: string,
    rows: TransformedRow[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _strategy: DuplicateStrategy,
    onProgress: ProgressCallback
): Promise<number> {
    let imported = 0;

    // 200 rows = 400 writes max (each row = Lead + Property = 2 writes)
    const CHUNK_SIZE = 200;
    const chunks: TransformedRow[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + CHUNK_SIZE));
    }

    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batch = writeBatch(db);

        // Geocode check
        const geocodePromises = chunk.map(row => geocodeAddress(row.address, row.city));
        const geocodeResults = await Promise.all(geocodePromises);

        for (let i = 0; i < chunk.length; i++) {
            const row = chunk[i];
            const geo = geocodeResults[i];

            // 1. Lead
            const leadRef = doc(collection(db, 'leads'));
            const leadData = buildLeadDefaults({
                ...row,
                type: row.leadTypeOverride || 'seller',
            });

            batch.set(leadRef, {
                ...leadData,
                agencyId,
                createdBy,
                source: row.source || 'ייבוא',
                status: 'new',
                createdAt: serverTimestamp(),
            });

            // 2. Property — link to owner lead
            const propertyRef = doc(collection(db, 'agencies', agencyId, 'properties'));
            batch.set(propertyRef, buildPropertyDefaults(row, agencyId, createdBy, createdBy, {
                ownerId: leadRef.id,
                ...(geo ? { lat: geo.lat, lng: geo.lng, formattedAddress: geo.formatted } : {})
            }));

            imported++;
        }

        await batch.commit();
        onProgress((ci + 1) * CHUNK_SIZE, rows.length);
    }

    return imported;
}

// ─── Import Deals ─────────────────────────────────────────────────────────────

export async function importDeals(
    agencyId: string,
    createdBy: string,
    rows: TransformedRow[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _strategy: DuplicateStrategy,
    onProgress: ProgressCallback
): Promise<number> {
    let imported = 0;
    const chunks = await getBatchChunks(rows);
    const agentMap = await buildAgentMap(agencyId);

    // Pre-load existing properties (address|city → id) for deduplication
    const existingPropertiesMap = new Map<string, string>();
    const propSnap = await getDocs(collection(db, 'agencies', agencyId, 'properties'));
    propSnap.docs.forEach((d) => {
        const data = d.data();
        const key = `${String(data.address?.fullAddress ?? data.address ?? '').trim().toLowerCase()}|${String(data.address?.city ?? data.city ?? '').trim().toLowerCase()}`;
        existingPropertiesMap.set(key, d.id);
    });

    // Pre-load existing leads (phone → id) for deduplication
    const existingLeadsMap = new Map<string, string>();
    const leadSnap = await getDocs(query(collection(db, 'leads'), where('agencyId', '==', agencyId)));
    leadSnap.docs.forEach((d) => {
        const phone = d.data().phone as string;
        if (phone) existingLeadsMap.set(phone, d.id);
    });

    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batch = writeBatch(db);

        for (const row of chunk) {
            const assignedAgentId = resolveAgent(row, agentMap, createdBy);

            // 1. Property — reuse existing if address+city match
            const propKey = `${String(row.propertyName ?? '').trim().toLowerCase()}|${String(row.city ?? '').trim().toLowerCase()}`;
            let propertyId = existingPropertiesMap.get(propKey);
            if (!propertyId) {
                const propertyRef = doc(collection(db, 'agencies', agencyId, 'properties'));
                propertyId = propertyRef.id;
                batch.set(propertyRef, buildPropertyDefaults(
                    { ...row, address: row.propertyName },
                    agencyId,
                    assignedAgentId,
                    createdBy,
                    { status: 'pending' }
                ));
                existingPropertiesMap.set(propKey, propertyId);
            }

            // 2. Lead — reuse existing if phone matches
            const normalizedPhone = normalizePhone(String(row.leadPhone ?? ''));
            let leadId = normalizedPhone ? existingLeadsMap.get(normalizedPhone) : undefined;
            if (!leadId && (row.leadName || row.leadPhone)) {
                const leadRef = doc(collection(db, 'leads'));
                leadId = leadRef.id;
                batch.set(leadRef, {
                    name: row.leadName ?? '',
                    phone: normalizedPhone,
                    email: row.leadEmail ? String(row.leadEmail).trim().toLowerCase() : null,
                    source: row.source || 'ייבוא',
                    type: 'buyer',
                    agencyId,
                    assignedAgentId,
                    status: 'new',
                    notes: null,
                    requirements: {
                        desiredCity: row.city ? [row.city] : [],
                        maxBudget: parseMoney(row.budget),
                        minRooms: null, maxRooms: null, minSizeSqf: null,
                        floorMin: null, floorMax: null, propertyType: [],
                        mustHaveElevator: false, mustHaveParking: false,
                        mustHaveBalcony: false, mustHaveSafeRoom: false,
                        condition: 'any', urgency: 'flexible',
                    },
                    createdAt: serverTimestamp(),
                });
                if (normalizedPhone) existingLeadsMap.set(normalizedPhone, leadId);
            }

            // 3. Deal
            const dealRef = doc(collection(db, 'deals'));
            batch.set(dealRef, {
                propertyId,
                ...(leadId ? { buyerId: leadId } : {}),
                stage: row.stage ?? 'qualification',
                price: row.price ?? 0,
                projectedCommission: row.projectedCommission ?? 0,
                ...(row.probability !== undefined ? { probability: row.probability } : {}),
                notes: row.notes ? String(row.notes).trim() : null,
                agencyId,
                createdBy,
                agentId: assignedAgentId,
                ...(row.customData ? { customData: row.customData } : {}),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            imported++;
        }

        await batch.commit();
        onProgress((ci + 1) * BATCH_SIZE, rows.length);
    }

    return imported;
}

// ─── Import Agents ────────────────────────────────────────────────────────────

export async function importAgents(
    agencyId: string,
    rows: TransformedRow[],
    onProgress: ProgressCallback
): Promise<{ importedCount: number; failedCount: number }> {
    let importedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
            const { stubId } = await inviteAgent(
                agencyId,
                String(row.name ?? '').trim(),
                String(row.email ?? '').trim().toLowerCase(),
                row.role === 'admin' ? 'admin' : 'agent'
            );
            if (row.customData) {
                await updateDoc(doc(db, 'users', stubId), { customData: row.customData });
            }
            importedCount++;
        } catch (err: any) {
            console.warn(`[importAgents] Failed to invite ${row.email}:`, err?.message);
            failedCount++;
        }
        onProgress(i + 1, rows.length);
    }

    return { importedCount, failedCount };
}

// ─── Export Errors to Excel ───────────────────────────────────────────────────

export function exportErrorsToExcel(invalidRows: InvalidRow[]): void {
    const exportData = invalidRows.map((inv) => ({
        ...inv.row,
        '⚠ סיבת השגיאה': inv.reason,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'שגיאות ייבוא');
    XLSX.writeFile(wb, 'שגיאות_ייבוא.xlsx');
}
