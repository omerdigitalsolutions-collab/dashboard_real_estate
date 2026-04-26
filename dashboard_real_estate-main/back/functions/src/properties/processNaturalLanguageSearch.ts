/**
 * processNaturalLanguageSearch — Public HTTP endpoint for B2C property search.
 * Accepts a free-text Hebrew query + explicit filter params, uses Gemini to
 * parse text into structured filters, then queries all public properties via
 * collection group query.
 *
 * No authentication required (public-facing).
 *
 * ⚠️  FIRESTORE COLLECTION GROUP INDEX REQUIRED:
 *   Collection Group: properties
 *   Fields: visibility ASC, status ASC, createdAt DESC
 *   Create at: https://console.firebase.google.com/project/_/firestore/indexes
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getFirestore } from 'firebase-admin/firestore';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const PAGE_SIZE_DEFAULT = 12;
const MAX_PAGE_SIZE = 48;

// Simple in-memory rate limiter: 30 requests/min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
        return false;
    }
    if (entry.count >= 30) return true;
    entry.count++;
    return false;
}

interface ExplicitFilters {
    city?: string;
    minPrice?: number;
    maxPrice?: number;
    minRooms?: number;
    maxRooms?: number;
    propertyType?: string;
    transactionType?: 'forsale' | 'rent';
}

type SortBy = 'newest' | 'oldest' | 'price_asc' | 'price_desc';

async function parseQueryWithGemini(query: string, apiKey: string): Promise<ExplicitFilters> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite-preview-06-17' });

    const prompt = `אתה מנתח שאילתות חיפוש נדל"ן. נתח את השאילתה הבאה והחזר JSON בלבד (ללא markdown, ללא הסברים).
שדות אפשריים: city (string), minPrice (number, ש"ח), maxPrice (number, ש"ח), minRooms (number), maxRooms (number), propertyType (string: "דירה"|"בית פרטי"|"פנטהאוז"|"מסחרי"), transactionType ("forsale"|"rent").
אם שדה לא מוזכר — השמט אותו. מחירים בש"ח בלבד (אם כתוב מיליון — הכפל ב-1000000).
שאילתה: "${query.replace(/"/g, '')}"`;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim().replace(/```json|```/g, '').trim();
        return JSON.parse(text) as ExplicitFilters;
    } catch {
        return {};
    }
}

function getPrice(p: any): number {
    return p.financials?.price ?? p.price ?? 0;
}

function getRooms(p: any): number | null {
    const r = p.rooms ?? p.financials?.rooms ?? null;
    return r !== null ? Number(r) : null;
}

function getCity(p: any): string {
    return (p.address?.city || p.city || '').toLowerCase();
}

function applyFilters(docs: any[], filters: ExplicitFilters): any[] {
    return docs.filter(p => {
        if (filters.city) {
            if (!getCity(p).includes(filters.city.toLowerCase())) return false;
        }
        const price = getPrice(p);
        if (filters.minPrice && price < filters.minPrice) return false;
        if (filters.maxPrice && price > filters.maxPrice) return false;
        const rooms = getRooms(p);
        if (filters.minRooms != null && rooms !== null && rooms < filters.minRooms - 0.4) return false;
        if (filters.maxRooms != null && rooms !== null && rooms > filters.maxRooms + 0.4) return false;
        if (filters.propertyType) {
            const pType = (p.propertyType || p.type || '').toLowerCase();
            if (!pType.includes(filters.propertyType.toLowerCase())) return false;
        }
        if (filters.transactionType) {
            const tx = p.transactionType || p.transType || '';
            if (tx !== filters.transactionType) return false;
        }
        return true;
    });
}

function sortDocs(docs: any[], sortBy: SortBy): any[] {
    const sorted = [...docs];
    switch (sortBy) {
        case 'oldest':
            return sorted.sort((a, b) => {
                const ta = a.createdAt?.seconds ?? 0;
                const tb = b.createdAt?.seconds ?? 0;
                return ta - tb;
            });
        case 'price_asc':
            return sorted.sort((a, b) => getPrice(a) - getPrice(b));
        case 'price_desc':
            return sorted.sort((a, b) => getPrice(b) - getPrice(a));
        case 'newest':
        default:
            return sorted.sort((a, b) => {
                const ta = a.createdAt?.seconds ?? 0;
                const tb = b.createdAt?.seconds ?? 0;
                return tb - ta;
            });
    }
}

export const processNaturalLanguageSearch = onRequest(
    { secrets: [geminiApiKey], region: 'europe-west1', cors: true },
    async (req, res) => {
        // Explicit CORS headers — required for browsers calling from any origin
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }

        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
        if (isRateLimited(ip)) {
            res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
            return;
        }

        const {
            query = '',
            page = 0,
            pageSize = PAGE_SIZE_DEFAULT,
            // Explicit filters (override NLS)
            city,
            minPrice,
            maxPrice,
            minRooms,
            maxRooms,
            propertyType,
            transactionType,
            sortBy = 'newest',
        } = req.body as {
            query?: string;
            page?: number;
            pageSize?: number;
            city?: string;
            minPrice?: number;
            maxPrice?: number;
            minRooms?: number;
            maxRooms?: number;
            propertyType?: string;
            transactionType?: 'forsale' | 'rent';
            sortBy?: SortBy;
        };

        const safePageSize = Math.min(Number(pageSize) || PAGE_SIZE_DEFAULT, MAX_PAGE_SIZE);
        const safePage = Math.max(Number(page) || 0, 0);

        // Parse NLS query if provided (explicit params take priority)
        let nlsFilters: ExplicitFilters = {};
        if (query.trim().length > 0) {
            try {
                nlsFilters = await parseQueryWithGemini(query.trim(), geminiApiKey.value());
            } catch {
                // Fallback: no NLS filters
            }
        }

        // Explicit params override NLS-parsed values
        const activeFilters: ExplicitFilters = {
            city: city ?? nlsFilters.city,
            minPrice: minPrice != null ? Number(minPrice) : nlsFilters.minPrice,
            maxPrice: maxPrice != null ? Number(maxPrice) : nlsFilters.maxPrice,
            minRooms: minRooms != null ? Number(minRooms) : nlsFilters.minRooms,
            maxRooms: maxRooms != null ? Number(maxRooms) : nlsFilters.maxRooms,
            propertyType: propertyType ?? nlsFilters.propertyType,
            transactionType: transactionType ?? nlsFilters.transactionType,
        };

        // Remove undefined keys so filter logic treats them as "no filter"
        (Object.keys(activeFilters) as (keyof ExplicitFilters)[]).forEach(k => {
            if (activeFilters[k] == null || activeFilters[k] === '') delete activeFilters[k];
        });

        try {
            const db = getFirestore();
            const snapshot = await db
                .collectionGroup('properties')
                .where('visibility', '==', 'public')
                .where('status', '==', 'active')
                .get();

            let docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            if (Object.keys(activeFilters).length > 0) {
                docs = applyFilters(docs, activeFilters);
            }

            docs = sortDocs(docs, (sortBy as SortBy) || 'newest');

            const totalCount = docs.length;
            const start = safePage * safePageSize;
            const paginated = docs.slice(start, start + safePageSize);

            // Strip internal-only fields before sending to public clients
            const sanitized = paginated.map(p => {
                const { management, ...rest } = p as any;
                return {
                    ...rest,
                    management: {
                        assignedAgentId: management?.assignedAgentId ?? null,
                        descriptions: management?.descriptions ?? null,
                    },
                };
            });

            res.status(200).json({ properties: sanitized, totalCount, page: safePage, parsedFilters: activeFilters });
        } catch (err) {
            console.error('processNaturalLanguageSearch error:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);
