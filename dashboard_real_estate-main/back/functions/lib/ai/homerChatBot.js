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
exports.homerChatBot = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const admin = __importStar(require("firebase-admin"));
const authGuard_1 = require("../config/authGuard");
const firestore_1 = require("firebase-admin/firestore");
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
const MAX_AUDIO_BASE64_CHARS = 10 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = new Set([
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg',
    'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/flac',
]);
// ─── 1. Gemini Tool Definitions ──────────────────────────────────────────────
const tools = [
    {
        functionDeclarations: [
            {
                name: 'queryTeam',
                description: 'Fetch the users/agents in the real estate agency. Useful to know who is on the team.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'queryLeads',
                description: 'Fetch leads in the pipeline. Gives a summary of total leads and counts by status.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {
                        status: {
                            type: generative_ai_1.SchemaType.STRING,
                            description: 'Optional status filter. Common values: new, in_progress, won, lost',
                        },
                    },
                },
            },
            {
                name: 'queryProperties',
                description: 'Fetch active properties. Returns total count and details of the highest priced ones.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'queryDeals',
                description: 'Fetch deals (pipeline). You can optionally pass stage="Won" to check won deals.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {
                        stage: {
                            type: generative_ai_1.SchemaType.STRING,
                            description: 'Optional stage filter. e.g. "Won"',
                        },
                    },
                },
            },
            {
                name: 'queryIncome',
                description: 'Calculates the total commission from Won deals in the current month. Explains agency revenue.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'queryTasks',
                description: 'Fetch open tasks in the CRM. Shows upcoming tasks for the agency.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'createLead',
                description: 'Creates a new lead in the CRM. You MUST have the full name and phone number to call this tool.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {
                        fullName: { type: generative_ai_1.SchemaType.STRING, description: 'Required. Full name of the client.' },
                        phone: { type: generative_ai_1.SchemaType.STRING, description: 'Required. Phone number.' },
                        propertyType: { type: generative_ai_1.SchemaType.STRING, description: 'Optional. e.g. apartment, house, plot, commercial.' },
                        rooms: { type: generative_ai_1.SchemaType.NUMBER, description: 'Optional. Number of rooms desired.' },
                        budgetMax: { type: generative_ai_1.SchemaType.NUMBER, description: 'Optional. Maximum budget in ILS (numbers only).' },
                        location: { type: generative_ai_1.SchemaType.STRING, description: 'Optional. Preferred street or city.' },
                        notes: { type: generative_ai_1.SchemaType.STRING, description: 'Optional. Extra requirements or context.' },
                    },
                    required: ['fullName', 'phone'],
                },
            },
        ],
    },
    {
        functionDeclarations: [
            {
                name: 'queryGoals',
                description: 'Fetch agency and personal goals (monthly/yearly) and current progress towards them.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'queryAgentLeaderboard',
                description: 'Fetch a ranking of agents by their sales performance (deals closed and commission generated).',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {
                        period: {
                            type: generative_ai_1.SchemaType.STRING,
                            description: 'Optional. "month" or "year". Defaults to month.',
                        },
                    },
                },
            },
            {
                name: 'queryExpenses',
                description: 'Fetch and summarize agency expenses for a period.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {
                        period: {
                            type: generative_ai_1.SchemaType.STRING,
                            description: 'Optional. "month" or "year". Defaults to month.',
                        },
                    },
                },
            },
            {
                name: 'queryMeetings',
                description: 'Fetch upcoming meetings and appointments.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {
                        period: {
                            type: generative_ai_1.SchemaType.STRING,
                            description: 'Optional. "today", "tomorrow", or "week". Defaults to today.',
                        },
                    },
                },
            },
            {
                name: 'queryLeadMatches',
                description: 'Find properties that match a specific lead\'s requirements.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {
                        leadId: {
                            type: generative_ai_1.SchemaType.STRING,
                            description: 'Required. The lead ID.',
                        },
                    },
                    required: ['leadId'],
                },
            },
            {
                name: 'searchEntity',
                description: 'Search for a lead or property by name, phone, or address.',
                parameters: {
                    type: generative_ai_1.SchemaType.OBJECT,
                    properties: {
                        query: {
                            type: generative_ai_1.SchemaType.STRING,
                            description: 'Search term (name, phone, address).',
                        },
                    },
                    required: ['query'],
                },
            },
        ],
    },
];
// ─── 2. Tool Resolvers (All strictly scoped by agencyId) ──────────────────────
async function execQueryTeam(db, agencyId) {
    const snap = await db.collection('users').where('agencyId', '==', agencyId).get();
    return {
        totalAgents: snap.size,
        agents: snap.docs.map(doc => {
            var _a;
            const d = doc.data();
            return { name: `${d.firstName} ${(_a = d.lastName) !== null && _a !== void 0 ? _a : ''}`.trim(), role: d.role };
        }),
    };
}
async function execQueryLeads(db, agencyId, args) {
    let query = db.collection('leads').where('agencyId', '==', agencyId);
    if (args.status) {
        query = query.where('status', '==', args.status);
    }
    const snap = await query.get();
    const byStatus = {};
    snap.forEach(doc => {
        var _a;
        const s = (_a = doc.data().status) !== null && _a !== void 0 ? _a : 'unknown';
        byStatus[s] = (byStatus[s] || 0) + 1;
    });
    return {
        totalMatches: snap.size,
        statusBreakdown: byStatus,
    };
}
async function execQueryProperties(db, agencyId) {
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
async function execQueryDeals(db, agencyId, args) {
    let query = db.collection('deals').where('agencyId', '==', agencyId);
    if (args.stage) {
        query = query.where('stage', '==', args.stage);
    }
    const snap = await query.get();
    let totalAmount = 0;
    const byStage = {};
    snap.forEach(doc => {
        var _a;
        const d = doc.data();
        const s = (_a = d.stage) !== null && _a !== void 0 ? _a : 'unknown';
        byStage[s] = (byStage[s] || 0) + 1;
        totalAmount += typeof d.amount === 'number' ? d.amount : 0;
    });
    return {
        totalDeals: snap.size,
        totalAmountValuation: totalAmount,
        stageBreakdown: byStage,
    };
}
async function execQueryIncome(db, agencyId) {
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
async function execQueryTasks(db, agencyId) {
    const snap = await db.collection('tasks')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'pending')
        .get();
    return {
        totalPendingTasks: snap.size,
        firstFewTasks: snap.docs.slice(0, 5).map(doc => doc.data().title),
    };
}
async function execCreateLead(db, agencyId, uid, args) {
    var _a, _b, _c;
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
            maxBudget: (_a = args.budgetMax) !== null && _a !== void 0 ? _a : null,
            minRooms: (_b = args.rooms) !== null && _b !== void 0 ? _b : null,
            propertyType: args.propertyType ? [args.propertyType] : [],
        },
        assignedAgentId: uid,
        notes: (_c = args.notes) !== null && _c !== void 0 ? _c : null,
        status: 'new',
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return {
        success: true,
        message: 'Lead created successfully.',
        leadId: leadRef.id,
    };
}
async function execQueryGoals(db, agencyId, uid) {
    var _a, _b, _c, _d;
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    const userDoc = await db.collection('users').doc(uid).get();
    const now = new Date();
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    // Get current progress: total Won commissions
    const dealsSnap = await db.collection('deals')
        .where('agencyId', '==', agencyId)
        .where('stage', '==', 'Won')
        .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(startYear))
        .get();
    let monthRevenue = 0;
    let yearRevenue = 0;
    let monthDeals = 0;
    let yearDeals = 0;
    dealsSnap.forEach(doc => {
        const d = doc.data();
        const updatedAt = d.updatedAt;
        if (!updatedAt)
            return;
        const date = updatedAt.toDate ? updatedAt.toDate() : new Date(updatedAt);
        const comm = d.projectedCommission || 0;
        if (date >= startMonth) {
            monthRevenue += comm;
            monthDeals++;
        }
        yearRevenue += comm;
        yearDeals++;
    });
    return {
        agency: agencyDoc.exists ? {
            name: (_a = agencyDoc.data()) === null || _a === void 0 ? void 0 : _a.name,
            monthlyGoals: (_b = agencyDoc.data()) === null || _b === void 0 ? void 0 : _b.monthlyGoals,
            yearlyGoals: (_c = agencyDoc.data()) === null || _c === void 0 ? void 0 : _c.yearlyGoals,
            currentProgress: { monthRevenue, yearRevenue, monthDeals, yearDeals }
        } : null,
        personal: userDoc.exists ? {
            goals: (_d = userDoc.data()) === null || _d === void 0 ? void 0 : _d.goals,
            currentProgress: {
                monthRevenue: dealsSnap.docs.filter(d => { var _a; return (d.data().createdBy === uid || d.data().agentId === uid) && (((_a = d.data().updatedAt) === null || _a === void 0 ? void 0 : _a.toDate) ? d.data().updatedAt.toDate() : new Date(d.data().updatedAt)) >= startMonth; }).reduce((acc, d) => acc + (d.data().projectedCommission || 0), 0),
                yearRevenue: dealsSnap.docs.filter(d => (d.data().createdBy === uid || d.data().agentId === uid)).reduce((acc, d) => acc + (d.data().projectedCommission || 0), 0)
            }
        } : null
    };
}
async function execQueryAgentLeaderboard(db, agencyId, args) {
    const now = new Date();
    const start = args.period === 'year'
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const dealsSnap = await db.collection('deals')
        .where('agencyId', '==', agencyId)
        .where('stage', '==', 'Won')
        .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(start))
        .get();
    const stats = {};
    dealsSnap.forEach(doc => {
        const d = doc.data();
        const agentId = d.createdBy || d.agentId || 'unknown';
        if (!stats[agentId])
            stats[agentId] = { deals: 0, revenue: 0 };
        stats[agentId].deals++;
        stats[agentId].revenue += d.projectedCommission || 0;
    });
    const agentsSnap = await db.collection('users').where('agencyId', '==', agencyId).get();
    const names = {};
    agentsSnap.forEach(doc => {
        const d = doc.data();
        names[doc.id] = d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim();
    });
    const leaderboard = Object.entries(stats).map(([id, s]) => (Object.assign({ agent: names[id] || `סוכן ${id.slice(0, 4)}` }, s))).sort((a, b) => b.revenue - a.revenue);
    return { period: args.period || 'month', leaderboard };
}
async function execQueryExpenses(db, agencyId, args) {
    const now = new Date();
    const start = args.period === 'year'
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const snap = await db.collection('expenses')
        .where('agencyId', '==', agencyId)
        .where('date', '>=', admin.firestore.Timestamp.fromDate(start))
        .get();
    let total = 0;
    const byCategory = {};
    snap.forEach(doc => {
        const d = doc.data();
        total += d.amount || 0;
        const cat = d.category || 'Other';
        byCategory[cat] = (byCategory[cat] || 0) + (d.amount || 0);
    });
    return { totalExpenses: total, breakdown: byCategory };
}
async function execQueryMeetings(db, agencyId, args) {
    const now = new Date();
    const startDay = new Date(now.setHours(0, 0, 0, 0));
    let endDay = new Date(startDay);
    if (args.period === 'tomorrow') {
        startDay.setDate(startDay.getDate() + 1);
        endDay.setDate(startDay.getDate() + 1);
    }
    else if (args.period === 'week') {
        endDay.setDate(startDay.getDate() + 7);
    }
    else {
        endDay.setDate(startDay.getDate() + 1);
    }
    const snap = await db.collection('tasks')
        .where('agencyId', '==', agencyId)
        .where('category', '==', 'meeting')
        .where('dueDate', '>=', admin.firestore.Timestamp.fromDate(startDay))
        .where('dueDate', '<', admin.firestore.Timestamp.fromDate(endDay))
        .get();
    return {
        count: snap.size,
        meetings: snap.docs.map(doc => {
            var _a, _b;
            const d = doc.data();
            const date = ((_a = d.dueDate) === null || _a === void 0 ? void 0 : _a.toDate) ? d.dueDate.toDate() : new Date(d.dueDate);
            return {
                title: d.title,
                time: date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
                location: (_b = d.relatedTo) === null || _b === void 0 ? void 0 : _b.name
            };
        })
    };
}
async function execQueryLeadMatches(db, agencyId, args) {
    const leadDoc = await db.collection('leads').doc(args.leadId).get();
    if (!leadDoc.exists)
        return { error: 'Lead not found.' };
    const lead = leadDoc.data();
    const req = lead.requirements || {};
    let query = db.collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active');
    if (req.maxBudget)
        query = query.where('price', '<=', req.maxBudget);
    const snap = await query.limit(10).get();
    let matches = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
    if (req.desiredCity && req.desiredCity.length > 0) {
        matches = matches.filter((p) => req.desiredCity.includes(p.city));
    }
    if (req.minRooms) {
        matches = matches.filter((p) => (p.rooms || 0) >= req.minRooms);
    }
    return {
        leadName: lead.name,
        topMatches: matches.slice(0, 5).map((p) => ({ address: p.address, price: p.price, rooms: p.rooms }))
    };
}
async function execSearchEntity(db, agencyId, args) {
    const q = args.query.toLowerCase();
    const leadsSnap = await db.collection('leads').where('agencyId', '==', agencyId).get();
    const propsSnap = await db.collection('properties').where('agencyId', '==', agencyId).get();
    const results = [];
    leadsSnap.forEach(doc => {
        var _a, _b;
        const d = doc.data();
        if (((_a = d.name) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)) || ((_b = d.phone) === null || _b === void 0 ? void 0 : _b.includes(q))) {
            results.push({ type: 'lead', name: d.name, id: doc.id });
        }
    });
    propsSnap.forEach(doc => {
        var _a, _b;
        const d = doc.data();
        if (((_a = d.address) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)) || ((_b = d.city) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(q))) {
            results.push({ type: 'property', address: d.address, id: doc.id });
        }
    });
    return { results: results.slice(0, 5) };
}
exports.homerChatBot = (0, https_1.onCall)({
    secrets: [geminiApiKey],
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
}, async (request) => {
    var _a;
    // 1. Auth Guard
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { agencyId, uid } = authData;
    const { text, audio, mimeType } = request.data;
    const hasText = typeof text === 'string' && text.trim().length > 0;
    const hasAudio = typeof audio === 'string' && audio.trim().length > 0;
    if (!hasText && !hasAudio) {
        throw new https_1.HttpsError('invalid-argument', 'יש לספק text או audio.');
    }
    if (hasAudio && audio.length > MAX_AUDIO_BASE64_CHARS) {
        throw new https_1.HttpsError('invalid-argument', 'הקלטה ארוכה מדי. הגבל עד 60 שניות.');
    }
    const resolvedMimeType = (mimeType || 'audio/webm').toLowerCase();
    if (hasAudio && !ALLOWED_AUDIO_MIME_TYPES.has(resolvedMimeType)) {
        throw new https_1.HttpsError('invalid-argument', 'סוג קובץ שמע אינו נתמך.');
    }
    const apiKey = geminiApiKey.value();
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', tools });
    const db = admin.firestore();
    // 2. Setup System Instruction
    const systemInstruction = {
        role: 'user',
        parts: [
            {
                text: 'אתה hOMER, עוזר AI חכם ורב-עוצמה למנהל/סוכן סוכנות הנדל"ן. ' +
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
        let inputParts = [];
        let transcribedTextHook = '';
        if (hasAudio) {
            inputParts.push({ text: 'המשתמש שלח הודעה קולית. האזן, ושמע מה הוא מבקש. ענה לו כאילו זו הודעת טקסט רגילה.' });
            inputParts.push({
                inlineData: {
                    data: audio,
                    mimeType: resolvedMimeType,
                },
            });
            // If there's text as well (fallback or context), include it
            if (hasText)
                inputParts.push({ text: `טקסט נלווה: ${text}` });
        }
        else {
            inputParts.push({ text: text });
        }
        console.log(`[homerChatBot] Started. mode=${hasAudio ? 'audio' : 'text'} agencyId=${agencyId}`);
        let response = await chat.sendMessage(inputParts);
        let candidate = response.response;
        // 3. Keep iterating over function calls (up to 5 limits to prevent infinite loops)
        let maxIterations = 5;
        while (candidate.functionCalls() && candidate.functionCalls().length > 0 && maxIterations-- > 0) {
            const functionCall = candidate.functionCalls()[0];
            const { name, args } = functionCall;
            console.log(`[homerChatBot] Tool requested: ${name}`);
            let toolResult;
            try {
                switch (name) {
                    case 'queryTeam':
                        toolResult = await execQueryTeam(db, agencyId);
                        break;
                    case 'queryLeads':
                        toolResult = await execQueryLeads(db, agencyId, args);
                        break;
                    case 'queryProperties':
                        toolResult = await execQueryProperties(db, agencyId);
                        break;
                    case 'queryDeals':
                        toolResult = await execQueryDeals(db, agencyId, args);
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
                    case 'queryGoals':
                        toolResult = await execQueryGoals(db, agencyId, uid);
                        break;
                    case 'queryAgentLeaderboard':
                        toolResult = await execQueryAgentLeaderboard(db, agencyId, args);
                        break;
                    case 'queryExpenses':
                        toolResult = await execQueryExpenses(db, agencyId, args);
                        break;
                    case 'queryMeetings':
                        toolResult = await execQueryMeetings(db, agencyId, args);
                        break;
                    case 'queryLeadMatches':
                        toolResult = await execQueryLeadMatches(db, agencyId, args);
                        break;
                    case 'searchEntity':
                        toolResult = await execSearchEntity(db, agencyId, args);
                        break;
                    default:
                        console.warn(`[homerChatBot] Unknown tool requested: ${name}`);
                        toolResult = { error: `Tool ${name} is not available.` };
                }
            }
            catch (toolError) {
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
            throw new https_1.HttpsError('internal', 'ה-AI לא החזיר טקסט בסיום העיבוד.');
        }
        return {
            response: finalText,
            // We could instruct the model to return the transcription text explicitly, but 
            // Gemini audio transcription works best if it's just conversed with. 
            // We don't guarantee strict transcription reflection here, skipping to simplify flow and rely on LLM.
        };
    }
    catch (error) {
        console.error('[homerChatBot] Error:', error);
        throw new https_1.HttpsError('internal', `שגיאה בתקשורת מול ה-AI: ${(_a = error.message) !== null && _a !== void 0 ? _a : 'Unknown'}`);
    }
});
//# sourceMappingURL=homerChatBot.js.map