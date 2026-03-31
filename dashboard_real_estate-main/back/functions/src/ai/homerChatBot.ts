import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI, SchemaType, Tool, Part } from '@google/generative-ai';
import * as admin from 'firebase-admin';
import { validateUserAuth } from '../config/authGuard';
import { FieldValue } from 'firebase-admin/firestore';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const MAX_AUDIO_BASE64_CHARS = 10 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = new Set([
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg',
    'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/flac',
]);

// ─── 1. Gemini Tool Definitions ──────────────────────────────────────────────

const tools: Tool[] = [
    {
        functionDeclarations: [
            {
                name: 'queryTeam',
                description: 'Fetch the users/agents in the real estate agency. Useful to know who is on the team.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'queryLeads',
                description: 'Fetch leads in the pipeline. Gives a summary of total leads and counts by status.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        status: {
                            type: SchemaType.STRING,
                            description: 'Optional status filter. Common values: new, in_progress, won, lost',
                        },
                    },
                },
            },
            {
                name: 'queryProperties',
                description: 'Fetch active properties. Returns total count and details of the highest priced ones.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'queryDeals',
                description: 'Fetch deals (pipeline). You can optionally pass stage="Won" to check won deals.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        stage: {
                            type: SchemaType.STRING,
                            description: 'Optional stage filter. e.g. "Won"',
                        },
                    },
                },
            },
            {
                name: 'queryIncome',
                description: 'Calculates the total commission from Won deals in the current month. Explains agency revenue.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'queryTasks',
                description: 'Fetch open tasks in the CRM. Shows upcoming tasks for the agency.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'createLead',
                description: 'Creates a new lead in the CRM. You MUST have the full name and phone number to call this tool.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        fullName: { type: SchemaType.STRING, description: 'Required. Full name of the client.' },
                        phone: { type: SchemaType.STRING, description: 'Required. Phone number.' },
                        propertyType: { type: SchemaType.STRING, description: 'Optional. e.g. apartment, house, plot, commercial.' },
                        rooms: { type: SchemaType.NUMBER, description: 'Optional. Number of rooms desired.' },
                        budgetMax: { type: SchemaType.NUMBER, description: 'Optional. Maximum budget in ILS (numbers only).' },
                        location: { type: SchemaType.STRING, description: 'Optional. Preferred street or city.' },
                        notes: { type: SchemaType.STRING, description: 'Optional. Extra requirements or context.' },
                    },
                    required: ['fullName', 'phone'],
                },
            },
        ],
    },
];

// ─── 2. Tool Resolvers (All strictly scoped by agencyId) ──────────────────────

async function execQueryTeam(db: admin.firestore.Firestore, agencyId: string) {
    const snap = await db.collection('users').where('agencyId', '==', agencyId).get();
    return {
        totalAgents: snap.size,
        agents: snap.docs.map(doc => {
            const d = doc.data();
            return { name: `${d.firstName} ${d.lastName ?? ''}`.trim(), role: d.role };
        }),
    };
}

async function execQueryLeads(db: admin.firestore.Firestore, agencyId: string, args: { status?: string }) {
    let query: admin.firestore.Query<admin.firestore.DocumentData> = db.collection('leads').where('agencyId', '==', agencyId);
    if (args.status) {
        query = query.where('status', '==', args.status);
    }
    const snap = await query.get();

    const byStatus: Record<string, number> = {};
    snap.forEach(doc => {
        const s = doc.data().status ?? 'unknown';
        byStatus[s] = (byStatus[s] || 0) + 1;
    });

    return {
        totalMatches: snap.size,
        statusBreakdown: byStatus,
    };
}

async function execQueryProperties(db: admin.firestore.Firestore, agencyId: string) {
    const snap = await db.collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .orderBy('price', 'desc')
        .limit(5)
        .get();

    return {
        topMostExpensiveActiveProperties: snap.docs.map(doc => {
            const d = doc.data();
            return { address: `${d.street}, ${d.city}`, price: d.price, type: d.type };
        }),
    };
}

