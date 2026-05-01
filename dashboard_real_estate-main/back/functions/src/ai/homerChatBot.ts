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
            {
                name: 'createProperty',
                description: 'Creates a new property listing in the agency. You MUST have city, propertyType, price, and transactionType. Ask the user for any missing required field before calling.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        city:            { type: SchemaType.STRING, description: 'Required. City/town.' },
                        propertyType:    { type: SchemaType.STRING, description: 'Required. e.g. דירה, בית, דופלקס, מסחרי.' },
                        price:           { type: SchemaType.NUMBER, description: 'Required. Price in ILS.' },
                        transactionType: { type: SchemaType.STRING, description: 'Required. "forsale" or "rent".' },
                        street:          { type: SchemaType.STRING, description: 'Optional. Street name.' },
                        neighborhood:    { type: SchemaType.STRING, description: 'Optional. Neighborhood.' },
                        rooms:           { type: SchemaType.NUMBER, description: 'Optional. Number of rooms.' },
                        floor:           { type: SchemaType.NUMBER, description: 'Optional. Floor number.' },
                        totalFloors:     { type: SchemaType.NUMBER, description: 'Optional. Total floors in building.' },
                        squareMeters:    { type: SchemaType.NUMBER, description: 'Optional. Size in sqm.' },
                        hasElevator:     { type: SchemaType.BOOLEAN, description: 'Optional.' },
                        hasParking:      { type: SchemaType.BOOLEAN, description: 'Optional.' },
                        hasBalcony:      { type: SchemaType.BOOLEAN, description: 'Optional.' },
                        description:     { type: SchemaType.STRING, description: 'Optional. Free-text description.' },
                    },
                    required: ['city', 'propertyType', 'price', 'transactionType'],
                },
            },
            {
                name: 'createAgent',
                description: 'Creates a new agent/user in the agency. You MUST have name and phone. Ask the user for any missing required field before calling.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name:  { type: SchemaType.STRING, description: 'Required. Full name.' },
                        phone: { type: SchemaType.STRING, description: 'Required. Phone number.' },
                        email: { type: SchemaType.STRING, description: 'Optional. Email address.' },
                        role:  { type: SchemaType.STRING, description: 'Optional. "admin" or "agent". Defaults to "agent".' },
                    },
                    required: ['name', 'phone'],
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
                    type: SchemaType.OBJECT,
                    properties: {},
                },
            },
            {
                name: 'queryAgentLeaderboard',
                description: 'Fetch a ranking of agents by their sales performance (deals closed and commission generated).',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        period: {
                            type: SchemaType.STRING,
                            description: 'Optional. "month" or "year". Defaults to month.',
                        },
                    },
                },
            },
            {
                name: 'queryExpenses',
                description: 'Fetch and summarize agency expenses for a period.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        period: {
                            type: SchemaType.STRING,
                            description: 'Optional. "month" or "year". Defaults to month.',
                        },
                    },
                },
            },
            {
                name: 'queryMeetings',
                description: 'Fetch upcoming meetings and appointments.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        period: {
                            type: SchemaType.STRING,
                            description: 'Optional. "today", "tomorrow", or "week". Defaults to today.',
                        },
                    },
                },
            },
            {
                name: 'queryLeadMatches',
                description: 'Find properties that match a specific lead\'s requirements.',
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        leadId: {
                            type: SchemaType.STRING,
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
                    type: SchemaType.OBJECT,
                    properties: {
                        query: {
                            type: SchemaType.STRING,
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
    const snap = await db.collection('agencies').doc(agencyId).collection('properties')
        .where('status', '==', 'active')
        .orderBy('financials.price', 'desc')
        .limit(5)
        .get();

    return {
        topMostExpensiveActiveProperties: snap.docs.map(doc => {
            const d = doc.data();
            return {
                address: d.address?.fullAddress || `${d.address?.street || ''}, ${d.address?.city || ''}`,
                price: d.financials?.price ?? d.price,
                transactionType: d.transactionType,
            };
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

async function execCreateProperty(db: admin.firestore.Firestore, agencyId: string, args: any) {
    if (!args.city || !args.propertyType || !args.price || !args.transactionType) {
        const missing = [
            !args.city && 'עיר',
            !args.propertyType && 'סוג נכס',
            !args.price && 'מחיר',
            !args.transactionType && 'סוג עסקה (למכירה/להשכרה)',
        ].filter(Boolean).join(', ');
        return { error: `חסרים שדות חובה: ${missing}. בקש מהמשתמש להשלים אותם.` };
    }

    const ref = db.collection('agencies').doc(agencyId).collection('properties').doc();
    const fullAddress = [args.street, args.city].filter(Boolean).join(', ');

    await ref.set({
        id: ref.id,
        agencyId,
        transactionType: args.transactionType === 'rent' ? 'rent' : 'forsale',
        propertyType: args.propertyType,
        status: 'active',
        rooms: args.rooms ?? null,
        floor: args.floor ?? null,
        totalFloors: args.totalFloors ?? null,
        squareMeters: args.squareMeters ?? null,
        address: {
            city: args.city,
            street: args.street ?? null,
            neighborhood: args.neighborhood ?? null,
            fullAddress: fullAddress || args.city,
            coords: null,
        },
        features: {
            hasElevator: args.hasElevator ?? null,
            hasParking: args.hasParking ?? null,
            hasBalcony: args.hasBalcony ?? null,
            hasMamad: null,
            hasStorage: null,
            isRenovated: null,
            isFurnished: null,
            hasAirConditioning: null,
        },
        financials: { price: Math.round(args.price), originalPrice: null },
        media: { mainImage: null, images: [], videoTourUrl: null },
        management: { assignedAgentId: null, descriptions: args.description ?? null },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, propertyId: ref.id, message: `נכס חדש נוצר: ${args.propertyType} ב${args.city}.` };
}

async function execCreateAgent(db: admin.firestore.Firestore, agencyId: string, args: any) {
    if (!args.name || !args.phone) {
        const missing = [!args.name && 'שם', !args.phone && 'טלפון'].filter(Boolean).join(', ');
        return { error: `חסרים שדות חובה: ${missing}. בקש מהמשתמש להשלים אותם.` };
    }

    const normalizedEmail = args.email?.trim() || null;
    if (normalizedEmail) {
        const exists = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
        if (!exists.empty && exists.docs[0].data().uid) {
            return { error: 'סוכן עם כתובת דוא״ל זו כבר קיים במערכת.' };
        }
    }

    const ref = db.collection('users').doc();
    await ref.set({
        uid: null,
        email: normalizedEmail,
        name: args.name.trim(),
        phone: args.phone.trim(),
        role: args.role === 'admin' ? 'admin' : 'agent',
        agencyId,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, agentId: ref.id, message: `סוכן חדש נוצר: ${args.name}.` };
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

async function execQueryGoals(db: admin.firestore.Firestore, agencyId: string, uid: string) {
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
        if (!updatedAt) return;
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
            name: agencyDoc.data()?.name,
            monthlyGoals: agencyDoc.data()?.monthlyGoals,
            yearlyGoals: agencyDoc.data()?.yearlyGoals,
            currentProgress: { monthRevenue, yearRevenue, monthDeals, yearDeals }
        } : null,
        personal: userDoc.exists ? {
            goals: userDoc.data()?.goals,
            currentProgress: { 
                monthRevenue: dealsSnap.docs.filter(d => (d.data().createdBy === uid || d.data().agentId === uid) && (d.data().updatedAt?.toDate ? d.data().updatedAt.toDate() : new Date(d.data().updatedAt)) >= startMonth).reduce((acc, d) => acc + (d.data().projectedCommission || 0), 0),
                yearRevenue: dealsSnap.docs.filter(d => (d.data().createdBy === uid || d.data().agentId === uid)).reduce((acc, d) => acc + (d.data().projectedCommission || 0), 0)
            }
        } : null
    };
}

async function execQueryAgentLeaderboard(db: admin.firestore.Firestore, agencyId: string, args: { period?: string }) {
    const now = new Date();
    const start = args.period === 'year' 
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const dealsSnap = await db.collection('deals')
        .where('agencyId', '==', agencyId)
        .where('stage', '==', 'Won')
        .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(start))
        .get();

    const stats: Record<string, { deals: number, revenue: number }> = {};
    dealsSnap.forEach(doc => {
        const d = doc.data();
        const agentId = d.createdBy || d.agentId || 'unknown';
        if (!stats[agentId]) stats[agentId] = { deals: 0, revenue: 0 };
        stats[agentId].deals++;
        stats[agentId].revenue += d.projectedCommission || 0;
    });

    const agentsSnap = await db.collection('users').where('agencyId', '==', agencyId).get();
    const names: Record<string, string> = {};
    agentsSnap.forEach(doc => {
        const d = doc.data();
        names[doc.id] = d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim();
    });

    const leaderboard = Object.entries(stats).map(([id, s]) => ({
        agent: names[id] || `סוכן ${id.slice(0,4)}`,
        ...s
    })).sort((a, b) => b.revenue - a.revenue);

    return { period: args.period || 'month', leaderboard };
}

async function execQueryExpenses(db: admin.firestore.Firestore, agencyId: string, args: { period?: string }) {
    const now = new Date();
    const start = args.period === 'year' 
        ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const snap = await db.collection('expenses')
        .where('agencyId', '==', agencyId)
        .where('date', '>=', admin.firestore.Timestamp.fromDate(start))
        .get();

    let total = 0;
    const byCategory: Record<string, number> = {};
    snap.forEach(doc => {
        const d = doc.data();
        total += d.amount || 0;
        const cat = d.category || 'Other';
        byCategory[cat] = (byCategory[cat] || 0) + (d.amount || 0);
    });

    return { totalExpenses: total, breakdown: byCategory };
}

async function execQueryMeetings(db: admin.firestore.Firestore, agencyId: string, args: { period?: string }) {
    const now = new Date();
    const startDay = new Date(now.setHours(0,0,0,0));
    let endDay = new Date(startDay);
    if (args.period === 'tomorrow') {
        startDay.setDate(startDay.getDate() + 1);
        endDay.setDate(startDay.getDate() + 1);
    } else if (args.period === 'week') {
        endDay.setDate(startDay.getDate() + 7);
    } else {
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
            const d = doc.data();
            const date = d.dueDate?.toDate ? d.dueDate.toDate() : new Date(d.dueDate);
            return { 
                title: d.title, 
                time: date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }), 
                location: d.relatedTo?.name 
            };
        })
    };
}

async function execQueryLeadMatches(db: admin.firestore.Firestore, agencyId: string, args: { leadId: string }) {
    const leadDoc = await db.collection('leads').doc(args.leadId).get();
    if (!leadDoc.exists) return { error: 'Lead not found.' };
    const lead = leadDoc.data()!;
    const req = lead.requirements || {};

    let query: admin.firestore.Query = db.collection('agencies').doc(agencyId).collection('properties')
        .where('status', '==', 'active');

    const snap = await query.limit(50).get();
    let matches = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (req.maxBudget) {
        matches = matches.filter((p: any) => (p.financials?.price ?? p.price ?? 0) <= req.maxBudget);
    }
    if (req.desiredCity && req.desiredCity.length > 0) {
        matches = matches.filter((p: any) => req.desiredCity.includes(p.address?.city || p.city));
    }
    if (req.minRooms) {
        matches = matches.filter((p: any) => (p.rooms || 0) >= req.minRooms);
    }

    return {
        leadName: lead.name,
        topMatches: matches.slice(0, 5).map((p: any) => ({
            address: p.address?.fullAddress || p.address?.city || '',
            price: p.financials?.price ?? p.price,
            rooms: p.rooms,
        }))
    };
}

async function execSearchEntity(db: admin.firestore.Firestore, agencyId: string, args: { query: string }) {
    const q = args.query.toLowerCase();
    
    const leadsSnap = await db.collection('leads').where('agencyId', '==', agencyId).get();
    const propsSnap = await db.collection('agencies').doc(agencyId).collection('properties').get();

    const results: Array<{ type: string; id: string; name?: string; address?: string }> = [];

    leadsSnap.forEach(doc => {
        const d = doc.data();
        if (d.name?.toLowerCase().includes(q) || d.phone?.includes(q)) {
            results.push({ type: 'lead', name: d.name, id: doc.id });
        }
    });

    propsSnap.forEach(doc => {
        const d = doc.data();
        const addr = d.address?.fullAddress || d.address?.city || '';
        const city = d.address?.city || '';
        if (addr.toLowerCase().includes(q) || city.toLowerCase().includes(q)) {
            results.push({ type: 'property', address: addr, id: doc.id });
        }
    });

    return { results: results.slice(0, 5) };
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
                        case 'createProperty':
                            toolResult = await execCreateProperty(db, agencyId, args);
                            break;
                        case 'createAgent':
                            toolResult = await execCreateAgent(db, agencyId, args);
                            break;
                        case 'queryGoals':
                            toolResult = await execQueryGoals(db, agencyId, uid);
                            break;
                        case 'queryAgentLeaderboard':
                            toolResult = await execQueryAgentLeaderboard(db, agencyId, args as any);
                            break;
                        case 'queryExpenses':
                            toolResult = await execQueryExpenses(db, agencyId, args as any);
                            break;
                        case 'queryMeetings':
                            toolResult = await execQueryMeetings(db, agencyId, args as any);
                            break;
                        case 'queryLeadMatches':
                            toolResult = await execQueryLeadMatches(db, agencyId, args as any);
                            break;
                        case 'searchEntity':
                            toolResult = await execSearchEntity(db, agencyId, args as any);
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
