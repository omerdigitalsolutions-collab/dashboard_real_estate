"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importPropertyFromUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const axios_1 = __importDefault(require("axios"));
const generative_ai_1 = require("@google/generative-ai");
const params_1 = require("firebase-functions/params");
// Initialize Gemini API Key via Secret Manager
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
exports.importPropertyFromUrl = (0, https_1.onCall)({
    secrets: [geminiApiKey]
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { url } = request.data;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        throw new https_1.HttpsError('invalid-argument', 'A valid URL is required.');
    }
    const apiKey = geminiApiKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'GEMINI_API_KEY is not configured in environment.');
    }
    try {
        // 1. Fetch the HTML
        // Use a generic User-Agent to avoid basic bot blocks
        const response = await axios_1.default.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 10000,
        });
        let html = response.data;
        if (typeof html !== 'string') {
            throw new Error('Received non-text response');
        }
        // 2. Strip bloated tags (script, style, svg, noscript)
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
        html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
        // Extract a subset of characters to avoid token limits (e.g. max 15,000 chars)
        const htmlSnippet = html.slice(0, 15000);
        // 3. Ask Gemini Flash to extract the details
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
You are a real estate data extraction assistant.
I am providing HTML code from a real estate listing URL (e.g., Yad2, Madlan, or similar).
Please extract the property details and return ONLY a valid JSON object matching this structure EXACTLY. If a field is not found, return null or empty array.

{
  "address": "string (full street name and number if possible, or leave empty if not found)",
  "city": "string (e.g., 'תל אביב', 'רמת גן')",
  "price": "number (extract only the digits, e.g., 2500000)",
  "rooms": "number (e.g., 3.5)",
  "floor": "number (e.g., 4)",
  "kind": "string - must be ONLY ONE of exactly: 'דירה', 'בית פרטי', 'פנטהאוז', 'מסחרי'",
  "type": "string - must be ONLY ONE of exactly: 'sale', 'rent'",
  "description": "string (the listing description)",
  "imageUrls": ["string", "string"] (list of high-res image URLs found in the HTML)
}

Important Rules:
- Return ONLY valid JSON, without markdown formatting blocks (like \`\`\`json).
- Make sure "kind" is exactly one of the 4 options. If villa/cottage set 'בית פרטי'. 
- Type: if the listing is for rent/שכירות, set 'rent', otherwise 'sale'.
- Price: return a clean integer number without commas or currency symbols.

Here is the HTML snippet:
${htmlSnippet}
`;
        const result = await model.generateContent(prompt);
        let textResult = result.response.text();
        // Clean markdown backticks if Gemini includes them
        textResult = textResult.replace(/^```[a-z]*\n?/gm, '').replace(/```$/gm, '').trim();
        const extractedData = JSON.parse(textResult);
        return { success: true, data: extractedData };
    }
    catch (error) {
        console.error('Magic Import Error:', error.message);
        return { success: false, reason: error.message };
    }
});
//# sourceMappingURL=importProperty.js.map