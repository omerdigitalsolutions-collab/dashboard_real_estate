import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as admin from 'firebase-admin';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

export const askAgencyAgent = onCall(
    { secrets: [geminiApiKey], region: 'europe-west1' },
    async (request) => {
        const { message } = request.data;
        if (!message || typeof message !== 'string') {
            throw new HttpsError('invalid-argument', 'A valid message string must be provided.');
        }

        const uid = request.auth?.uid;
        if (!uid) {
            throw new HttpsError('unauthenticated', 'User must be authenticated to use the AI Agent.');
        }

        try {
            const db = admin.firestore();

            // 1. Fetch user's agencyId
            const userDoc = await db.collection('users').doc(uid).get();
            const userData = userDoc.data();
            const agencyId = userData?.agencyId;

            if (!agencyId) {
                throw new HttpsError('failed-precondition', 'User is not associated with any agency.');
            }

            // 2. Query Properties
            const propertiesSnapshot = await db.collection(`agencies/${agencyId}/properties`)
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
            const leadsSnapshot = await db.collection(`agencies/${agencyId}/leads`)
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
