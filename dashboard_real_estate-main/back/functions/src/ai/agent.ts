import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as admin from 'firebase-admin';
import { validateUserAuth } from '../config/authGuard';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

export const askAgencyAgent = onCall(
    { secrets: [geminiApiKey], region: 'europe-west1' },
    async (request) => {
        const { message } = request.data;
        if (!message || typeof message !== 'string') {
            throw new HttpsError('invalid-argument', 'A valid message string must be provided.');
        }

        try {
            const authData = await validateUserAuth(request);
            const agencyId = authData.agencyId;
            const db = admin.firestore();

            // 2. Query Properties
            const propertiesSnapshot = await db.collection('properties')
                .where('agencyId', '==', agencyId)
                .where('status', 'in', ['active', 'sold', 'rented']) // Fetch basic active ones or just without filter
                .limit(50)
                .get();

            const propertiesContext = propertiesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    status: data.status,
                    city: data.city,
                    street: data.street,
                    price: data.price,
                    rooms: data.rooms,
                    type: data.type,
                    kind: data.kind
                };
            });

            // 3. Query Leads
            const leadsSnapshot = await db.collection('leads')
                .where('agencyId', '==', agencyId)
                .limit(50)
                .get();

            const leadsContext = leadsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    name: data.name,
                    phone: data.phone,
                    status: data.status,
                    budget: data.budget,
                    desiredCity: data.desiredCity
                };
            });

            const agencyData = {
                properties: propertiesContext,
                leads: leadsContext
            };

            // 4. Init Gemini
            const genAI = new GoogleGenerativeAI(geminiApiKey.value());
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const prompt = `
You are the hOMER AI Assistant for a real estate agency. Here is the agency's current database snapshot in JSON format: 

${JSON.stringify(agencyData)} 

Answer the user's question accurately and ONLY based on this provided data. Be concise, professional, and speak in Hebrew.

User question: ${message}
`;

            const result = await model.generateContent(prompt);
            return { reply: result.response.text() };

        } catch (error) {
            console.error('askAgencyAgent Error:', error);
            throw new HttpsError('internal', 'An error occurred while communicating with the AI Agent.');
        }
    }
);
