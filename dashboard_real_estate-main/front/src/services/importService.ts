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
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { inviteAgent } from './teamService';

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

// ─── Validate & Transform ─────────────────────────────────────────────────────

const REQUIRED_FIELDS: Record<EntityType, string[]> = {
    lead: ['name', 'phone'],
    property: ['address', 'price'],
    agent: ['name', 'email'],
    combined: ['name', 'phone', 'address', 'price'],
    deal: ['propertyName', 'price', 'stage', 'projectedCommission'],
};

const VALID_PROPERTY_TYPES = ['sale', 'rent', 'למכירה', 'להשכרה', 'מכירה', 'השכרה', 'for sale', 'rental'];
const PROPERTY_TYPE_MAP: Record<string, 'sale' | 'rent'> = {
    'למכירה': 'sale', 'מכירה': 'sale', 'for sale': 'sale', sale: 'sale',
    'להשכרה': 'rent', 'השכרה': 'rent', rental: 'rent', rent: 'rent',
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
            if (firestoreField && rawRow[excelCol] !== undefined) {
                if (firestoreField.startsWith('__custom__')) {
                    const customKey = firestoreField.substring(10); // remove __custom__
                    customData[customKey] = rawRow[excelCol];
                } else {
                    transformed[firestoreField] = rawRow[excelCol];
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
            const price = parseFloat(String(rawPrice).replace(/[,\s₪]/g, ''));
            if (isNaN(price) || price <= 0) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: מחיר לא תקין — "${rawPrice}"` });
                return;
            }
            transformed['price'] = price;

            // type (sale/rent) — optional, defaults to 'sale'
            const rawType = String(transformed['type'] || '').trim();
            if (rawType && VALID_PROPERTY_TYPES.includes(rawType)) {
                transformed['type'] = PROPERTY_TYPE_MAP[rawType] ?? rawType;
            } else {
                // If type field has a building name (e.g. "דירה") or is empty, move it to kind
                if (rawType && !transformed['kind']) {
                    transformed['kind'] = rawType;
                }
                transformed['type'] = 'sale'; // default
            }

            // kind — free-text (e.g. דירה, פנטהאוז, דירת גן)
            if (transformed['kind']) {
                transformed['kind'] = String(transformed['kind']).trim();
            } else {
                transformed['kind'] = 'דירה';
            }

            if (transformed['rooms']) {
                const rooms = parseFloat(String(transformed['rooms']));
                transformed['rooms'] = isNaN(rooms) ? undefined : rooms;
            }
            if (transformed['floor']) {
                const floor = parseFloat(String(transformed['floor']));
                transformed['floor'] = isNaN(floor) ? undefined : floor;
            }
            // Cast notes to string — Excel might parse free-text as a date or number
            if (transformed['notes'] !== undefined && transformed['notes'] !== '') {
                transformed['notes'] = String(transformed['notes']).trim();
            } else {
                transformed['notes'] = null;
            }
        }

        if (entityType === 'lead' || entityType === 'combined') {
            // Normalize phone number — remove spaces/dashes
            transformed['phone'] = String(transformed['phone'] || '').replace(/[\s\-]/g, '');

            // Cast notes to string safely (if combined, property validation handled it)
            if (entityType !== 'combined') {
                if (transformed['notes'] !== undefined && transformed['notes'] !== '') {
                    transformed['notes'] = String(transformed['notes']).trim();
                } else {
                    transformed['notes'] = null;
                }
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
            const price = parseFloat(String(rawPrice).replace(/[,\s₪]/g, ''));
            if (isNaN(price) || price <= 0) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: מחיר לא תקין — "${rawPrice}"` });
                return;
            }
            transformed['price'] = price;

            // projectedCommission — must be positive number
            const rawComm = transformed['projectedCommission'];
            const commission = parseFloat(String(rawComm).replace(/[,\s₪%]/g, ''));
            if (isNaN(commission) || commission < 0) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: עמלה לא תקינה — "${rawComm}"` });
                return;
            }
            transformed['projectedCommission'] = commission;

            // stage — normalize to DealStage values
            const rawStage = String(transformed['stage'] || '').trim();
            if (!rawStage) {
                invalid.push({ row: rawRow, reason: `שורה ${idx + 2}: שלב עסקה חסר` });
                return;
            }
            const STAGE_MAP: Record<string, string> = {
                'qualification': 'qualification', 'כישורים': 'qualification', 'בירור צרכים': 'qualification',
                'viewing': 'viewing', 'סיור': 'viewing', 'תצפית': 'viewing', 'ביקור': 'viewing',
                'offer': 'offer', 'הצעה': 'offer', 'הגשת הצעה': 'offer',
                'negotiation': 'negotiation', 'משא ומתן': 'negotiation', 'ניגוציאציה': 'negotiation',
                'contract': 'contract', 'חוזה': 'contract', 'חתימה': 'contract', 'סגירה': 'contract',
                'won': 'won', 'נסגר': 'won', 'הושלם': 'won', 'זכייה': 'won',
                'lost': 'lost', 'אבוד': 'lost', 'נכשל': 'lost',
            };
            transformed['stage'] = STAGE_MAP[rawStage.toLowerCase()] ?? STAGE_MAP[rawStage] ?? 'qualification';

            // probability — optional 0-100
            if (transformed['probability'] !== undefined && transformed['probability'] !== '') {
                const prob = parseFloat(String(transformed['probability']).replace(/[%\s]/g, ''));
                transformed['probability'] = isNaN(prob) ? undefined : Math.min(100, Math.max(0, prob));
            }

            // Normalization for leadPhone
            if (transformed['leadPhone']) {
                transformed['leadPhone'] = String(transformed['leadPhone']).replace(/[\s\-]/g, '');
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
        const snap = await getDocs(
            query(collection(db, 'leads'), where('agencyId', '==', agencyId))
        );
        snap.docs.forEach((d) => {
            const phone = d.data().phone as string;
            if (phone) {
                existingPhones.add(phone);
                existingDocsMap.set(phone, d.id);
            }
        });
    }

    const chunks = await getBatchChunks(rows);

    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batch = writeBatch(db);

        for (const row of chunk) {
            const phone = String(row['phone']).trim();

            if (strategy === 'skip' && existingPhones.has(phone)) continue;

            if (strategy === 'update' && existingPhones.has(phone)) {
                const existingId = existingDocsMap.get(phone)!;
                const ref = doc(db, 'leads', existingId);
                batch.update(ref, { ...row, updatedAt: serverTimestamp() });
            } else {
                const ref = doc(collection(db, 'leads'));
                batch.set(ref, {
                    ...buildLeadDefaults(row),
                    agencyId,
                    createdBy,
                    source: 'import',
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
    const defaults: TransformedRow = {
        name: row.name ?? '',
        phone: row.phone ?? '',
        email: row.email ?? null,
        type: row.type ?? 'buyer',
        notes: row.notes ?? null,
        assignedAgentId: null,
        requirements: {
            desiredCity: row.city ? [row.city] : [],
            maxBudget: row.budget ? parseFloat(String(row.budget).replace(/[,\s₪]/g, '')) : null,
            minRooms: null,
            maxRooms: null,
            minSizeSqf: null,
            floorMin: null,
            floorMax: null,
            propertyType: [],
            mustHaveElevator: false,
            mustHaveParking: false,
            mustHaveBalcony: false,
            mustHaveSafeRoom: false,
            condition: 'any',
            urgency: 'flexible',
        },
    };
    if (row.customData) {
        defaults.customData = row.customData;
    }
    return defaults;
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

    // Fetch existing address+city combos
    const existingKeys = new Set<string>();
    const existingDocsMap = new Map<string, string>(); // key → docId

    if (strategy !== 'always_create') {
        const snap = await getDocs(
            query(collection(db, 'properties'), where('agencyId', '==', agencyId))
        );
        snap.docs.forEach((d) => {
            const data = d.data();
            const key = `${String(data.address ?? '').trim().toLowerCase()}|${String(data.city ?? '').trim().toLowerCase()}`;
            existingKeys.add(key);
            existingDocsMap.set(key, d.id);
        });
    }

    const chunks = await getBatchChunks(rows);

    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batch = writeBatch(db);

        for (const row of chunk) {
            const key = `${String(row.address ?? '').trim().toLowerCase()}|${String(row.city ?? '').trim().toLowerCase()}`;

            if (strategy === 'skip' && existingKeys.has(key)) continue;

            if (strategy === 'update' && existingKeys.has(key)) {
                const existingId = existingDocsMap.get(key)!;
                const ref = doc(db, 'properties', existingId);
                batch.update(ref, { ...row, updatedAt: serverTimestamp() });
            } else {
                const ref = doc(collection(db, 'properties'));
                batch.set(ref, {
                    address: row.address || 'לא צויין רחוב',
                    city: row.city || 'לא צויינה עיר',
                    type: row.type || 'sale',
                    kind: row.kind || 'דירה',
                    price: row.price || 1, // Fallback to 1 since rules require > 0
                    rooms: row.rooms ?? null,
                    floor: row.floor ?? null,
                    description: row.description ?? null,
                    notes: row.notes ?? null,
                    agencyId,
                    agentId: createdBy,
                    createdBy,
                    status: 'active',
                    daysOnMarket: 0,
                    isExclusive: false,
                    lat: 31.5,
                    lng: 34.75,
                    location: { lat: 31.5, lng: 34.75 }, // Default Israel center until updated
                    geocode: {
                        lat: 31.5,
                        lng: 34.75,
                        formattedAddress: `${row.address ?? ''}, ${row.city ?? ''}`,
                        placeId: '',
                        lastUpdated: serverTimestamp()
                    },
                    ...(row.customData ? { customData: row.customData } : {}),
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

    // Batch size is half of BATCH_SIZE because each row creates 2 documents (Lead + Property)
    // 200 rows = 400 writes. Firestore limit is 500 writes per batch.
    const CHUNK_SIZE = 200;
    const chunks: TransformedRow[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + CHUNK_SIZE));
    }

    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batch = writeBatch(db);

        for (const row of chunk) {
            // 1. Create Lead Reference
            const leadRef = doc(collection(db, 'leads'));

            // Note: row.type is the Property transaction type (sale/rent). 
            // The lead type is stored in 'leadTypeOverride' from validation, or defaults to defaultSeller logic
            const leadData = buildLeadDefaults({
                ...row,
                type: row.leadTypeOverride || 'seller',
            });

            batch.set(leadRef, {
                ...leadData,
                agencyId,
                createdBy,
                source: 'import',
                status: 'new',
                createdAt: serverTimestamp(),
            });

            // 2. Create Property Reference
            const propertyRef = doc(collection(db, 'properties'));

            // Build property manually (since we don't have buildPropertyDefaults)
            batch.set(propertyRef, {
                address: row.address || 'לא צויין רחוב',
                city: row.city || 'לא צויינה עיר',
                type: row.type || 'sale',
                kind: row.kind || 'דירה',
                price: row.price || 1, // Fallback to 1 since rules require > 0
                rooms: row.rooms ?? null,
                floor: row.floor ?? null,
                description: row.description ?? null,
                notes: row.notes ?? null,
                agencyId,
                agentId: createdBy,
                createdBy,
                ownerId: leadRef.id,
                status: 'active',
                daysOnMarket: 0,
                isExclusive: false,
                lat: 31.5,
                lng: 34.75,
                location: { lat: 31.5, lng: 34.75 }, // Default Israel center until updated
                geocode: {
                    lat: 31.5,
                    lng: 34.75,
                    formattedAddress: `${row.address ?? ''}, ${row.city ?? ''}`,
                    placeId: '',
                    lastUpdated: serverTimestamp()
                },
                ...(row.customData ? { customData: row.customData } : {}),
                createdAt: serverTimestamp(),
            });

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
    _strategy: DuplicateStrategy, // deals always create new docs (no natural duplicate key)
    onProgress: ProgressCallback
): Promise<number> {
    let imported = 0;
    const chunks = await getBatchChunks(rows);

    // Fetch agents in the agency to map agent names
    const agentsSnap = await getDocs(
        query(collection(db, 'users'), where('agencyId', '==', agencyId))
    );
    const agentMap = new Map<string, string>(); // lowercased name/email -> uid
    agentsSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.name) agentMap.set(String(data.name).trim().toLowerCase(), d.id);
        if (data.email) agentMap.set(String(data.email).trim().toLowerCase(), d.id);
    });

    for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const batch = writeBatch(db);

        for (const row of chunk) {
            // Find agent if provided
            let assignedAgentId = createdBy;
            if (row.agentName) {
                const qName = String(row.agentName).trim().toLowerCase();
                if (agentMap.has(qName)) {
                    assignedAgentId = agentMap.get(qName)!;
                }
            }

            // 1. Create Property
            const propertyRef = doc(collection(db, 'properties'));
            batch.set(propertyRef, {
                address: row.propertyName || 'לא צויין רחוב',
                city: row.city || 'לא צויינה עיר',
                type: 'sale',
                kind: 'דירה',
                price: row.price || 1,
                rooms: null,
                floor: null,
                description: null,
                notes: null,
                agencyId,
                agentId: assignedAgentId,
                createdBy,
                status: 'pending', // Deals usually map to active/pending properties
                daysOnMarket: 0,
                isExclusive: false,
                lat: 31.5,
                lng: 34.75,
                location: { lat: 31.5, lng: 34.75 }, // Default Israel center until updated
                geocode: {
                    lat: 31.5,
                    lng: 34.75,
                    formattedAddress: `${row.propertyName ?? ''}, ${row.city ?? ''}`,
                    placeId: '',
                    lastUpdated: serverTimestamp()
                },
                createdAt: serverTimestamp(),
            });

            // 2. Create Lead
            const leadRef = doc(collection(db, 'leads'));
            batch.set(leadRef, {
                name: row.leadName ?? '',
                phone: row.leadPhone ?? '',
                email: null,
                source: 'excel_import',
                type: 'buyer', // default
                agencyId,
                assignedAgentId,
                status: 'new', // or based on stage
                notes: null,
                requirements: {
                    desiredCity: row.city ? [row.city] : [],
                    maxBudget: null,
                    minRooms: null,
                    maxRooms: null,
                    minSizeSqf: null,
                    floorMin: null,
                    floorMax: null,
                    propertyType: [],
                    mustHaveElevator: false,
                    mustHaveParking: false,
                    mustHaveBalcony: false,
                    mustHaveSafeRoom: false,
                    condition: 'any',
                    urgency: 'flexible',
                },
                createdAt: serverTimestamp(),
            });

            // 3. Create Deal
            const ref = doc(collection(db, 'deals'));
            batch.set(ref, {
                propertyId: propertyRef.id,
                leadId: leadRef.id,
                stage: row.stage ?? 'qualification',
                price: row.price ?? 0,
                projectedCommission: row.projectedCommission ?? 0,
                probability: row.probability ?? null,
                notes: row.notes ?? null,
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
