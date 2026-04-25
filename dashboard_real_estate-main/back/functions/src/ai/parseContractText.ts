import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TemplateField } from '../types';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

export const parseContractText = onCall(
    {
        secrets: [geminiApiKey],
        region: 'europe-west1',
        timeoutSeconds: 120,
        cors: true,
    },
    async (request) => {
        const { rawText } = request.data as { rawText?: string };

        if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 50) {
            throw new HttpsError(
                'invalid-argument',
                'rawText must be a non-empty string with at least 50 characters.'
            );
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            console.error('GEMINI_API_KEY is not configured');
            throw new HttpsError('internal', 'AI Contract Parsing is unavailable.');
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const systemPrompt = `You are a legal contract parser for a Hebrew real estate CRM.

TASK:
Given the raw Hebrew contract text below, do two things:
1. Produce a "taggedText" — the EXACT same text, but with every blank/placeholder replaced by {{field_NNN}} tokens (e.g. {{field_001}}, {{field_002}}, ...). Common placeholder patterns to detect: sequences of underscores (___), brackets like [שם], <<תאריך>>, parentheses like (______), and any obviously blank field.
2. Produce a "fieldsMetadata" JSON array where each entry describes one {{field_NNN}} token.

RULES:
- Preserve ALL original Hebrew text, punctuation, line breaks, and paragraph structure exactly.
- Do not add, remove, or rewrite any text except replacing placeholders with {{field_NNN}} tokens.
- Check for conflicts: if the original text contains a {{field_NNN}} placeholder, rename it to {{field_CONFLICT_NNN}} to avoid collisions.
- For each field infer:
  - "id": the token string, e.g. "field_001"
  - "label": a short Hebrew human-readable name based on surrounding context, e.g. "שם המוכר"
  - "type": one of "text", "date", "signature"
  - "role": MUST be exactly "client" or "agent" — never null, never "N/A". Use "client" for buyer/tenant/client fields, "agent" for agent/broker fields. When uncertain, default to "client".
  - "mappingTarget": OPTIONAL — if the field clearly maps to a known CRM data point, set this to one of: "deal.projectedCommission", "deal.actualCommission", "property.address.fullAddress", "property.address.city", "property.financials.price", "lead.name", "lead.phone". Otherwise omit.
  - "required": true for signature fields, true for name/date/price fields, false for optional notes fields.

OUTPUT FORMAT:
Return ONLY a raw JSON object (no markdown, no code blocks) with exactly these two keys:
{
  "taggedText": "...full tagged contract text here...",
  "fieldsMetadata": [
    { "id": "field_001", "label": "שם המוכר", "type": "text", "role": "client", "mappingTarget": "lead.name", "required": true },
    ...
  ]
}`;

            const contents = [
                { text: systemPrompt },
                { text: `Contract text to parse:\n\n${rawText}` }
            ];

            console.log(
                `Parsing contract text. Input size: ${rawText.length} chars, ${rawText.split('\n').length} lines.`
            );

            const result = await model.generateContent(contents);
            let responseText = result.response.text().trim();

            console.log('AI Contract Parsing successful. Raw response length:', responseText.length);

            // Clean the JSON format if the AI returned it with markdown
            if (responseText.startsWith('```json')) {
                responseText = responseText.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (responseText.startsWith('```')) {
                responseText = responseText.replace(/^```/, '').replace(/```$/, '').trim();
            }

            let parsed: { taggedText: string; fieldsMetadata: TemplateField[] };
            try {
                parsed = JSON.parse(responseText);
            } catch (err) {
                console.error('Failed to parse model output as JSON. Output was:', responseText);
                throw new HttpsError(
                    'internal',
                    `AI did not return valid JSON. Response: ${responseText.substring(0, 150)}...`
                );
            }

            // Validate response structure
            if (!parsed.taggedText || !Array.isArray(parsed.fieldsMetadata)) {
                throw new HttpsError(
                    'internal',
                    'AI response is missing required keys: taggedText (string) or fieldsMetadata (array).'
                );
            }

            // Sanitize and validate fieldsMetadata
            for (const field of parsed.fieldsMetadata) {
                if (!field.id || !field.label || !field.type || !field.role) {
                    throw new HttpsError(
                        'internal',
                        `AI response contains incomplete field metadata. Each field must have id, label, type, and role.`
                    );
                }
                // Sanitize type — fall back to 'text' if model hallucinated an invalid value
                if (!['text', 'date', 'signature'].includes(field.type)) {
                    field.type = 'text';
                }
                // Sanitize role — fall back to 'client' rather than crashing
                if (!['agent', 'client'].includes(field.role)) {
                    field.role = 'client';
                }
            }

            return {
                taggedText: parsed.taggedText,
                fieldsMetadata: parsed.fieldsMetadata
            };
        } catch (error: any) {
            console.error('Contract parsing error:', error);
            if (error instanceof HttpsError) {
                throw error;
            }
            const msg = error.message || 'Unknown AI error';
            throw new HttpsError(
                'internal',
                `AI Contract Parsing failed: ${msg}. Check logs for details.`
            );
        }
    }
);
