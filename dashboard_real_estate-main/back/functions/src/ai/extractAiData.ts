import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

export const extractAiData = onCall(
    {
        secrets: [geminiApiKey],
        region: 'europe-west1',
        timeoutSeconds: 300,
        memory: '1GiB',
    },
    async (request) => {
        const { payload, mode = 'single', entityType } = request.data as any;

        if (!payload || !entityType) {
            throw new HttpsError('invalid-argument', 'Missing payload or entityType.');
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            console.error('GEMINI_API_KEY is not configured');
            throw new HttpsError('internal', 'AI Data Extraction is unavailable.');
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

            let systemPrompt = '';

            if (entityType === 'properties') {
                systemPrompt = `You are an expert data extraction assistant for a real estate CRM.
You will receive raw scraped data, a CSV, or image text. Intelligently map this data into a strictly formatted JSON array of objects.
Rules for property objects:
- "price" (number, overcome typos like '2.5M' to 2500000)
- "city" (string)
- "address" (string - street address)
- "rooms" (number)
- "type" (string - 'למכירה' or 'להשכרה')
- "kind" (string - property kind like 'דירה', 'פנטהאוז', 'דירת גן')
- "description" (string - the raw description if any)
Return ONLY a valid parseable JSON array of objects. Do not use markdown wrapping (\`\`\`json) in the response. Ignore empty rows.`;
            } else if (entityType === 'leads') {
                systemPrompt = `You are an expert data extraction assistant for a real estate CRM.
You will receive raw scraped data, a CSV, or image text. Intelligently map this data into a strictly formatted JSON array of objects.
Rules for lead objects:
- "name" (string - full name)
- "phone" (string - clean numbers only if possible)
- "email" (string)
- "budget" (number, overcome typos like '2.5M' to 2500000)
- "city" (string - desired city)
- "notes" (string - extra details)
Return ONLY a valid parseable JSON array of objects. Do not use markdown wrapping (\`\`\`json) in the response. Ignore empty rows.`;
            } else {
                throw new HttpsError('invalid-argument', 'Unsupported entityType. Must be properties or leads.');
            }

            // Decide payload format (if it's base64 image or text)
            let contents: any[] = [];
            if (typeof payload === 'string' && payload.startsWith('data:image')) {
                const base64Data = payload.replace(/^data:image\/\w+;base64,/, '');
                const mimeTypeMatch = payload.match(/^data:(image\/\w+);base64,/);
                const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
                contents = [
                    { text: systemPrompt },
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType,
                        },
                    },
                ];
            } else {
                contents = [
                    { text: systemPrompt },
                    { text: `Payload to extract:\n${payload}` }
                ];
            }

            const result = await model.generateContent(contents);
            let responseText = result.response.text().trim();

            // Clean the JSON format if the AI returned it with markdown
            if (responseText.startsWith('```json')) {
                responseText = responseText.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (responseText.startsWith('```')) {
                responseText = responseText.replace(/^```/, '').replace(/```$/, '').trim();
            }

            let parsedData;
            try {
                parsedData = JSON.parse(responseText);
            } catch (err) {
                console.error('Failed to parse model output as JSON. Output was:', responseText);
                throw new HttpsError('internal', 'AI did not return valid JSON array.');
            }

            // In 'single' mode, AddPropertyModal expects `data` to be an object instead of array
            // If the AI returns an array, extract the first one
            if (mode === 'single') {
                const resultObj = Array.isArray(parsedData) && parsedData.length > 0 ? parsedData[0] : parsedData;
                return { success: true, data: resultObj };
            }

            // In 'bulk' mode, ensure it's an array
            return { success: true, data: Array.isArray(parsedData) ? parsedData : [parsedData] };
        } catch (error) {
            console.error('Gemini extraction error:', error);
            throw new HttpsError('internal', 'AI Data Extraction failed. Check logs for details.');
        }
    }
);
