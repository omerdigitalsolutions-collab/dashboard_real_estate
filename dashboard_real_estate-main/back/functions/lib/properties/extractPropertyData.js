"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPropertyData = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
// Base schema for a property
const PropertySchema = `
{
  "price": number | null,
  "city": string | null,
  "address": string | null,
  "rooms": number | null,
  "kind": string | null,
  "type": "sale" | "rent" | null,
  "description": string | null
}
`;
exports.extractPropertyData = (0, https_1.onCall)({ secrets: [geminiApiKey], region: 'europe-west1' }, async (request) => {
    const { text, image, mode } = request.data; // mode: 'single' | 'bulk'
    if (!text && !image) {
        throw new https_1.HttpsError('invalid-argument', 'Must provide either text or image data.');
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
    // Using Flash for fast extraction
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
You are a professional Israeli real estate data extraction assistant.
Extract property listings from the provided input (text or image).

Return strictly a valid JSON object. Do not use markdown blocks like \`\`\`json.
All text values should be in Hebrew.

If the "mode" is "single":
Extract exactly one property. Return a JSON object matching this schema:
${PropertySchema}

If the "mode" is "bulk":
Extract as many properties as you can find. Return a JSON object containing an array of properties:
{ "properties": [ ${PropertySchema} ] }

Rules:
- \`price\`: number only (remove currency symbols, commas). If none, return null.
- \`city\`: Extract the city.
- \`address\`: Extract the street name and number if available. If none, return the general area.
- \`rooms\`: number (e.g., 4 or 3.5).
- \`kind\`: e.g., 'דירה', 'בית פרטי', 'פנטהאוז', 'מסחרי', 'מגרש'.
- \`type\`: 'sale' if for sale, 'rent' if for rent. Default to 'sale' if unknown.
- \`description\`: the original raw description or any important notes.

Mode requested: "${mode || 'single'}"
`;
    try {
        const contents = [prompt];
        if (text) {
            contents.push(text);
        }
        if (image) {
            // Ensure image is stripped of data url prefix if passed from frontend
            const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
            contents.push({
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg" // You might want to pass mimeType dynamically if needed
                }
            });
        }
        const result = await model.generateContent(contents);
        const responseText = result.response.text();
        // Clean markdown if the model hallucinated it
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith('```json')) {
            cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
        }
        else if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
        }
        const parsedData = JSON.parse(cleanJson);
        return {
            success: true,
            data: mode === 'bulk' ? (parsedData.properties || []) : parsedData
        };
    }
    catch (error) {
        console.error('Gemini Extraction Error:', error);
        throw new https_1.HttpsError('internal', 'Failed to extract property data using AI.');
    }
});
//# sourceMappingURL=extractPropertyData.js.map