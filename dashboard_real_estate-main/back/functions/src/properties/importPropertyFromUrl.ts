import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getStorage } from 'firebase-admin/storage';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { requireFeatureAccess } from '../config/featureGuard';
import { cleanDescription } from '../utils/descriptionCleaner';

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const apifyApiKey = defineSecret('APIFY_API_KEY');

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

export const importPropertyFromUrl = onCall(
    {
        secrets: [geminiApiKey, apifyApiKey],
        region: 'europe-west1',
        timeoutSeconds: 120,
        memory: '512MiB',
        cors: true,
    },
    async (request) => {
        await requireFeatureAccess(request, 'AI_IMPORT_TEXT');

        const { url } = request.data as { url: string };
        if (!url?.startsWith('http')) {
            throw new HttpsError('invalid-argument', 'כתובת URL לא תקינה');
        }

        const apifyToken = apifyApiKey.value();
        const geminiKey = geminiApiKey.value();

        if (!apifyToken) throw new HttpsError('internal', 'APIFY_API_KEY לא מוגדר');
        if (!geminiKey) throw new HttpsError('internal', 'GEMINI_API_KEY לא מוגדר');

        // ── 1. Scrape page with Apify (Puppeteer, handles JS-heavy sites like Yad2) ──
        let pageText = '';
        let imageUrls: string[] = [];

        try {
            const runRes = await axios.post(
                `https://api.apify.com/v2/acts/apify~web-scraper/runs?token=${apifyToken}&waitForFinish=80`,
                {
                    startUrls: [{ url }],
                    pageFunction: PAGE_FUNCTION,
                    maxCrawlingDepth: 0,
                    maxPagesPerCrawl: 1,
                    proxyConfiguration: { useApifyProxy: true },
                },
                { timeout: 90000 }
            );

            const run = runRes.data?.data;
            if (run?.status !== 'SUCCEEDED') {
                throw new Error(`Apify run ended with status: ${run?.status}`);
            }

            const datasetRes = await axios.get(
                `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${apifyToken}`
            );

            const item = datasetRes.data?.[0];
            pageText = item?.text || '';
            imageUrls = item?.images || [];
        } catch (err: any) {
            console.error('Apify scraping error:', err.message);
            throw new HttpsError('internal', 'שגיאה בגישה לדף. ייתכן שהכתובת שגויה או שהאתר חסום.');
        }

        if (!pageText.trim()) {
            throw new HttpsError('not-found', 'לא הצלחנו לחלץ תוכן מהדף');
        }

        // ── 2. Extract structured property data with Gemini ──────────────────────────
        const genAI = new GoogleGenerativeAI(geminiKey);
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

        let extracted: any;
        try {
            extracted = JSON.parse(responseText);
        } catch {
            console.error('Gemini response was not valid JSON:', responseText.substring(0, 200));
            throw new HttpsError('internal', 'שגיאה בעיבוד הנתונים מה-AI');
        }

        // ── 3. Download images and re-upload to Firebase Storage ─────────────────────
        const bucket = getStorage().bucket();
        const uploadedImages: string[] = [];

        await Promise.allSettled(
            imageUrls.slice(0, 10).map(async (imgUrl, i) => {
                try {
                    const imgRes = await axios.get(imgUrl, {
                        responseType: 'arraybuffer',
                        timeout: 8000,
                        headers: { Referer: url },
                    });
                    const contentType = imgRes.headers['content-type'] || 'image/jpeg';
                    const ext = contentType.split('/')[1]?.split(';')[0]?.split('+')[0] || 'jpg';
                    const fileName = `imported-properties/${Date.now()}_${i}.${ext}`;
                    await bucket.file(fileName).save(Buffer.from(imgRes.data), {
                        metadata: { contentType },
                        public: true,
                    });
                    uploadedImages.push(`https://storage.googleapis.com/${bucket.name}/${fileName}`);
                } catch {
                    // skip individual failed images silently
                }
            })
        );

        return {
            city: extracted.city || '',
            address: extracted.address || '',
            price: extracted.price || null,
            rooms: extracted.rooms || null,
            sqm: extracted.sqm || null,
            floor: extracted.floor || null,
            type: extracted.type || 'forsale',
            kind: extracted.kind || 'דירה',
            description: cleanDescription(extracted.description || ''),
            images: uploadedImages,
            externalLink: url,
        };
    }
);
