import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
    GoogleGenerativeAI,
    SchemaType,
    Tool,
} from '@google/generative-ai';
import * as admin from 'firebase-admin';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

// ── Helper: current month boundaries (UTC) ────────────────────────────────────
function currentMonthBounds() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
}

// ── Tool definitions for the Gemini model ─────────────────────────────────────
const tools: Tool[] = [
    {
        functionDeclarations: [
            {
                name: 'getTopAgent',
                description:
                    'Returns the agent with the highest total commission from Won deals in the current month. ' +
                    'Use this to answer questions like "who is the best agent?" or "מי הסוכן הכי טוב?".',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'getHighestCommissionProperty',
                description:
                    'Returns the property with the highest price from the active listings. ' +
                    'Use this to answer questions like "what is the most expensive property?" or "מה הנכס הכי יקר?".',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'getLeadStats',
                description:
                    'Returns a summary of leads including total count, count per status, and count per source. ' +
                    'Use this to answer questions about leads, conversion, or pipeline.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'getSummaryStats',
                description:
                    'Returns a high-level dashboard summary: total active properties, total leads, total deals won this month, ' +
                    'and total commission earned this month. Use for general "how are we doing?" questions.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                    required: [],
                },
            },
        ],
    },
];

// ── Local tool executors (all filtered by agencyId) ───────────────────────────
async function getTopAgent(db: admin.firestore.Firestore, agencyId: string) {
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

    const agentTotals: Record<string, { name: string; commission: number }> = {};
    snapshot.forEach(doc => {
        const d = doc.data();
        const id = d.agentId ?? d.assignedAgentId ?? 'unknown';
        const name = d.agentName ?? d.assignedAgentName ?? id;
        const commission = typeof d.projectedCommission === 'number' ? d.projectedCommission : 0;
        if (!agentTotals[id]) agentTotals[id] = { name, commission: 0 };
        agentTotals[id].commission += commission;
    });

    const top = Object.values(agentTotals).sort((a, b) => b.commission - a.commission)[0];
    return { topAgent: top, totalAgentsWithWonDeals: Object.keys(agentTotals).length };
}

async function getHighestCommissionProperty(db: admin.firestore.Firestore, agencyId: string) {
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

async function getLeadStats(db: admin.firestore.Firestore, agencyId: string) {
    const snapshot = await db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .get();

    const statusCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};

    snapshot.forEach(doc => {
        const d = doc.data();
        const status = d.status ?? 'unknown';
        const source = d.source ?? 'unknown';
        statusCounts[status] = (statusCounts[status] ?? 0) + 1;
        sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    });

    return {
        totalLeads: snapshot.size,
        byStatus: statusCounts,
        bySource: sourceCounts,
    };
}

async function getSummaryStats(db: admin.firestore.Firestore, agencyId: string) {
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
        if (typeof d.projectedCommission === 'number') totalCommission += d.projectedCommission;
    });

    return {
        activeProperties: propertiesSnap.size,
        totalLeads: leadsSnap.size,
        wonDealsThisMonth: dealsSnap.size,
        totalCommissionThisMonth: totalCommission,
    };
}

