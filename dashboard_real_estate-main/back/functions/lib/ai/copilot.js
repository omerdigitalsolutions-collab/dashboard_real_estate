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
exports.getSmartInsights = exports.askCopilot = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const admin = __importStar(require("firebase-admin"));
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
// ── Helper: current month boundaries (UTC) ────────────────────────────────────
function currentMonthBounds() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
}
// ── Tool definitions for the Gemini model ─────────────────────────────────────
const tools = [
    {
        functionDeclarations: [
            {
                name: 'getTopAgent',
                description: 'Returns the agent with the highest total commission from Won deals in the current month. ' +
                    'Use this to answer questions like "who is the best agent?" or "מי הסוכן הכי טוב?".',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'getHighestCommissionProperty',
                description: 'Returns the property with the highest price from the active listings. ' +
                    'Use this to answer questions like "what is the most expensive property?" or "מה הנכס הכי יקר?".',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'getLeadStats',
                description: 'Returns a summary of leads including total count, count per status, and count per source. ' +
                    'Use this to answer questions about leads, conversion, or pipeline.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'getSummaryStats',
                description: 'Returns a high-level dashboard summary: total active properties, total leads, total deals won this month, ' +
                    'and total commission earned this month. Use for general "how are we doing?" questions.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                    required: [],
                },
            },
        ],
    },
];
// ── Local tool executors (all filtered by agencyId) ───────────────────────────
async function getTopAgent(db, agencyId) {
    const { start, end } = currentMonthBounds();
    const snapshot = await db
        .collection('deals')
        .where('agencyId', '==', agencyId)
        .where('stage', '==', 'Won')
        .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('updatedAt', '<', admin.firestore.Timestamp.fromDate(end))
        .get();
    if (snapshot.empty) {
        return { message: 'No won deals found for the current month.' };
    }
    const agentTotals = {};
    snapshot.forEach(doc => {
        var _a, _b, _c, _d;
        const d = doc.data();
        const id = (_b = (_a = d.agentId) !== null && _a !== void 0 ? _a : d.assignedAgentId) !== null && _b !== void 0 ? _b : 'unknown';
        const name = (_d = (_c = d.agentName) !== null && _c !== void 0 ? _c : d.assignedAgentName) !== null && _d !== void 0 ? _d : id;
        const commission = typeof d.projectedCommission === 'number' ? d.projectedCommission : 0;
        if (!agentTotals[id])
            agentTotals[id] = { name, commission: 0 };
        agentTotals[id].commission += commission;
    });
    const top = Object.values(agentTotals).sort((a, b) => b.commission - a.commission)[0];
    return { topAgent: top, totalAgentsWithWonDeals: Object.keys(agentTotals).length };
}
async function getHighestCommissionProperty(db, agencyId) {
    const snapshot = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .orderBy('price', 'desc')
        .limit(1)
        .get();
    if (snapshot.empty) {
        return { message: 'No active properties found.' };
    }
    const doc = snapshot.docs[0];
    const d = doc.data();
    return {
        id: doc.id,
        address: `${d.street}, ${d.city}`,
        price: d.price,
        rooms: d.rooms,
        type: d.type,
        status: d.status,
    };
}
async function getLeadStats(db, agencyId) {
    const snapshot = await db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .get();
    const statusCounts = {};
    const sourceCounts = {};
    snapshot.forEach(doc => {
        var _a, _b, _c, _d;
        const d = doc.data();
        const status = (_a = d.status) !== null && _a !== void 0 ? _a : 'unknown';
        const source = (_b = d.source) !== null && _b !== void 0 ? _b : 'unknown';
        statusCounts[status] = ((_c = statusCounts[status]) !== null && _c !== void 0 ? _c : 0) + 1;
        sourceCounts[source] = ((_d = sourceCounts[source]) !== null && _d !== void 0 ? _d : 0) + 1;
    });
    return {
        totalLeads: snapshot.size,
        byStatus: statusCounts,
        bySource: sourceCounts,
    };
}
async function getSummaryStats(db, agencyId) {
    const { start, end } = currentMonthBounds();
    const [propertiesSnap, leadsSnap, dealsSnap] = await Promise.all([
        db.collection('properties').where('agencyId', '==', agencyId).where('status', '==', 'active').get(),
        db.collection('leads').where('agencyId', '==', agencyId).get(),
        db.collection('deals')
            .where('agencyId', '==', agencyId)
            .where('stage', '==', 'Won')
            .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(start))
            .where('updatedAt', '<', admin.firestore.Timestamp.fromDate(end))
            .get(),
    ]);
    let totalCommission = 0;
    dealsSnap.forEach(doc => {
        const d = doc.data();
        if (typeof d.projectedCommission === 'number')
            totalCommission += d.projectedCommission;
    });
    return {
        activeProperties: propertiesSnap.size,
        totalLeads: leadsSnap.size,
        wonDealsThisMonth: dealsSnap.size,
        totalCommissionThisMonth: totalCommission,
    };
}
// ── Main Cloud Function ────────────────────────────────────────────────────────
exports.askCopilot = (0, https_1.onCall)({ secrets: [geminiApiKey], region: 'europe-west1', cors: true }, async (request) => {
    // 1. Auth guard
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in to use the AI Copilot.');
    }
    const { prompt } = request.data;
    if (!prompt || typeof prompt !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A valid prompt string must be provided.');
    }
    // 2. Tenant isolation: get agencyId from custom claim
    const agencyId = request.auth.token.agencyId;
    if (!agencyId) {
        throw new https_1.HttpsError('failed-precondition', 'User is not associated with any agency.');
    }
    const db = admin.firestore();
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', tools });
    const systemInstruction = {
        role: 'user',
        parts: [
            {
                text: 'You are the hOMER AI Copilot for a real estate agency. ' +
                    'You help managers understand their business performance. ' +
                    'Always answer in Hebrew unless the user explicitly writes in English. ' +
                    'Be concise, professional, and data-driven. ' +
                    'If you need data, ALWAYS use the provided tools instead of guessing.',
            },
        ],
    };
    try {
        // 3. Initial model call with user prompt
        const chat = model.startChat({
            systemInstruction,
            history: [],
        });
        let response = await chat.sendMessage(prompt);
        let candidate = response.response;
        // 4. Function calling loop
        let maxIterations = 5;
        while (candidate.functionCalls() && candidate.functionCalls().length > 0 && maxIterations-- > 0) {
            const functionCall = candidate.functionCalls()[0];
            const { name } = functionCall;
            console.log(`[askCopilot] Model requested tool: ${name}`);
            let toolResult;
            try {
                switch (name) {
                    case 'getTopAgent':
                        toolResult = await getTopAgent(db, agencyId);
                        break;
                    case 'getHighestCommissionProperty':
                        toolResult = await getHighestCommissionProperty(db, agencyId);
                        break;
                    case 'getLeadStats':
                        toolResult = await getLeadStats(db, agencyId);
                        break;
                    case 'getSummaryStats':
                        toolResult = await getSummaryStats(db, agencyId);
                        break;
                    default:
                        console.warn(`[askCopilot] Unknown tool requested: ${name}`);
                        toolResult = { error: `Tool "${name}" is not available.` };
                }
            }
            catch (toolError) {
                console.error(`[askCopilot] Tool "${name}" execution error:`, toolError);
                toolResult = { error: 'Failed to fetch data from the database.' };
            }
            // 5. Send tool result back to the model
            response = await chat.sendMessage([
                {
                    functionResponse: {
                        name,
                        response: toolResult,
                    },
                },
            ]);
            candidate = response.response;
        }
        // 6. Extract final text response
        const finalText = candidate.text();
        if (!finalText) {
            throw new https_1.HttpsError('internal', 'The AI model did not generate a text response.');
        }
        return { response: finalText };
    }
    catch (error) {
        console.error('[askCopilot] Fatal error:', error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('internal', 'An error occurred while communicating with the AI Copilot.');
    }
});
// ── Smart Insights Endpoint ──────────────────────────────────────────────────
exports.getSmartInsights = (0, https_1.onCall)({ secrets: [geminiApiKey], region: 'europe-west1', cors: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f;
    // Enforce explicit CORS headers for local dev and production
    if (request.rawRequest) {
        const origin = request.rawRequest.headers.origin;
        if (origin === 'http://localhost:5173' || (origin === null || origin === void 0 ? void 0 : origin.includes('homer'))) {
            (_a = request.rawRequest.res) === null || _a === void 0 ? void 0 : _a.set('Access-Control-Allow-Origin', origin);
            (_b = request.rawRequest.res) === null || _b === void 0 ? void 0 : _b.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            (_c = request.rawRequest.res) === null || _c === void 0 ? void 0 : _c.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            (_d = request.rawRequest.res) === null || _d === void 0 ? void 0 : _d.set('Access-Control-Allow-Credentials', 'true');
        }
    }
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in.');
    }
    const agencyId = request.auth.token.agencyId;
    if (!agencyId) {
        throw new https_1.HttpsError('failed-precondition', 'User is not associated with any agency.');
    }
    const db = admin.firestore();
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
    // Use gemini-2.5-flash — consistent with other AI features in this project
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    try {
        // 1. Fetch data snapshots
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const [propertiesSnap, leadsSnap, dealsSnap, agentsSnap] = await Promise.all([
            db.collection('properties').where('agencyId', '==', agencyId).limit(100).get(),
            db.collection('leads').where('agencyId', '==', agencyId).get(),
            db.collection('deals').where('agencyId', '==', agencyId).where('stage', '==', 'Won').get(),
            db.collection('users').where('agencyId', '==', agencyId).get()
        ]);
        // Transform into compact representation
        const properties = propertiesSnap.docs.map(d => {
            var _a;
            const data = d.data();
            return { id: d.id, address: `${data.street}, ${data.city}`, price: data.price, createdAt: (_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate() };
        });
        const leadsStatusCount = {};
        const leadsSourceCount = {};
        leadsSnap.docs.forEach(d => {
            const st = d.data().status || 'new';
            const src = d.data().source || 'unknown';
            leadsStatusCount[st] = (leadsStatusCount[st] || 0) + 1;
            leadsSourceCount[src] = (leadsSourceCount[src] || 0) + 1;
        });
        const currentMonthDeals = dealsSnap.docs.map(d => d.data()).filter(d => {
            var _a;
            const date = ((_a = d.updatedAt) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date(0);
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        });
        const agents = agentsSnap.docs.map(d => ({ name: d.data().firstName + ' ' + (d.data().lastName || ''), role: d.data().role }));
        const oldPropertiesCount = properties.filter(p => p.createdAt && p.createdAt < thirtyDaysAgo).length;
        // 2. Build the context prompt — embed JSON schema in text
        const contextPrompt = `You are the hOMER Smart Insights Engine. Analyze the following real estate agency data and generate exactly 3 highly actionable, specific insights for the manager.
Write ALL text IN HEBREW.

DATA SNAPSHOT:
- Active Properties: ${properties.length} (Oldest ones: ${oldPropertiesCount} older than 30 days)
- Leads by Status: ${JSON.stringify(leadsStatusCount)}
- Leads by Source: ${JSON.stringify(leadsSourceCount)}
- Deals Won This Month: ${currentMonthDeals.length}
- Agents on Team: ${agents.length}

RULES:
1. Provide exactly 3 insights.
2. If there are old properties (>30 days), suggest a price reduction or fresh marketing.
3. If there are many "new" leads untouched, warn about conversion rates.
4. If a specific lead source performs well (or poorly), point it out.
5. Be specific but keep it concise and punchy.

Respond ONLY with a valid JSON array, no markdown, no extra text. Use this exact schema:
[
  {
    "badge": "short Hebrew badge (e.g. מחיר, יעד, קמפיין, לידים, עסקאות)",
    "category": "price | goal | campaign | lead | deal",
    "title": "Hebrew insight title",
    "text": "Hebrew explanation and recommendation"
  }
]`;
        // 3. Call Gemini
        const result = await model.generateContent(contextPrompt);
        const textResponse = result.response.text();
        console.log('[getSmartInsights] Raw response:', textResponse.substring(0, 500));
        // 4. Robust JSON parsing — strip markdown code fences if present
        let parsedInsights;
        try {
            const cleaned = textResponse
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/\s*```\s*$/i, '')
                .trim();
            parsedInsights = JSON.parse(cleaned);
            if (!Array.isArray(parsedInsights))
                throw new Error('Response is not an array');
        }
        catch (parseError) {
            console.error('[getSmartInsights] JSON parse failed:', parseError.message, 'Raw:', textResponse.substring(0, 300));
            throw new https_1.HttpsError('internal', 'AI returned an invalid response format.');
        }
        return { insights: parsedInsights };
    }
    catch (error) {
        console.error('[getSmartInsights] Error type:', (_e = error === null || error === void 0 ? void 0 : error.constructor) === null || _e === void 0 ? void 0 : _e.name);
        console.error('[getSmartInsights] Error message:', error === null || error === void 0 ? void 0 : error.message);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('internal', `An error occurred while generating smart insights. (${(_f = error === null || error === void 0 ? void 0 : error.message) !== null && _f !== void 0 ? _f : 'unknown'})`);
    }
});
//# sourceMappingURL=copilot.js.map