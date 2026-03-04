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
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

            let systemPrompt = '';

            if (entityType === 'properties' || entityType === 'property') {
                systemPrompt = `You are an expert data extraction assistant for a real estate CRM.
You will receive raw scraped data, a CSV, or image text. Intelligently map this data into a strictly formatted JSON array of objects.
Rules for property objects:
- "price" (number, overcome typos like '2.5M' to 2500000)
- "city" (string)
- "address" (string - street address)
- "rooms" (number)
- "sqm" (number - total size in square meters)
- "floor" (number)
- "type" (string - 'למכירה' or 'להשכרה')
- "kind" (string - property kind like 'דירה', 'פנטהאוז', 'דירת גן')
- "description" (string - EXTRACT THE FULL DESCRIPTION. Include details about property condition, view, orientations, and special features. Do not summarize too much.)
- "agentName" (string - name or email of the agent responsible for the property)
- "listingType" (string - 'exclusive' if it's an office listing/בלעדיות, 'external' if it's a cooperation/שת״פ, 'private' if it's a private owner/פרטי. Default to 'exclusive' if unsure.)
- "isExclusive" (boolean - true unless listingType is explicitly 'private' or 'external')
- "exclusivityEndDate" (string - 'YYYY-MM-DD' format if an exclusivity end date is found)
Return ONLY a valid parseable JSON array of objects. Do not use markdown wrapping (\`\`\`json) in the response. Ignore empty rows.`;
            } else if (entityType === 'leads' || entityType === 'lead') {
                systemPrompt = `You are an expert data extraction assistant for a real estate CRM.
You will receive raw scraped data, a CSV, or image text. Intelligently map this data into a strictly formatted JSON array of objects.
Rules for lead objects:
- "name" (string - full name)
- "phone" (string - clean numbers only if possible)
- "email" (string)
- "budget" (number, overcome typos like '2.5M' to 2500000)
- "city" (string - desired city)
- "notes" (string - extra details)
- "agentName" (string - name or email of the agent assigned to this lead)
Return ONLY a valid parseable JSON array of objects. Do not use markdown wrapping (\`\`\`json) in the response. Ignore empty rows.`;
            } else if (entityType === 'combined' || entityType === 'mixed') {
                systemPrompt = `You are an expert data extraction assistant for a real estate CRM.
You will receive a mixed file that might contain both Lead (client/owner) information and Property information in the same row or alternating rows.
Intelligently map this data into a strictly formatted JSON array of objects.
For each logical record, extract:
- Property fields: "address", "city", "price", "rooms", "sqm", "floor", "type", "kind", "description", "agentName", "listingType", "isExclusive"
- Lead/Owner fields: "name", "phone", "email", "notes"
- Metadata: "entityType" (string - 'property', 'lead', or 'combined' if the record has both)
Return ONLY a valid parseable JSON array of objects. Do not use markdown wrapping (\`\`\`json) in the response.`;
            } else {
                throw new HttpsError('invalid-argument', 'Unsupported entityType. Must be properties, leads, combined, or mixed.');
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

            console.log(`Extracting AI Data for ${entityType}. Payload size: ${payload.length} chars.`);
            const result = await model.generateContent(contents);
            let responseText = result.response.text().trim();
            console.log('AI Extraction successful. Raw response length:', responseText.length);

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
                throw new HttpsError('internal', `AI did not return valid JSON array. Response: ${responseText.substring(0, 100)}...`);
            }

            // In 'single' mode, AddPropertyModal expects `data` to be an object instead of array
            // If the AI returns an array, extract the first one
            if (mode === 'single') {
                const resultObj = Array.isArray(parsedData) && parsedData.length > 0 ? parsedData[0] : parsedData;
                return { success: true, data: resultObj };
            }

            // In 'bulk' mode, ensure it's an array
            return { success: true, data: Array.isArray(parsedData) ? parsedData : [parsedData] };
        } catch (error: any) {
            console.error('Gemini extraction error:', error);
            const msg = error.message || 'Unknown AI error';
            throw new HttpsError('internal', `AI Data Extraction failed: ${msg}. Check logs for details.`);
        }
    }
);