async function execQueryDeals(db: admin.firestore.Firestore, agencyId: string, args: { stage?: string }) {
    let query: admin.firestore.Query<admin.firestore.DocumentData> = db.collection('deals').where('agencyId', '==', agencyId);
    if (args.stage) {
        query = query.where('stage', '==', args.stage);
    }
    const snap = await query.get();

    let totalAmount = 0;
    const byStage: Record<string, number> = {};
    snap.forEach(doc => {
        const d = doc.data();
        const s = d.stage ?? 'unknown';
        byStage[s] = (byStage[s] || 0) + 1;
        totalAmount += typeof d.amount === 'number' ? d.amount : 0;
    });

    return {
        totalDeals: snap.size,
        totalAmountValuation: totalAmount,
        stageBreakdown: byStage,
    };
}

async function execQueryIncome(db: admin.firestore.Firestore, agencyId: string) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const snap = await db.collection('deals')
        .where('agencyId', '==', agencyId)
        .where('stage', '==', 'Won')
        .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(start))
        .where('updatedAt', '<', admin.firestore.Timestamp.fromDate(end))
        .get();

    let totalCommission = 0;
    snap.forEach(doc => {
        const d = doc.data();
        totalCommission += typeof d.projectedCommission === 'number' ? d.projectedCommission : 0;
    });

    return {
        wonDealsThisMonth: snap.size,
        totalCommissionThisMonthILS: totalCommission,
    };
}

async function execQueryTasks(db: admin.firestore.Firestore, agencyId: string) {
    const snap = await db.collection('tasks')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'pending')
        .get();

    return {
        totalPendingTasks: snap.size,
        firstFewTasks: snap.docs.slice(0, 5).map(doc => doc.data().title),
    };
}

