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
exports.webhookProcessGlobalYad2Email = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const crypto = __importStar(require("crypto"));
const db = admin.firestore();
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
exports.webhookProcessGlobalYad2Email = (0, https_1.onRequest)({
    region: 'europe-west1',
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: '512MiB',
}, async (req, res) => {
    var _a;
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    const htmlBody = (_a = req.body) === null || _a === void 0 ? void 0 : _a.htmlBody;
    if (!htmlBody) {
        res.status(400).json({ success: false, error: 'Missing htmlBody' });
        return;
    }
    // מחזיר 200 מיידית — Apps Script לא יחכה
    res.status(200).json({ success: true, message: 'Processing started' });
    try {
        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured');
        }
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `You are an expert real estate data parser. Extract ALL property listings from the provided Yad2 email HTML into a strict JSON ARRAY of objects.
  Rules for each object:
  - \`price\`: Number (remove ₪ and commas. e.g., 2290000).
  - \`city\`: Extract from the header (e.g., 'מודיעין מכבים רעות') and normalize to a short string (e.g., 'מודיעין').
  - \`neighborhood\`: Extract from the piped string (e.g., 'הפרחים | דירה...').
  - \`street\`: Extract the line below the price. If missing, leave as empty string.
  - \`propertyType\`: Extract from the piped string (e.g., 'דירה', 'פנטהאוז').
  - \`rooms\`: Number, extracted from the piped string.
  - \`sqm\`: Number, extracted from the piped string (digits only).
  - \`listingType\` & \`agencyName\`: Look below 'לפרטים נוספים'. If there is a name (e.g., 'Remax Gold'), set listingType to 'cooperation' and agencyName to that name. If missing, set listingType to 'private'.
  - \`yad2Link\`: Search the HTML for an href link to Yad2 (e.g., highly likely on a button or an anchor tag representing 'לצפייה במודעה' or similar). If found, extract the URL. Otherwise, leave empty string.
  Return ONLY the raw JSON array without markdown code blocks.

  HTML Email Body:
  ${htmlBody}`;
        const result = await model.generateContent(prompt);
        let responseText = result.response.text().trim();
        responseText = responseText.replace(/```json|```/g, '').trim();
        const properties = JSON.parse(responseText);
        if (!Array.isArray(properties)) {
            throw new Error('Gemini did not return a JSON array');
        }
        const batch = db.batch();
        let count = 0;
        for (const prop of properties) {
            if (!prop.city || !prop.street || !prop.price || typeof prop.rooms !== 'number') {
                console.warn('Skipping invalid property:', prop);
                continue;
            }
            const normalizedCityName = prop.city.trim();
            const streetStr = prop.street.trim();
            const priceNum = prop.price;
            const roomsNum = prop.rooms;
            const hashInput = `${streetStr}_${priceNum}_${roomsNum}`;
            const hashId = crypto.createHash('sha256').update(hashInput).digest('hex');
            const propRef = db
                .collection('cities')
                .doc(normalizedCityName)
                .collection('properties')
                .doc(hashId);
            batch.set(propRef, Object.assign(Object.assign({}, prop), { city: normalizedCityName, street: streetStr, source: 'yad2_alert', isPublic: true, createdAt: new Date(), ingestedAt: new Date(), listingType: prop.listingType === 'cooperation' ? 'external' : 'private' }), { merge: true });
            count++;
        }
        if (count > 0) {
            await batch.commit();
        }
        console.log(`Successfully inserted ${count} properties`);
    }
    catch (error) {
        console.error('Error processing Yad2 Webhook:', error);
    }
});
//# sourceMappingURL=globalYad2Webhook.js.map