// ── Main Cloud Function ────────────────────────────────────────────────────────
export const askCopilot = onCall(
    { secrets: [geminiApiKey], region: 'europe-west1', cors: true },
    async (request) => {
        // 1. Auth guard
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'You must be logged in to use the AI Copilot.');
        }

        const { prompt } = request.data;
        if (!prompt || typeof prompt !== 'string') {
            throw new HttpsError('invalid-argument', 'A valid prompt string must be provided.');
        }

        // 2. Tenant isolation: get agencyId from custom claim
        const agencyId = request.auth.token.agencyId as string | undefined;
        if (!agencyId) {
            throw new HttpsError('failed-precondition', 'User is not associated with any agency.');
        }

        const db = admin.firestore();
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', tools });

        const systemInstruction = {
            role: 'user' as const,
            parts: [
                {
                    text:
                        'You are the hOMER AI Copilot for a real estate agency. ' +
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
            while (candidate.functionCalls() && candidate.functionCalls()!.length > 0 && maxIterations-- > 0) {
                const functionCall = candidate.functionCalls()![0];
                const { name } = functionCall;

                console.log(`[askCopilot] Model requested tool: ${name}`);

                let toolResult: object;
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
                } catch (toolError: any) {
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
                throw new HttpsError('internal', 'The AI model did not generate a text response.');
            }

            return { response: finalText };

        } catch (error: any) {
            console.error('[askCopilot] Fatal error:', error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', 'An error occurred while communicating with the AI Copilot.');
        }
    }
);

// ── Smart Insights Endpoint ──────────────────────────────────────────────────
export const getSmartInsights = onCall(
    { secrets: [geminiApiKey], region: 'europe-west1', cors: true },
    async (request) => {
        // Enforce explicit CORS headers for local dev and production
        if (request.rawRequest) {
            const origin = request.rawRequest.headers.origin;
            if (origin === 'http://localhost:5173' || origin?.includes('homer')) {
                request.rawRequest.res?.set('Access-Control-Allow-Origin', origin);
                request.rawRequest.res?.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                request.rawRequest.res?.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                request.rawRequest.res?.set('Access-Control-Allow-Credentials', 'true');
            }
        }

        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'You must be logged in.');
        }

        const agencyId = request.auth.token.agencyId as string | undefined;
        if (!agencyId) {
            throw new HttpsError('failed-precondition', 'User is not associated with any agency.');
        }

        const db = admin.firestore();
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: SchemaType.ARRAY,
                    description: 'List of 3 to 5 actionable insights for the agency manager.',
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            badge: { type: SchemaType.STRING, description: 'Short badge text in Hebrew (e.g. מחיר, יעד, קמפיין, לידים, עסקאות).' },
                            category: { type: SchemaType.STRING, description: 'Enum: price, goal, campaign, lead, deal', format: 'enum', enum: ['price', 'goal', 'campaign', 'lead', 'deal'] },
                            title: { type: SchemaType.STRING, description: 'The main insight title in Hebrew.' },
                            text: { type: SchemaType.STRING, description: 'Detailed explanation and recommendation in Hebrew.' },
                        },
                        required: ['badge', 'category', 'title', 'text'],
                    },
                },
            },
        });

        try {
            // 1. Fetch data snapshots
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

            const [propertiesSnap, leadsSnap, dealsSnap, agentsSnap] = await Promise.all([
                db.collection('properties').where('agencyId', '==', agencyId).where('status', '==', 'active').get(),
                db.collection('leads').where('agencyId', '==', agencyId).get(),
                db.collection('deals').where('agencyId', '==', agencyId).where('stage', '==', 'Won').get(),
                db.collection('agencies').doc(agencyId).collection('agents').get()
            ]);

            // Transform into compact representation
            const properties = propertiesSnap.docs.map(d => {
                const data = d.data();
                return { id: d.id, address: `${data.street}, ${data.city}`, price: data.price, createdAt: data.createdAt?.toDate() };
            });

            const leadsStatusCount: Record<string, number> = {};
            const leadsSourceCount: Record<string, number> = {};
            leadsSnap.docs.forEach(d => {
                const st = d.data().status || 'new';
                const src = d.data().source || 'unknown';
                leadsStatusCount[st] = (leadsStatusCount[st] || 0) + 1;
                leadsSourceCount[src] = (leadsSourceCount[src] || 0) + 1;
            });

            const currentMonthDeals = dealsSnap.docs.map(d => d.data()).filter(d => {
                const date = d.updatedAt?.toDate() || new Date(0);
                return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            });

            const agents = agentsSnap.docs.map(d => ({ name: d.data().firstName + ' ' + (d.data().lastName || ''), role: d.data().role }));

            // 2. Build the context prompt
            const contextPrompt = `
You are the hOMER Smart Insights Engine. Analyze the following real estate agency data and generate 3 highly actionable, specific insights for the manager.
Write the insights in Hebrew.

DATA SNAPSHOT:
- Active Properties: ${properties.length} (Oldest ones: ${properties.filter(p => p.createdAt && p.createdAt < thirtyDaysAgo).length} older than 30 days)
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
6. The output must perfectly match the JSON schema.
            `;

            // 3. Call Gemini
            const response = await model.generateContent(contextPrompt);
            const textResponse = response.response.text();

            return { insights: JSON.parse(textResponse) };

        } catch (error: any) {
            console.error('[getSmartInsights] Error:', error);
            throw new HttpsError('internal', 'An error occurred while generating smart insights.');
        }
    }
);
