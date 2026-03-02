"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.superAdminGetImportMapping = exports.superAdminImportGlobalProperties = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
/**
 * Callable function for Super Admins to bulk-import properties into global cities collection.
 */
exports.superAdminImportGlobalProperties = functions.https.onCall({
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 300
}, async (request) => {
    // 1. Auth Guard
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    // 2. Super Admin Check
    if (request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }
    const { properties } = request.data;
    if (!Array.isArray(properties)) {
        throw new functions.https.HttpsError('invalid-argument', 'The "properties" field must be an array.');
    }
    const db = admin.firestore();
    let totalInserted = 0;
    try {
        // Chunk sizes for batch (Firestore limit is 500)
        const batchSize = 400;
        for (let i = 0; i < properties.length; i += batchSize) {
            const chunk = properties.slice(i, i + batchSize);
            const batch = db.batch();
            chunk.forEach((prop) => {
                // City Normalization
                const rawCity = (prop.city || 'unknown').toString().trim();
                const normalizedCity = rawCity || 'unknown';
                // street normalization for ID
                const street = (prop.street || '').toString().trim();
                const price = prop.price || 0;
                // Deduplication ID: Hash of city + street + price
                const hashInput = `${normalizedCity.toLowerCase()}_${street.toLowerCase()}_${price}`;
                const docId = crypto.createHash('sha256').update(hashInput).digest('hex');
                const propRef = db.collection('cities').doc(normalizedCity).collection('properties').doc(docId);
                batch.set(propRef, Object.assign(Object.assign({}, prop), { city: normalizedCity, street: street, source: "super_admin_excel", isPublic: true, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
            });
            await batch.commit();
            totalInserted += chunk.length;
        }
        return {
            success: true,
            insertedCount: totalInserted
        };
    }
    catch (error) {
        console.error('[superAdminImportGlobalProperties] Error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Error occurred during bulk import.');
    }
});
/**
 * Uses Gemini to determine the mapping between Excel headers and our internal Property keys.
 */
exports.superAdminGetImportMapping = functions.https.onCall({
    region: 'europe-west1',
    secrets: [geminiApiKey]
}, async (request) => {
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }
    const { headers, sampleData } = request.data;
    const apiKey = geminiApiKey.value();
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const systemPrompt = `You are a data mapping assistant. I have an Excel file with specific headers.
I need a JSON object that maps these headers to my database field names.
Internal database fields:
"city" - The city name
"street" - The street address or neighborhood
"price" - The property price (number)
"rooms" - Number of rooms (number/string)
"sqm" - Square meters (number)
"floor" - Floor number
"type" - 'sale' or 'rent'
"kind" - 'דירה', 'בית פרטי', 'פנטהאוז' etc.
"description" - Full property description
"listingType" - 'exclusive' (בלעדיות), 'external' (שת"פ), or 'private' (פרטי)
"isExclusive" - boolean (true for exclusivity)
"agentName" - Responsible agent's name
"notes" - Internal office notes

Headers provided: ${JSON.stringify(headers)}
Sample data (first row): ${JSON.stringify(sampleData)}

Return ONLY a JSON object where keys are the Excel headers and values are the internal database field names.
If a header doesn't map to anything useful, ignore it.
Example: {"עיר": "city", "כתובת": "street"}`;
    const result = await model.generateContent(systemPrompt);
    let text = result.response.text().trim();
    // Clean potential markdown wrapping
    text = text.replace(/```json|```/g, '').trim();
    try {
        const mapping = JSON.parse(text);
        return { success: true, mapping };
    }
    catch (e) {
        throw new functions.https.HttpsError('internal', 'AI returned invalid JSON mapping.');
    }
});
//# sourceMappingURL=globalImport.js.map