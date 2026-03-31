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
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

            batch.set(propRef, {
                ...prop,
                city: normalizedCityName,
                street: streetStr,
                source: 'yad2_alert',
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

        console.log(`Successfully inserted ${count} properties`);

    } catch (error: any) {
        console.error('Error processing Yad2 Webhook:', error);
    }
});