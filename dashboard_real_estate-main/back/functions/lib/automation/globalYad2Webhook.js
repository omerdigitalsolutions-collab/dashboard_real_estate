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
    var _a, _b, _c;
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
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        // --- Detect source site ---
        // Priority 1: explicit source field sent from Apps Script
        // Priority 2: scan HTML for known domain strings
        const htmlLower = htmlBody.toLowerCase();
        const explicitSource = ((_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.source) !== null && _c !== void 0 ? _c : '').toLowerCase();
        let detectedSource = 'unknown';
        if (explicitSource === 'yad2' || explicitSource === 'madlan') {
            detectedSource = explicitSource;
        }
        else if (htmlLower.includes('yad2.co.il') || htmlLower.includes('yad2')) {
            detectedSource = 'yad2';
        }
        else if (htmlLower.includes('madlan.co.il') || htmlLower.includes('madlan')) {
            detectedSource = 'madlan';
        }
        // --- Detect deal type (sale vs rent) from HTML keywords ---
        const isRentKeyword = htmlLower.includes('להשכרה') ||
            htmlLower.includes('השכרה') ||
            htmlLower.includes('שכירות');
        const isSaleKeyword = htmlLower.includes('למכירה') ||
            htmlLower.includes('מכירה');
        // Prefer explicit keyword; if ambiguous fall back to Gemini
        let htmlDealType = null;
        if (isRentKeyword && !isSaleKeyword)
            htmlDealType = 'rent';
        else if (isSaleKeyword && !isRentKeyword)
            htmlDealType = 'sale';
        const prompt = `You are an expert real estate data parser. Extract ALL property listings from the provided real-estate alert email HTML (from Yad2 or Madlan) into a strict JSON ARRAY of objects.
  Rules for each object:
  - \`price\`: Number (remove ₪ and commas. e.g., 2290000).
  - \`city\`: Extract from the header (e.g., 'מודיעין מכבים רעות') and normalize to a short string (e.g., 'מודיעין').
  - \`neighborhood\`: Extract from the piped string (e.g., 'הפרחים | דירה...').
  - \`street\`: Extract the line below the price. If missing, leave as empty string.
  - \`propertyType\`: Extract from the piped string (e.g., 'דירה', 'פנטהאוז').
  - \`rooms\`: Number, extracted from the piped string.
  - \`sqm\`: Number, extracted from the piped string (digits only).
  - \`dealType\`: Determine whether each listing is a sale or a rental. Set to 'sale' if the listing says 'למכירה' or 'מכירה', set to 'rent' if it says 'להשכרה' or 'השכרה'. Default to 'sale' if unclear.
  - \`listingType\` & \`agencyName\`: Look below 'לפרטים נוספים'. If there is a name (e.g., 'Remax Gold'), set listingType to 'cooperation' and agencyName to that name. If missing, set listingType to 'private'.
  - \`yad2Link\`: Search the HTML for an href link to yad2.co.il or madlan.co.il (e.g., on a button or anchor tag 'לצפייה במודעה'). If found, extract the URL. Otherwise, leave empty string.
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
            const cityRef = db.collection('cities').doc(normalizedCityName);
            batch.set(cityRef, {
                exists: true,
                lastUpdate: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            const propRef = cityRef.collection('properties').doc(hashId);
            // Resolve deal type: HTML keyword takes priority, else Gemini's answer, else 'sale'
            const resolvedDealType = htmlDealType !== null && htmlDealType !== void 0 ? htmlDealType : (prop.dealType === 'rent' ? 'rent' : 'sale');
            // Resolve source label
            const sourceLabel = detectedSource === 'yad2' ? 'yad2_alert' :
                detectedSource === 'madlan' ? 'madlan_alert' :
                    'email_alert';
            batch.set(propRef, Object.assign(Object.assign({}, prop), { city: normalizedCityName, street: streetStr, source: sourceLabel, siteSource: detectedSource, type: resolvedDealType, isPublic: true, createdAt: new Date(), ingestedAt: new Date(), listingType: prop.listingType === 'cooperation' ? 'external' : 'private' }), { merge: true });
            count++;
        }
        if (count > 0) {
            await batch.commit();
        }
        console.log(`Successfully inserted ${count} properties | source: ${detectedSource} | dealType: ${htmlDealType !== null && htmlDealType !== void 0 ? htmlDealType : 'from-gemini'}`);
    }
    catch (error) {
        console.error('Error processing Yad2 Webhook:', error);
    }
});
//# sourceMappingURL=globalYad2Webhook.js.map