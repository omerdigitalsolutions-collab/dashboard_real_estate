"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importPropertyFromUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const storage_1 = require("firebase-admin/storage");
const generative_ai_1 = require("@google/generative-ai");
const axios_1 = __importDefault(require("axios"));
const featureGuard_1 = require("../config/featureGuard");
const descriptionCleaner_1 = require("../utils/descriptionCleaner");
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
// Runs inside Apify's Puppeteer browser — extracts page text + image URLs
const PAGE_FUNCTION = `
async function pageFunction(context) {
  const { page, request } = context;
  await page.waitForTimeout(3000);
  const text = await page.evaluate(() => document.body.innerText.substring(0, 15000));
  const images = await page.evaluate(() => {
    const urls = new Set();
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.dataset.src || img.dataset.lazy || '';
      if (src.startsWith('http') && !/logo|icon|avatar|sprite|placeholder|1x1|pixel|svg/i.test(src)) {
        urls.add(src);
      }
    });
    return Array.from(urls).slice(0, 15);
  });
  return { text, images, url: request.url };
}
`;
exports.importPropertyFromUrl = (0, https_1.onCall)({
    secrets: [geminiApiKey],
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
}, async (request) => {
    await (0, featureGuard_1.requireFeatureAccess)(request, 'AI_IMPORT_TEXT');
    const { url } = request.data;
    if (!(url === null || url === void 0 ? void 0 : url.startsWith('http'))) {
        throw new https_1.HttpsError('invalid-argument', 'כתובת URL לא תקינה');
    }
    const geminiKey = geminiApiKey.value();
    if (!geminiKey)
        throw new https_1.HttpsError('internal', 'GEMINI_API_KEY לא מוגדר');
    // ── 1. Scrape page with Apify (Puppeteer, handles JS-heavy sites like Yad2) ──
    let pageText = '';
    let imageUrls = [];
    throw new https_1.HttpsError('internal', 'Apify integration disabled. Please configure APIFY_API_KEY to enable web scraping.');
    // ── 2. Extract structured property data with Gemini ──────────────────────────
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `אתה עוזר חילוץ נתוני נדל"ן לישראל.
חלץ מהטקסט הבא את פרטי הנכס והחזר JSON בלבד (ללא markdown, ללא הסברים):
{
  "city": "שם עיר",
  "address": "שם רחוב ומספר בית בלבד",
  "price": מספר שלם בלבד ללא פסיקות,
  "rooms": מספר או null,
  "sqm": מספר שלם או null,
  "floor": מספר שלם או null,
  "type": "forsale" או "rent",
  "kind": "דירה" או "בית פרטי" או "פנטהאוז" או "מסחרי",
  "description": "תיאור מלא ומפורט של הנכס"
}

טקסט הנכס:
${pageText}`;
    const aiResult = await model.generateContent(prompt);
    let responseText = aiResult.response.text().trim()
        .replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    let extracted;
    try {
        extracted = JSON.parse(responseText);
    }
    catch (_a) {
        console.error('Gemini response was not valid JSON:', responseText.substring(0, 200));
        throw new https_1.HttpsError('internal', 'שגיאה בעיבוד הנתונים מה-AI');
    }
    // ── 3. Download images and re-upload to Firebase Storage ─────────────────────
    const bucket = (0, storage_1.getStorage)().bucket();
    const uploadedImages = [];
    await Promise.allSettled(imageUrls.slice(0, 10).map(async (imgUrl, i) => {
        var _a, _b;
        try {
            const imgRes = await axios_1.default.get(imgUrl, {
                responseType: 'arraybuffer',
                timeout: 8000,
                headers: { Referer: url },
            });
            const contentType = imgRes.headers['content-type'] || 'image/jpeg';
            const ext = ((_b = (_a = contentType.split('/')[1]) === null || _a === void 0 ? void 0 : _a.split(';')[0]) === null || _b === void 0 ? void 0 : _b.split('+')[0]) || 'jpg';
            const fileName = `imported-properties/${Date.now()}_${i}.${ext}`;
            await bucket.file(fileName).save(Buffer.from(imgRes.data), {
                metadata: { contentType },
                public: true,
            });
            uploadedImages.push(`https://storage.googleapis.com/${bucket.name}/${fileName}`);
        }
        catch (_c) {
            // skip individual failed images silently
        }
    }));
    return {
        city: extracted.city || '',
        address: extracted.address || '',
        price: extracted.price || null,
        rooms: extracted.rooms || null,
        sqm: extracted.sqm || null,
        floor: extracted.floor || null,
        type: extracted.type || 'forsale',
        kind: extracted.kind || 'דירה',
        description: (0, descriptionCleaner_1.cleanDescription)(extracted.description || ''),
        images: uploadedImages,
        externalLink: url,
    };
});
//# sourceMappingURL=importPropertyFromUrl.js.map