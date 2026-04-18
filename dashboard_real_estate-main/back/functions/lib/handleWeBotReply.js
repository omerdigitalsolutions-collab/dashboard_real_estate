"use strict";
/**
 * ─── handleWeBotReply ─────────────────────────────────────────────────────────
 *
 * State-machine WeBot pipeline persisted in leads/{leadId}.chatState
 *
 * Buyer states:  IDLE → COLLECTING_REQS → SCHEDULING_CALL → IDLE
 * Seller states: IDLE → COLLECTING_SELLER_INFO → SCHEDULING_SELLER_CALL → IDLE
 *
 * State resets after 24 h inactivity or a "התחל מחדש" keyword.
 */
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
exports.handleWeBotReply = handleWeBotReply;
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const whatsappService_1 = require("./whatsappService");
const matchingEngine_1 = require("./leads/matchingEngine");
const eventManager_1 = require("./calendar/eventManager");
const db = admin.firestore();
// ─── Constants ────────────────────────────────────────────────────────────────
const STATE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const RESET_KEYWORDS = ['התחל מחדש', 'תחל מחדש', 'reset', 'start over', 'מחדש'];
// ─── Gemini Function Declarations ─────────────────────────────────────────────
const scheduleMeetingDeclaration = {
    name: 'schedule_meeting',
    description: 'קובע פגישה, סיור בנכס, או שיחת טלפון ביומן המתווך, בתאריך ושעה מוסכמים עם הלקוח.',
    parameters: {
        type: generative_ai_1.SchemaType.OBJECT,
        properties: {
            date: { type: generative_ai_1.SchemaType.STRING, description: 'תאריך הפגישה YYYY-MM-DD' },
            time: { type: generative_ai_1.SchemaType.STRING, description: 'שעת הפגישה HH:MM' },
            meetingType: { type: generative_ai_1.SchemaType.STRING, description: '"visit" לסיור, "call" לשיחת טלפון' },
            propertyId: { type: generative_ai_1.SchemaType.STRING, description: 'מזהה נכס (אופציונלי)' },
            duration: { type: generative_ai_1.SchemaType.NUMBER, description: 'משך בדקות (ברירת מחדל 60)' },
        },
        required: ['date', 'time', 'meetingType'],
    },
};
const updateLeadRequirementsDeclaration = {
    name: 'update_lead_requirements',
    description: 'שמור את דרישות הלקוח שאספת. קרא ברגע שיש לך לפחות עיר + תקציב או חדרים.',
    parameters: {
        type: generative_ai_1.SchemaType.OBJECT,
        properties: {
            desiredCity: { type: generative_ai_1.SchemaType.ARRAY, items: { type: generative_ai_1.SchemaType.STRING }, description: 'ערים מועדפות (עברית)' },
            maxBudget: { type: generative_ai_1.SchemaType.NUMBER, description: 'תקציב מקסימלי בשקלים' },
            minRooms: { type: generative_ai_1.SchemaType.NUMBER, description: 'מינימום חדרים' },
            maxRooms: { type: generative_ai_1.SchemaType.NUMBER, description: 'מקסימום חדרים' },
            propertyType: { type: generative_ai_1.SchemaType.ARRAY, items: { type: generative_ai_1.SchemaType.STRING }, description: '"sale" לקנייה, "rent" לשכירות' },
            mustHaveParking: { type: generative_ai_1.SchemaType.BOOLEAN },
            mustHaveElevator: { type: generative_ai_1.SchemaType.BOOLEAN },
            mustHaveBalcony: { type: generative_ai_1.SchemaType.BOOLEAN },
            mustHaveSafeRoom: { type: generative_ai_1.SchemaType.BOOLEAN },
        },
        required: ['desiredCity'],
    },
};
const createCatalogDeclaration = {
    name: 'create_catalog',
    description: 'צור קטלוג נכסים מותאם ללקוח לפי הדרישות השמורות. קרא לאחר update_lead_requirements.',
    parameters: { type: generative_ai_1.SchemaType.OBJECT, properties: {} },
};
// ─── mapWeBotConfig ───────────────────────────────────────────────────────────
function mapWeBotConfig(raw) {
    var _a;
    const toneMap = {
        professional: 'professional',
        friendly_emoji: 'friendly_emoji',
        direct_sales: 'direct_sales',
    };
    return {
        isActive: raw.isActive !== false,
        tone: (_a = toneMap[raw.tone]) !== null && _a !== void 0 ? _a : 'professional',
        customTone: raw.customTone,
        fallbackAction: raw.fallbackAction === 'collect_details' ? 'collect_details' : 'human_handoff',
        customFallbackAction: raw.customFallbackAction,
        firewallMuteHours: typeof raw.firewallMuteHours === 'number' ? raw.firewallMuteHours : 12,
        generalNotes: raw.generalNotes || '',
    };
}
// ─── loadChatHistory ──────────────────────────────────────────────────────────
async function loadChatHistory(leadId, limit = 20, excludeDocId) {
    try {
        const snap = await db
            .collection(`leads/${leadId}/messages`)
            .orderBy('timestamp', 'asc')
            .limitToLast(limit)
            .get();
        const history = [];
        for (const doc of snap.docs) {
            if (excludeDocId && doc.id === excludeDocId)
                continue;
            const d = doc.data();
            if (d.source === 'system_error' || d.source === 'whatsapp_history_sync')
                continue;
            if (d.direction !== 'inbound' && d.direction !== 'outbound')
                continue;
            if (d.direction === 'outbound' && d.source !== 'whatsapp_ai_bot')
                continue;
            const text = d.text || '';
            if (!text.trim())
                continue;
            history.push({ role: d.direction === 'inbound' ? 'user' : 'model', parts: [{ text }] });
        }
        return history;
    }
    catch (err) {
        console.warn(`[WeBot] Could not load chat history for lead ${leadId}:`, err);
        return [];
    }
}
// ─── findMatchingPropertiesForBot ─────────────────────────────────────────────
async function findMatchingPropertiesForBot(agencyId, requirements, topN = 10) {
    var _a;
    const agencySnap = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .get();
    const agencyProps = agencySnap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
    let globalProps = [];
    const cities = (_a = requirements.desiredCity) !== null && _a !== void 0 ? _a : [];
    if (cities.length > 0) {
        const cityResults = await Promise.all(cities.slice(0, 10).map(async (city) => {
            try {
                const snap = await db
                    .collection('cities').doc(city).collection('properties')
                    .limit(200).get();
                return snap.docs.map(doc => (Object.assign({ id: doc.id, isExclusivity: false }, doc.data())));
            }
            catch (_a) {
                return [];
            }
        }));
        globalProps = cityResults.flat();
    }
    const all = [...agencyProps, ...globalProps];
    const matches = [];
    for (const prop of all) {
        const mp = {
            id: prop.id, city: prop.city, neighborhood: prop.neighborhood,
            price: prop.price, rooms: prop.rooms, type: prop.type,
            hasElevator: prop.hasElevator, hasParking: prop.hasParking,
            hasBalcony: prop.hasBalcony, hasSafeRoom: prop.hasSafeRoom,
        };
        const result = (0, matchingEngine_1.evaluateMatch)(mp, requirements);
        if (result)
            matches.push(Object.assign(Object.assign({}, prop), { matchScore: result.matchScore, category: result.category }));
    }
    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches.slice(0, topN);
}
// ─── updateChatState ──────────────────────────────────────────────────────────
async function updateChatState(leadId, state, extra = {}) {
    await db.collection('leads').doc(leadId).update({
        chatState: Object.assign({ state, lastStateAt: Date.now() }, extra),
        lastInteraction: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[WeBot] 🔄 State → ${state} for lead ${leadId}`);
}
// ─── sendBotMessage ───────────────────────────────────────────────────────────
async function sendBotMessage(integration, customerPhone, leadId, text) {
    const isSent = await (0, whatsappService_1.sendWhatsAppMessage)(integration, customerPhone, text);
    console.log(`[WeBot] Reply ${isSent ? '✅' : '❌'} to ${customerPhone}`);
    if (isSent) {
        await db.collection(`leads/${leadId}/messages`).add({
            text,
            direction: 'outbound',
            senderPhone: 'bot',
            source: 'whatsapp_ai_bot',
            botSentAt: Date.now(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isRead: true,
        });
    }
}
// ─── classifyIntent ───────────────────────────────────────────────────────────
async function classifyIntent(message, leadType, geminiApiKey) {
    // Fast keyword check for sellers (high confidence)
    const sellerKeywords = ['למכור', 'מכירה', 'לפרסם', 'פרסום נכס', 'נכס שלי', 'דירה שלי', 'להשכיר את'];
    if (sellerKeywords.some(kw => message.includes(kw)))
        return 'seller';
    // If existing seller lead writing again — stay in seller flow
    if (leadType === 'seller')
        return 'seller';
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(`סווג את ההודעה הבאה לאחת מ-3 קטגוריות. החזר JSON בלבד.\n\nהודעה: "${message}"\n\n` +
            `קטגוריות:\n- buyer: מחפש לקנות/לשכור נכס\n- seller: רוצה למכור/להשכיר/לפרסם נכס\n` +
            `- irrelevant: ברכות בלבד, ספאם, תגובה לא ברורה\n\n{"intent":"buyer"|"seller"|"irrelevant"}`);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        return (['buyer', 'seller', 'irrelevant'].includes(parsed.intent) ? parsed.intent : 'buyer');
    }
    catch (err) {
        console.warn('[WeBot] Intent classification failed, fallback to keyword check:', err);
        const buyerKeywords = ['מחפש', 'קנות', 'שכירות', 'דירה', 'נכס', 'חדרים', 'תקציב', 'רוצה לקנות'];
        if (buyerKeywords.some(kw => message.includes(kw)))
            return 'buyer';
        return 'irrelevant';
    }
}
// ─── notifyAgentOrAdmin ───────────────────────────────────────────────────────
async function notifyAgentOrAdmin(targetPhone, message, creds) {
    try {
        await (0, whatsappService_1.sendWhatsAppMessage)({ idInstance: creds.idInstance, apiTokenInstance: creds.apiTokenInstance, isConnected: true }, targetPhone, message);
    }
    catch (err) {
        console.warn('[WeBot] Failed to notify agent/admin:', err);
    }
}
// ─── createCRMNotification ────────────────────────────────────────────────────
async function createCRMNotification(agencyId, leadId, leadName, type, actionType, details) {
    await db.collection('notifications').add({
        agencyId, leadId, leadName, type, actionType, details,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
// ─── findAgentPhone / findAdminPhone ─────────────────────────────────────────
async function findAgentPhone(agencyId, assignedAgentId) {
    var _a, _b, _c, _d;
    if (assignedAgentId) {
        const doc = await db.collection('users').doc(assignedAgentId).get();
        const phone = ((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.phone) || ((_b = doc.data()) === null || _b === void 0 ? void 0 : _b.phoneNumber);
        if (phone)
            return phone;
    }
    const snap = await db.collection('users')
        .where('agencyId', '==', agencyId)
        .where('role', 'in', ['agent', 'admin'])
        .limit(1)
        .get();
    return snap.empty ? null : ((_c = snap.docs[0].data()) === null || _c === void 0 ? void 0 : _c.phone) || ((_d = snap.docs[0].data()) === null || _d === void 0 ? void 0 : _d.phoneNumber) || null;
}
async function findAdminPhone(agencyId) {
    var _a, _b;
    const snap = await db.collection('users')
        .where('agencyId', '==', agencyId)
        .where('role', '==', 'admin')
        .limit(1)
        .get();
    return snap.empty ? null : ((_a = snap.docs[0].data()) === null || _a === void 0 ? void 0 : _a.phone) || ((_b = snap.docs[0].data()) === null || _b === void 0 ? void 0 : _b.phoneNumber) || null;
}
// ─── extractSellerInfo ────────────────────────────────────────────────────────
async function extractSellerInfo(message, geminiApiKey) {
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(`חלץ פרטי נכס מהמסר הבא. החזר JSON בלבד.\n\nמסר: "${message}"\n\n` +
            `{"address":"כתובת מלאה או null","propertyType":"דירה/בית/דופלקס/פנטהאוס/מסחרי או null"}`);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        return {
            address: parsed.address || undefined,
            propertyType: parsed.propertyType || undefined,
        };
    }
    catch (_a) {
        return {};
    }
}
// ─── extractTimePreference ────────────────────────────────────────────────────
async function extractTimePreference(message, geminiApiKey) {
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const today = new Date().toLocaleDateString('he-IL');
        const result = await model.generateContent(`חלץ העדפת זמן מהמסר. תאריך היום: ${today}.\nמסר: "${message}"\n` +
            `{"timeText":"תיאור הזמן הקריא בעברית, או null"}`);
        const parsed = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
        return parsed.timeText || message.trim();
    }
    catch (_a) {
        return message.trim();
    }
}
// ─── Buyer Flow (Gemini function-calling pipeline) ────────────────────────────
async function runBuyerFlow(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, agencyData, leadData, integration, currentMsgDocId, greenApiCreds, currentState = 'IDLE') {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    // RAG: active properties for this agency
    const propSnap = await db.collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(15)
        .get();
    const ragProperties = propSnap.docs.map(doc => {
        var _a, _b;
        const d = doc.data();
        return {
            id: doc.id,
            title: d.title || d.propertyType || 'נכס',
            address: d.street || d.address || d.neighborhood || '',
            city: d.city || '',
            rooms: (_a = d.rooms) !== null && _a !== void 0 ? _a : 0,
            price: (_b = d.price) !== null && _b !== void 0 ? _b : 0,
            description: d.description || '',
        };
    });
    const agencyName = agencyData.agencyName || agencyData.name || 'הסוכנות שלנו';
    const botConfig = mapWeBotConfig(agencyData.weBotConfig || {});
    const systemPrompt = (0, whatsappService_1.buildWeBotPrompt)(botConfig, ragProperties, agencyName);
    const chatHistory = await loadChatHistory(leadId, 20, currentMsgDocId);
    const schedulingPrefix = currentState === 'SCHEDULING_CALL'
        ? '⚠️ מצב נוכחי: קטלוג הנכסים כבר נשלח ללקוח. אם הלקוח רוצה לקבוע שיחה/פגישה — שאל תאריך ושעה מועדפים ואז קרא ל-schedule_meeting בלבד. אל תקרא שוב ל-update_lead_requirements או ל-create_catalog.\n\n'
        : '';
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        tools: [{ functionDeclarations: [scheduleMeetingDeclaration, updateLeadRequirementsDeclaration, createCatalogDeclaration] }],
        toolConfig: { functionCallingConfig: { mode: generative_ai_1.FunctionCallingMode.AUTO } },
        systemInstruction: schedulingPrefix + systemPrompt,
    });
    const chat = model.startChat({ history: chatHistory });
    let chatResponse = await chat.sendMessage(incomingMessage);
    let finalReply = '';
    let catalogCreated = false;
    let sentCatalogUrl = null;
    let iterCount = 0;
    while (iterCount < 5) {
        iterCount++;
        const fnCalls = (_c = (_b = (_a = chatResponse.response).functionCalls) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : [];
        if (fnCalls.length === 0) {
            finalReply = chatResponse.response.text();
            break;
        }
        const call = fnCalls[0];
        let functionResult;
        // ── schedule_meeting ──────────────────────────────────────────────────────
        if (call.name === 'schedule_meeting') {
            const args = call.args;
            const { date, time } = args;
            const meetingType = args.meetingType || 'call';
            const propertyId = args.propertyId;
            const durationMins = typeof args.duration === 'number' ? args.duration : 60;
            const typeLabel = meetingType === 'call' ? 'שיחת טלפון' : 'סיור בנכס';
            const startDateTime = `${date}T${time}:00`;
            const endDate = new Date(`${date}T${time}:00`);
            endDate.setMinutes(endDate.getMinutes() + durationMins);
            const endDateTime = endDate.toISOString().slice(0, 16) + ':00';
            await db.collection('meetings').add({
                agencyId, leadId, date, time, meetingType,
                propertyId: propertyId || null,
                status: 'scheduled',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            const taskRef = db.collection('tasks').doc();
            const leadName = leadData.name || 'לקוח';
            await taskRef.set({
                id: taskRef.id, agencyId, createdBy: 'bot',
                title: `${typeLabel} — ${leadName}`,
                description: `נקבע על ידי הבוט. ליד: ${leadId}${propertyId ? ` | נכס: ${propertyId}` : ''}`,
                dueDate: admin.firestore.Timestamp.fromDate(new Date(startDateTime)),
                priority: 'Medium', isCompleted: false, type: 'meeting',
                relatedTo: { type: 'lead', id: leadId },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Google Calendar (best-effort)
            let calendarLink = null;
            try {
                let calendarUserId = null;
                if (leadData.assignedAgentId) {
                    const agentDoc = await db.collection('users').doc(leadData.assignedAgentId).get();
                    if ((_e = (_d = agentDoc.data()) === null || _d === void 0 ? void 0 : _d.googleCalendar) === null || _e === void 0 ? void 0 : _e.enabled)
                        calendarUserId = leadData.assignedAgentId;
                }
                if (!calendarUserId) {
                    const adminSnap = await db.collection('users')
                        .where('agencyId', '==', agencyId).where('role', '==', 'admin').limit(1).get();
                    if (!adminSnap.empty && ((_f = adminSnap.docs[0].data().googleCalendar) === null || _f === void 0 ? void 0 : _f.enabled))
                        calendarUserId = adminSnap.docs[0].id;
                }
                if (calendarUserId) {
                    const calResult = await (0, eventManager_1.createCalendarEvent)(calendarUserId, {
                        summary: `${typeLabel} — ${leadName}`,
                        description: `ליד: ${leadName} | טלפון: ${customerPhone}${propertyId ? ` | נכס: ${propertyId}` : ''}`,
                        start: { dateTime: startDateTime, timeZone: 'Asia/Jerusalem' },
                        end: { dateTime: endDateTime, timeZone: 'Asia/Jerusalem' },
                        relatedTo: { type: 'lead', id: leadId, name: leadData.name || 'לקוח' },
                    });
                    calendarLink = calResult.htmlLink;
                    await taskRef.update({ googleEventId: calResult.eventId });
                    console.log(`[WeBot] 📅 Calendar event: ${calResult.htmlLink}`);
                }
            }
            catch (calErr) {
                console.warn('[WeBot] Calendar create failed (non-fatal):', calErr);
            }
            // Notify agent
            const agentPhone = await findAgentPhone(agencyId, leadData.assignedAgentId);
            if (agentPhone) {
                await notifyAgentOrAdmin(agentPhone, `🏠 *עדכון מהבוט*\nהלקוח ${leadName} קבע ${typeLabel} לתאריך ${date} בשעה ${time}.\nטלפון: ${customerPhone}`, greenApiCreds);
            }
            await updateChatState(leadId, 'IDLE');
            functionResult = {
                success: true,
                message: calendarLink
                    ? `הפגישה נקבעה ביומן ל-${date} בשעה ${time}.`
                    : `הפגישה נשמרה במערכת ל-${date} בשעה ${time}.`,
            };
            // ── update_lead_requirements ──────────────────────────────────────────────
        }
        else if (call.name === 'update_lead_requirements') {
            const args = call.args;
            const requirements = {};
            if (Array.isArray(args.desiredCity) && args.desiredCity.length)
                requirements.desiredCity = args.desiredCity;
            if (typeof args.maxBudget === 'number')
                requirements.maxBudget = args.maxBudget;
            if (typeof args.minRooms === 'number')
                requirements.minRooms = args.minRooms;
            if (typeof args.maxRooms === 'number')
                requirements.maxRooms = args.maxRooms;
            if (Array.isArray(args.propertyType) && args.propertyType.length)
                requirements.propertyType = args.propertyType;
            if (typeof args.mustHaveParking === 'boolean')
                requirements.mustHaveParking = args.mustHaveParking;
            if (typeof args.mustHaveElevator === 'boolean')
                requirements.mustHaveElevator = args.mustHaveElevator;
            if (typeof args.mustHaveBalcony === 'boolean')
                requirements.mustHaveBalcony = args.mustHaveBalcony;
            if (typeof args.mustHaveSafeRoom === 'boolean')
                requirements.mustHaveSafeRoom = args.mustHaveSafeRoom;
            await db.collection('leads').doc(leadId).update({
                requirements: Object.assign(Object.assign({}, (leadData.requirements || {})), requirements),
                type: 'buyer',
                status: 'searching',
            });
            await updateChatState(leadId, 'COLLECTING_REQS');
            console.log(`[WeBot] 📋 Requirements saved: lead=${leadId}`, requirements);
            functionResult = { success: true };
            // ── create_catalog ────────────────────────────────────────────────────────
        }
        else if (call.name === 'create_catalog') {
            const freshLead = await db.collection('leads').doc(leadId).get();
            const reqs = ((_g = freshLead.data()) === null || _g === void 0 ? void 0 : _g.requirements) || {};
            if (!((_h = reqs.desiredCity) === null || _h === void 0 ? void 0 : _h.length) && !reqs.maxBudget && !reqs.minRooms) {
                functionResult = {
                    success: false, reason: 'missing_requirements',
                    message: 'לא נמצאו דרישות שמורות. יש לאסוף מהלקוח לפחות עיר + תקציב או חדרים.',
                };
            }
            else {
                const matchedProperties = await findMatchingPropertiesForBot(agencyId, reqs, 10);
                if (matchedProperties.length === 0) {
                    functionResult = { success: false, reason: 'no_matches', message: 'לא נמצאו נכסים מתאימים לפי הדרישות.' };
                }
                else {
                    const propertyIds = matchedProperties.map(p => p.id);
                    const catalogUrl = await (0, whatsappService_1.createSharedCatalog)(db, agencyId, agencyData, leadId, ((_j = freshLead.data()) === null || _j === void 0 ? void 0 : _j.name) || 'לקוח', propertyIds);
                    catalogCreated = true;
                    sentCatalogUrl = catalogUrl;
                    console.log(`[WeBot] 📄 Catalog created: lead=${leadId} URL=${catalogUrl} count=${propertyIds.length}`);
                    functionResult = { success: true, url: catalogUrl, count: matchedProperties.length };
                }
            }
        }
        else {
            console.warn(`[WeBot] Unknown function call: ${call.name}`);
            functionResult = { success: false, reason: 'unknown_function' };
        }
        chatResponse = await chat.sendMessage([{
                functionResponse: { name: call.name, response: functionResult },
            }]);
    }
    // Guarantee the catalog URL appears in the reply even if Gemini forgot to include it
    if (sentCatalogUrl && !finalReply.includes(sentCatalogUrl)) {
        finalReply = finalReply.trimEnd()
            ? `${finalReply.trimEnd()}\n\n${sentCatalogUrl}`
            : `הנה קטלוג הנכסים המותאם לך 🏠:\n${sentCatalogUrl}`;
    }
    if (!finalReply.trim()) {
        console.warn(`[WeBot] Empty reply from Gemini for lead ${leadId}, using fallback.`);
        finalReply = 'תודה על פנייתך! אחזור אליך בהקדם. 😊';
    }
    await sendBotMessage(integration, customerPhone, leadId, finalReply);
    // After catalog is sent → move to SCHEDULING_CALL + notify agent
    if (catalogCreated) {
        await updateChatState(leadId, 'SCHEDULING_CALL');
        const freshLead = await db.collection('leads').doc(leadId).get();
        const reqs = ((_k = freshLead.data()) === null || _k === void 0 ? void 0 : _k.requirements) || {};
        const leadName = leadData.name || customerPhone;
        const reqSummary = [
            Array.isArray(reqs.desiredCity) ? reqs.desiredCity.join(', ') : null,
            reqs.minRooms ? `${reqs.minRooms} חדרים` : null,
            reqs.maxBudget ? `תקציב עד ₪${Number(reqs.maxBudget).toLocaleString('he-IL')}` : null,
        ].filter(Boolean).join(' | ');
        const agentPhone = await findAgentPhone(agencyId, leadData.assignedAgentId);
        if (agentPhone) {
            await notifyAgentOrAdmin(agentPhone, `🏠 *פנייה חדשה מהבוט*\nשם: ${leadName}\nטלפון: ${customerPhone}\nדרישות: ${reqSummary || 'לא צוין'}\nהלקוח קיבל קטלוג ומחכה לשיחת ייעוץ.`, greenApiCreds);
        }
        await createCRMNotification(agencyId, leadId, leadName, 'new_buyer_inquiry', 'assign_agent', { phone: customerPhone, requirements: reqs, catalogSent: true });
    }
}
// ─── Seller Flow (deterministic) ─────────────────────────────────────────────
async function runSellerFlow(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, leadData, integration, currentState, chatStateData, greenApiCreds) {
    var _a, _b;
    const leadName = leadData.name || customerPhone;
    // ── First contact: start seller flow ─────────────────────────────────────
    if (currentState === 'IDLE') {
        await db.collection('leads').doc(leadId).update({ type: 'seller', status: 'potential_seller' });
        await updateChatState(leadId, 'COLLECTING_SELLER_INFO');
        await sendBotMessage(integration, customerPhone, leadId, `תודה שפנית! 🏠\nכדי שנוכל לשווק את הנכס שלך בצורה הטובה ביותר, אנא ספר לנו:\n\n1️⃣ מה *כתובת הנכס*?\n2️⃣ מה *סוג הנכס*? (דירה, בית פרטי, דופלקס, פנטהאוס וכו׳)`);
        return;
    }
    // ── Collecting address + property type ───────────────────────────────────
    if (currentState === 'COLLECTING_SELLER_INFO') {
        const extracted = await extractSellerInfo(incomingMessage, geminiApiKey);
        const address = extracted.address || chatStateData.pendingSellerAddress;
        const propertyType = extracted.propertyType || chatStateData.pendingSellerType;
        if (!address && !propertyType) {
            await sendBotMessage(integration, customerPhone, leadId, `לא הצלחתי לזהות את הפרטים. 😊\nאנא ציין את *כתובת הנכס* וה*סוג* שלו — לדוגמה: "דירה ברחוב הרצל 5, תל אביב"`);
            return;
        }
        if (!address || !propertyType) {
            await updateChatState(leadId, 'COLLECTING_SELLER_INFO', {
                pendingSellerAddress: address,
                pendingSellerType: propertyType,
            });
            const missing = !address ? 'כתובת הנכס' : 'סוג הנכס (דירה, בית, פנטהאוס וכו׳)';
            await sendBotMessage(integration, customerPhone, leadId, `תודה! חסר לנו רק ${missing}. 🙏`);
            return;
        }
        // All info collected → move to scheduling
        await db.collection('leads').doc(leadId).update({
            sellerInfo: { address, propertyType },
            type: 'seller',
        });
        await updateChatState(leadId, 'SCHEDULING_SELLER_CALL', {
            pendingSellerAddress: address,
            pendingSellerType: propertyType,
        });
        await sendBotMessage(integration, customerPhone, leadId, `מצוין! קיבלנו את הפרטים:\n📍 *כתובת:* ${address}\n🏠 *סוג:* ${propertyType}\n\nמתי נוח לך לדבר עם מנהל המשרד? (ציין יום ושעה מועדפים)`);
        return;
    }
    // ── Scheduling the seller call ────────────────────────────────────────────
    if (currentState === 'SCHEDULING_SELLER_CALL') {
        const timePreference = await extractTimePreference(incomingMessage, geminiApiKey);
        const address = chatStateData.pendingSellerAddress || ((_a = leadData.sellerInfo) === null || _a === void 0 ? void 0 : _a.address) || 'לא צוין';
        const propertyType = chatStateData.pendingSellerType || ((_b = leadData.sellerInfo) === null || _b === void 0 ? void 0 : _b.propertyType) || 'לא צוין';
        await db.collection('tasks').add({
            agencyId, leadId,
            createdBy: 'bot',
            title: `שיחת ייעוץ מוכר — ${leadName}`,
            description: `נכס: ${propertyType} ב${address}\nזמן מועדף: ${timePreference}\nטלפון: ${customerPhone}`,
            priority: 'High',
            isCompleted: false,
            type: 'seller_call',
            relatedTo: { type: 'lead', id: leadId },
            scheduledTime: timePreference,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await sendBotMessage(integration, customerPhone, leadId, 'תודה, מנהל המשרד יחזור אליך בשעה שציינת');
        await updateChatState(leadId, 'IDLE');
        // Notify admin (not agent — seller goes straight to admin)
        const adminPhone = await findAdminPhone(agencyId);
        if (adminPhone) {
            await notifyAgentOrAdmin(adminPhone, `🏠 *מוכר חדש — מהבוט*\nשם: ${leadName}\nטלפון: ${customerPhone}\nנכס: ${propertyType} ב${address}\nזמן מועדף לשיחה: *${timePreference}*`, greenApiCreds);
        }
        await createCRMNotification(agencyId, leadId, leadName, 'new_seller_inquiry', 'contact_seller', { phone: customerPhone, address, propertyType, scheduledTime: timePreference, canAssignToAgent: true });
    }
}
// ─── Main Export ──────────────────────────────────────────────────────────────
async function handleWeBotReply(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, greenApiCreds, _idMessage, currentMsgDocId) {
    var _a, _b, _c, _d;
    try {
        // 1. Fetch agency + lead
        const [agencySnap, leadSnap] = await Promise.all([
            db.collection('agencies').doc(agencyId).get(),
            db.collection('leads').doc(leadId).get(),
        ]);
        if (!agencySnap.exists || !leadSnap.exists) {
            console.warn(`[WeBot] Agency or lead not found: agency=${agencyId} lead=${leadId}`);
            return;
        }
        const agencyData = agencySnap.data();
        const leadData = leadSnap.data();
        const botConfig = mapWeBotConfig(agencyData.weBotConfig || {});
        // 2. Bot active check (agency-level)
        if (!botConfig.isActive) {
            console.log(`[WeBot] Bot disabled by agency ${agencyId}.`);
            return;
        }
        // 3. AI Firewall: honour human-reply mute window
        const muteMs = ((_a = botConfig.firewallMuteHours) !== null && _a !== void 0 ? _a : 12) * 60 * 60 * 1000;
        if (Date.now() - ((_d = (_c = (_b = leadData.lastHumanReplyAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : 0) < muteMs) {
            console.log(`[WeBot] 🔇 Firewall mute active for lead ${leadId}`);
            return;
        }
        const integration = {
            idInstance: greenApiCreds.idInstance,
            apiTokenInstance: greenApiCreds.apiTokenInstance,
            isConnected: true,
        };
        // 4. Resolve current state + handle resets
        const storedChatState = leadData.chatState
            ? Object.assign({ state: leadData.chatState.state || 'IDLE', lastStateAt: leadData.chatState.lastStateAt || 0 }, leadData.chatState) : { state: 'IDLE', lastStateAt: 0 };
        const isResetKeyword = RESET_KEYWORDS.some(kw => incomingMessage.includes(kw));
        const isStale = storedChatState.lastStateAt > 0 && (Date.now() - storedChatState.lastStateAt > STATE_TIMEOUT_MS);
        let currentState = storedChatState.state;
        if (isResetKeyword) {
            await updateChatState(leadId, 'IDLE');
            await sendBotMessage(integration, customerPhone, leadId, 'בסדר! מתחילים מחדש. 😊\nאיך אוכל לעזור לך היום?\n• מחפש דירה לקנות/לשכור?\n• רוצה לפרסם ולמכור נכס?');
            return;
        }
        if (isStale && currentState !== 'IDLE') {
            console.log(`[WeBot] State stale (>24h) for lead ${leadId} — resetting to IDLE`);
            currentState = 'IDLE';
            await updateChatState(leadId, 'IDLE');
        }
        // 5. Route by state
        if (currentState === 'IDLE') {
            const intent = await classifyIntent(incomingMessage, leadData.type || 'buyer', geminiApiKey);
            console.log(`[WeBot] Intent=${intent} for lead ${leadId}`);
            if (intent === 'irrelevant') {
                // Known leads: log silent CRM note. New contacts: discard.
                if (leadData.source) {
                    await createCRMNotification(agencyId, leadId, leadData.name || customerPhone, 'new_buyer_inquiry', 'assign_agent', { phone: customerPhone, note: 'הודעה לא רלוונטית מליד קיים', message: incomingMessage });
                }
                return; // No WhatsApp reply
            }
            if (intent === 'seller') {
                await runSellerFlow(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, leadData, integration, 'IDLE', storedChatState, greenApiCreds);
                return;
            }
            // buyer (default)
            await runBuyerFlow(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, agencyData, leadData, integration, currentMsgDocId, greenApiCreds, currentState);
            return;
        }
        if (currentState === 'COLLECTING_REQS' || currentState === 'SCHEDULING_CALL') {
            await runBuyerFlow(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, agencyData, leadData, integration, currentMsgDocId, greenApiCreds, currentState);
            return;
        }
        if (currentState === 'COLLECTING_SELLER_INFO' || currentState === 'SCHEDULING_SELLER_CALL') {
            await runSellerFlow(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, leadData, integration, currentState, storedChatState, greenApiCreds);
        }
    }
    catch (err) {
        console.error('[WeBot] handleWeBotReply error:', err);
    }
}
//# sourceMappingURL=handleWeBotReply.js.map