async function execCreateLead(db: admin.firestore.Firestore, agencyId: string, uid: string, args: any) {
    if (!args.fullName || !args.phone) {
        return { error: 'Missing required fields. Please ask the user to provide both full name and phone number.' };
    }

    const leadRef = db.collection('leads').doc();
    await leadRef.set({
        agencyId,
        name: args.fullName,
        phone: args.phone,
        email: null,
        source: 'hOMER Chat Bot',
        requirements: {
            desiredCity: args.location ? [args.location] : [],
            maxBudget: args.budgetMax ?? null,
            minRooms: args.rooms ?? null,
            propertyType: args.propertyType ? [args.propertyType] : [],
        },
        assignedAgentId: uid,
        notes: args.notes ?? null,
        status: 'new',
        createdAt: FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        message: 'Lead created successfully.',
        leadId: leadRef.id,
    };
}

// ─── 3. Main Cloud Function ──────────────────────────────────────────────────

export interface HomerChatBotResult {
    response: string;
    transcribedText?: string;
    error?: string;
}

export const homerChatBot = onCall(
    {
        secrets: [geminiApiKey],
        region: 'europe-west1',
        timeoutSeconds: 120,
        memory: '512MiB',
        cors: true,
    },
    async (request): Promise<HomerChatBotResult> => {
        // 1. Auth Guard
        const authData = await validateUserAuth(request);
        const { agencyId, uid } = authData;

        const { text, audio, mimeType } = request.data as {
            text?: string;
            audio?: string;
            mimeType?: string;
        };

        const hasText = typeof text === 'string' && text.trim().length > 0;
        const hasAudio = typeof audio === 'string' && audio.trim().length > 0;

        if (!hasText && !hasAudio) {
            throw new HttpsError('invalid-argument', 'יש לספק text או audio.');
        }

        if (hasAudio && audio!.length > MAX_AUDIO_BASE64_CHARS) {
            throw new HttpsError('invalid-argument', 'הקלטה ארוכה מדי. הגבל עד 60 שניות.');
        }

        const resolvedMimeType = (mimeType || 'audio/webm').toLowerCase();
        if (hasAudio && !ALLOWED_AUDIO_MIME_TYPES.has(resolvedMimeType)) {
            throw new HttpsError('invalid-argument', 'סוג קובץ שמע אינו נתמך.');
        }

        const apiKey = geminiApiKey.value();
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', tools });
        const db = admin.firestore();

        // 2. Setup System Instruction
        const systemInstruction = {
            role: 'user' as const,
            parts: [
                {
                    text:
                        'אתה hOMER, עוזר AI חכם ורב-עוצמה למנהל/סוכן סוכנות הנדל"ן. ' +
                        'עליך להבין את כוונת המשתמש: האם הוא שואל שאלה (אז השתמש בכלים לשליפת נתונים) ' +
                        'או שהוא מבקש לבצע פעולה כגון יצירת ליד (למשל, "צור ליד חדש בשם..."). ' +
                        'אם חסרים פרטים הכרחיים לפעולה (למשל שם או טלפון ליצירת ליד), פנה למשתמש ובקש אותם מפורשות. ' +
                        'תמיד תענה בטבעיות בעברית בלבד (אלא אם נשאלת בשפה אחרת). ' +
                        'היה תמציתי לעניין, מקצועי וברור.',
                },
            ],
        };

        try {
            const chat = model.startChat({
                systemInstruction,
                history: [],
            });

            // If audio is provided, we send it natively inline + prompt telling the bot to transcribe it and act.
            let inputParts: Part[] = [];
            let transcribedTextHook = '';

            if (hasAudio) {
                inputParts.push({ text: 'המשתמש שלח הודעה קולית. האזן, ושמע מה הוא מבקש. ענה לו כאילו זו הודעת טקסט רגילה.' });
                inputParts.push({
                    inlineData: {
                        data: audio!,
                        mimeType: resolvedMimeType,
                    },
                });
                // If there's text as well (fallback or context), include it
                if (hasText) inputParts.push({ text: `טקסט נלווה: ${text}` });
            } else {
                inputParts.push({ text: text! });
            }

            console.log(`[homerChatBot] Started. mode=${hasAudio ? 'audio' : 'text'} agencyId=${agencyId}`);

            let response = await chat.sendMessage(inputParts);
            let candidate = response.response;

            // 3. Keep iterating over function calls (up to 5 limits to prevent infinite loops)
            let maxIterations = 5;
            while (candidate.functionCalls() && candidate.functionCalls()!.length > 0 && maxIterations-- > 0) {
                const functionCall = candidate.functionCalls()![0];
                const { name, args } = functionCall;

                console.log(`[homerChatBot] Tool requested: ${name}`);

                let toolResult: any;
                try {
                    switch (name) {
                        case 'queryTeam':
                            toolResult = await execQueryTeam(db, agencyId);
                            break;
                        case 'queryLeads':
                            toolResult = await execQueryLeads(db, agencyId, args as any);
                            break;
                        case 'queryProperties':
                            toolResult = await execQueryProperties(db, agencyId);
                            break;
                        case 'queryDeals':
                            toolResult = await execQueryDeals(db, agencyId, args as any);
                            break;
                        case 'queryIncome':
                            toolResult = await execQueryIncome(db, agencyId);
                            break;
                        case 'queryTasks':
                            toolResult = await execQueryTasks(db, agencyId);
                            break;
                        case 'createLead':
                            toolResult = await execCreateLead(db, agencyId, uid, args);
                            break;
                        default:
                            console.warn(`[homerChatBot] Unknown tool requested: ${name}`);
                            toolResult = { error: `Tool ${name} is not available.` };
                    }
                } catch (toolError: any) {
                    console.error(`[homerChatBot] Error in tool ${name}:`, toolError.message);
                    toolResult = { error: 'Internal execution error within the CRM.' };
                }

                // Return result back to Chat
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

            const finalText = candidate.text();
            if (!finalText) {
                throw new HttpsError('internal', 'ה-AI לא החזיר טקסט בסיום העיבוד.');
            }

            return {
                response: finalText,
                // We could instruct the model to return the transcription text explicitly, but 
                // Gemini audio transcription works best if it's just conversed with. 
                // We don't guarantee strict transcription reflection here, skipping to simplify flow and rely on LLM.
            };

        } catch (error: any) {
            console.error('[homerChatBot] Error:', error);
            throw new HttpsError('internal', `שגיאה בתקשורת מול ה-AI: ${error.message ?? 'Unknown'}`);
        }
    }
);
