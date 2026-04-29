"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processNaturalLanguageSearch = void 0;
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
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const firestore_1 = require("firebase-admin/firestore");
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
const PAGE_SIZE_DEFAULT = 12;
const MAX_PAGE_SIZE = 48;
// Simple in-memory rate limiter: 30 requests/min per IP
const rateLimitMap = new Map();
function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
        return false;
    }
    if (entry.count >= 30)
        return true;
    entry.count++;
    return false;
}
async function parseQueryWithGemini(query, apiKey) {
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `אתה מנתח שאילתות חיפוש נדל"ן. נתח את השאילתה הבאה והחזר JSON בלבד (ללא markdown, ללא הסברים).
שדות אפשריים: city (string), minPrice (number, ש"ח), maxPrice (number, ש"ח), minRooms (number), maxRooms (number), propertyType (string: "דירה"|"בית פרטי"|"פנטהאוז"|"מסחרי"), transactionType ("forsale"|"rent").
אם שדה לא מוזכר — השמט אותו. מחירים בש"ח בלבד (אם כתוב מיליון — הכפל ב-1000000).
שאילתה: "${query.replace(/"/g, '')}"`;
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim().replace(/```json|```/g, '').trim();
        return JSON.parse(text);
    }
    catch (_a) {
        return {};
    }
}
function getPrice(p) {
    var _a, _b, _c;
    return (_c = (_b = (_a = p.financials) === null || _a === void 0 ? void 0 : _a.price) !== null && _b !== void 0 ? _b : p.price) !== null && _c !== void 0 ? _c : 0;
}
function getRooms(p) {
    var _a, _b, _c;
    const r = (_c = (_a = p.rooms) !== null && _a !== void 0 ? _a : (_b = p.financials) === null || _b === void 0 ? void 0 : _b.rooms) !== null && _c !== void 0 ? _c : null;
    return r !== null ? Number(r) : null;
}
function getCity(p) {
    var _a;
    return (((_a = p.address) === null || _a === void 0 ? void 0 : _a.city) || p.city || '').toLowerCase();
}
function applyFilters(docs, filters) {
    return docs.filter(p => {
        if (filters.city) {
            if (!getCity(p).includes(filters.city.toLowerCase()))
                return false;
        }
        const price = getPrice(p);
        if (filters.minPrice && price < filters.minPrice)
            return false;
        if (filters.maxPrice && price > filters.maxPrice)
            return false;
        const rooms = getRooms(p);
        if (filters.minRooms != null && rooms !== null && rooms < filters.minRooms - 0.4)
            return false;
        if (filters.maxRooms != null && rooms !== null && rooms > filters.maxRooms + 0.4)
            return false;
        if (filters.propertyType) {
            const pType = (p.propertyType || p.type || '').toLowerCase();
            if (!pType.includes(filters.propertyType.toLowerCase()))
                return false;
        }
        if (filters.transactionType) {
            const tx = p.transactionType || p.transType || '';
            if (tx !== filters.transactionType)
                return false;
        }
        return true;
    });
}
function sortDocs(docs, sortBy) {
    const sorted = [...docs];
    switch (sortBy) {
        case 'oldest':
            return sorted.sort((a, b) => {
                var _a, _b, _c, _d;
                const ta = (_b = (_a = a.createdAt) === null || _a === void 0 ? void 0 : _a.seconds) !== null && _b !== void 0 ? _b : 0;
                const tb = (_d = (_c = b.createdAt) === null || _c === void 0 ? void 0 : _c.seconds) !== null && _d !== void 0 ? _d : 0;
                return ta - tb;
            });
        case 'price_asc':
            return sorted.sort((a, b) => getPrice(a) - getPrice(b));
        case 'price_desc':
            return sorted.sort((a, b) => getPrice(b) - getPrice(a));
        case 'newest':
        default:
            return sorted.sort((a, b) => {
                var _a, _b, _c, _d;
                const ta = (_b = (_a = a.createdAt) === null || _a === void 0 ? void 0 : _a.seconds) !== null && _b !== void 0 ? _b : 0;
                const tb = (_d = (_c = b.createdAt) === null || _c === void 0 ? void 0 : _c.seconds) !== null && _d !== void 0 ? _d : 0;
                return tb - ta;
            });
    }
}
exports.processNaturalLanguageSearch = (0, https_1.onRequest)({ secrets: [geminiApiKey], region: 'europe-west1', cors: true }, async (req, res) => {
    var _a, _b;
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
    const ip = ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim()) || req.ip || 'unknown';
    if (isRateLimited(ip)) {
        res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
        return;
    }
    const { query = '', page = 0, pageSize = PAGE_SIZE_DEFAULT, 
    // Explicit filters (override NLS)
    city, minPrice, maxPrice, minRooms, maxRooms, propertyType, transactionType, sortBy = 'newest', } = req.body;
    const safePageSize = Math.min(Number(pageSize) || PAGE_SIZE_DEFAULT, MAX_PAGE_SIZE);
    const safePage = Math.max(Number(page) || 0, 0);
    // Parse NLS query if provided (explicit params take priority)
    let nlsFilters = {};
    if (query.trim().length > 0) {
        try {
            nlsFilters = await parseQueryWithGemini(query.trim(), geminiApiKey.value());
        }
        catch (_c) {
            // Fallback: no NLS filters
        }
    }
    // Explicit params override NLS-parsed values
    const activeFilters = {
        city: city !== null && city !== void 0 ? city : nlsFilters.city,
        minPrice: minPrice != null ? Number(minPrice) : nlsFilters.minPrice,
        maxPrice: maxPrice != null ? Number(maxPrice) : nlsFilters.maxPrice,
        minRooms: minRooms != null ? Number(minRooms) : nlsFilters.minRooms,
        maxRooms: maxRooms != null ? Number(maxRooms) : nlsFilters.maxRooms,
        propertyType: propertyType !== null && propertyType !== void 0 ? propertyType : nlsFilters.propertyType,
        transactionType: transactionType !== null && transactionType !== void 0 ? transactionType : nlsFilters.transactionType,
    };
    // Remove undefined keys so filter logic treats them as "no filter"
    Object.keys(activeFilters).forEach(k => {
        if (activeFilters[k] == null || activeFilters[k] === '')
            delete activeFilters[k];
    });
    try {
        const db = (0, firestore_1.getFirestore)();
        const snapshot = await db
            .collectionGroup('properties')
            .where('visibility', '==', 'public')
            .where('status', '==', 'active')
            .get();
        let docs = snapshot.docs.map(d => (Object.assign({ id: d.id }, d.data())));
        if (Object.keys(activeFilters).length > 0) {
            docs = applyFilters(docs, activeFilters);
        }
        docs = sortDocs(docs, sortBy || 'newest');
        const totalCount = docs.length;
        const start = safePage * safePageSize;
        const paginated = docs.slice(start, start + safePageSize);
        // Strip internal-only fields before sending to public clients
        const sanitized = paginated.map(p => {
            var _a, _b;
            const _c = p, { management } = _c, rest = __rest(_c, ["management"]);
            return Object.assign(Object.assign({}, rest), { management: {
                    assignedAgentId: (_a = management === null || management === void 0 ? void 0 : management.assignedAgentId) !== null && _a !== void 0 ? _a : null,
                    descriptions: (_b = management === null || management === void 0 ? void 0 : management.descriptions) !== null && _b !== void 0 ? _b : null,
                } });
        });
        res.status(200).json({ properties: sanitized, totalCount, page: safePage, parsedFilters: activeFilters });
    }
    catch (err) {
        console.error('processNaturalLanguageSearch error:', err instanceof Error ? err.message : String(err));
        res.status(500).json({ error: 'Internal server error', details: err instanceof Error ? err.message : String(err) });
    }
});
//# sourceMappingURL=processNaturalLanguageSearch.js.map