import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as crypto from 'crypto';

const db = admin.firestore();

const geminiApiKey = defineSecret('GEMINI_API_KEY');

export const webhookProcessGlobalYad2Email = onRequest({
    region: 'europe-west1',
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: '512MiB',
}, async (req, res) => {

    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const htmlBody = req.body?.htmlBody;
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

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // --- Detect source site ---
        // Priority 1: explicit source field sent from Apps Script
        // Priority 2: scan HTML for known domain strings
        const htmlLower = htmlBody.toLowerCase();
        const explicitSource = (req.body?.source ?? '').toLowerCase();

        let detectedSource: 'yad2' | 'madlan' | 'unknown' = 'unknown';
        if (explicitSource === 'yad2' || explicitSource === 'madlan') {
            detectedSource = explicitSource as 'yad2' | 'madlan';
        } else if (htmlLower.includes('yad2.co.il') || htmlLower.includes('yad2')) {
            detectedSource = 'yad2';
        } else if (htmlLower.includes('madlan.co.il') || htmlLower.includes('madlan')) {
            detectedSource = 'madlan';
        }

        // --- Detect deal type (sale vs rent) from HTML keywords ---
        const isRentKeyword =
            htmlLower.includes('להשכרה') ||
            htmlLower.includes('השכרה') ||
            htmlLower.includes('שכירות');
        const isSaleKeyword =
            htmlLower.includes('למכירה') ||
            htmlLower.includes('מכירה');
        // Prefer explicit keyword; if ambiguous fall back to Gemini
        let htmlDealType: 'sale' | 'rent' | null = null;
        if (isRentKeyword && !isSaleKeyword) htmlDealType = 'rent';
        else if (isSaleKeyword && !isRentKeyword) htmlDealType = 'sale';

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
            const resolvedDealType: 'sale' | 'rent' =
                htmlDealType ??
                (prop.dealType === 'rent' ? 'rent' : 'sale');

            // Resolve source label
            const sourceLabel =
                detectedSource === 'yad2' ? 'yad2_alert' :
                detectedSource === 'madlan' ? 'madlan_alert' :
                'email_alert';

            batch.set(propRef, {
                ...prop,
                city: normalizedCityName,
                street: streetStr,
                source: sourceLabel,
                siteSource: detectedSource,   // 'yad2' | 'madlan' | 'unknown'
                type: resolvedDealType,        // 'sale' | 'rent'
                isPublic: true,
                createdAt: new Date(),
                ingestedAt: new Date(),
                listingType: prop.listingType === 'cooperation' ? 'external' : 'private',
            }, { merge: true });

            count++;
        }

        if (count > 0) {
            await batch.commit();
        }

        console.log(`Successfully inserted ${count} properties | source: ${detectedSource} | dealType: ${htmlDealType ?? 'from-gemini'}`);

    } catch (error: any) {
        console.error('Error processing Yad2 Webhook:', error);
    }
});