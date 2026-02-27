"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.askAgencyAgent = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const admin = __importStar(require("firebase-admin"));
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
exports.askAgencyAgent = (0, https_1.onCall)({ secrets: [geminiApiKey], region: 'europe-west1' }, async (request) => {
    var _a;
    const { message } = request.data;
    if (!message || typeof message !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A valid message string must be provided.');
    }
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated to use the AI Agent.');
    }
    try {
        const db = admin.firestore();
        // 1. Fetch user's agencyId
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const agencyId = userData === null || userData === void 0 ? void 0 : userData.agencyId;
        if (!agencyId) {
            throw new https_1.HttpsError('failed-precondition', 'User is not associated with any agency.');
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
        const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `
You are the hOMER AI Assistant for a real estate agency. Here is the agency's current database snapshot in JSON format: 

${JSON.stringify(agencyData)} 

Answer the user's question accurately and ONLY based on this provided data. Be concise, professional, and speak in Hebrew.

User question: ${message}
`;
        const result = await model.generateContent(prompt);
        return { reply: result.response.text() };
    }
    catch (error) {
        console.error('askAgencyAgent Error:', error);
        throw new https_1.HttpsError('internal', 'An error occurred while communicating with the AI Agent.');
    }
});
//# sourceMappingURL=agent.js.map