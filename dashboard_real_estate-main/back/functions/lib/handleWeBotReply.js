"use strict";
/**
 * ─── handleWeBotReply ─────────────────────────────────────────────────────────
 *
 * Central WeBot pipeline handler.
 * Called from webhookWhatsAppAI after a lead has been upserted and basic
 * guards (isBotActive, idempotency) have passed.
 *
 * Features:
 *   • Reads agency's weBotConfig from Firestore for personalised prompt
 *   • AI Firewall: respects lastHumanReplyAt + firewallMuteHours
 *   • RAG: injects active properties into the system prompt
 *   • Chat History: loads last 20 messages so the bot remembers the conversation
 *   • Gemini Function Calling:
 *       - update_lead_requirements → saves extracted criteria to lead doc
 *       - create_catalog           → runs matching engine + sends catalog URL
 *       - schedule_meeting         → books a viewing in Firestore
 *
 * ⚠️  Data model: FLAT Firestore collections
 *     leads/{leadId}          — agencyId field
 *     properties/{id}         — agencyId field, status == 'active'
 *   NOT agencies/{id}/leads (multi-tenant sub-collections)
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
const db = admin.firestore();
// ─── Gemini Function Calling: schedule_meeting ────────────────────────────────
const scheduleMeetingDeclaration = {
    name: 'schedule_meeting',
    description: 'קובע פגישה/סיור ביומן המתווך לנכס ספציפי, בתאריך ושעה מוסכמים עם הלקוח.',
    parameters: {
        type: generative_ai_1.SchemaType.OBJECT,
        properties: {
            date: { type: generative_ai_1.SchemaType.STRING, description: 'תאריך הפגישה בפורמט YYYY-MM-DD' },
            time: { type: generative_ai_1.SchemaType.STRING, description: 'שעת הפגישה בפורמט HH:MM' },
            propertyId: { type: generative_ai_1.SchemaType.STRING, description: 'מזהה הנכס מרשימת ה-RAG' },
        },
        required: ['date', 'time', 'propertyId'],
    },
};
// ─── Gemini Function Calling: update_lead_requirements ───────────────────────
// Called by Gemini once it has gathered enough info from the conversation.
const updateLeadRequirementsDeclaration = {
    name: 'update_lead_requirements',
    description: 'שמור את דרישות הלקוח שאספת משיחה זו. קרא לפונקציה זו ברגע שיש לך לפחות עיר + תקציב או חדרים.',
    parameters: {
        type: generative_ai_1.SchemaType.OBJECT,
        properties: {
            desiredCity: { type: generative_ai_1.SchemaType.ARRAY, items: { type: generative_ai_1.SchemaType.STRING }, description: 'ערים מועדפות (עברית)' },
            maxBudget: { type: generative_ai_1.SchemaType.NUMBER, description: 'תקציב מקסימלי בשקלים' },
            minRooms: { type: generative_ai_1.SchemaType.NUMBER, description: 'מינימום חדרים' },
            maxRooms: { type: generative_ai_1.SchemaType.NUMBER, description: 'מקסימום חדרים' },
            propertyType: { type: generative_ai_1.SchemaType.ARRAY, items: { type: generative_ai_1.SchemaType.STRING }, description: '"sale" לקנייה, "rent" לשכירות' },
            mustHaveParking: { type: generative_ai_1.SchemaType.BOOLEAN, description: 'חובה חניה' },
            mustHaveElevator: { type: generative_ai_1.SchemaType.BOOLEAN, description: 'חובה מעלית' },
            mustHaveBalcony: { type: generative_ai_1.SchemaType.BOOLEAN, description: 'חובה מרפסת' },
            mustHaveSafeRoom: { type: generative_ai_1.SchemaType.BOOLEAN, description: 'חובה ממד"ק' },
        },
        required: ['desiredCity'],
    },
};
// ─── Gemini Function Calling: create_catalog ─────────────────────────────────
// No parameters — the server resolves matching properties from the saved requirements.
const createCatalogDeclaration = {
    name: 'create_catalog',
    description: 'צור קטלוג נכסים מותאם אישית ללקוח לפי הדרישות שנשמרו. קרא לפונקציה זו לאחר שעדכנת את הדרישות.',
    parameters: {
        type: generative_ai_1.SchemaType.OBJECT,
        properties: {},
    },
};
// ─── Helper: map Firestore weBotConfig → BotConfig ────────────────────────────
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
// ─── Helper: Load chat history from Firestore ─────────────────────────────────
// Returns the last N bot↔user exchanges as Gemini Content[] so the model
// has full conversation context.
async function loadChatHistory(leadId, limit = 20) {
    try {
        const snap = await db
            .collection(`leads/${leadId}/messages`)
            .orderBy('timestamp', 'asc')
            .limitToLast(limit)
            .get();
        const history = [];
        for (const doc of snap.docs) {
            const d = doc.data();
            // Skip system errors and history-sync messages — they are noise for the AI
            if (d.source === 'system_error' || d.source === 'whatsapp_history_sync')
                continue;
            // Only include user messages and bot replies
            if (d.direction !== 'inbound' && d.direction !== 'outbound')
                continue;
            // Skip outbound messages that were sent by a human agent
            if (d.direction === 'outbound' && d.source !== 'whatsapp_ai_bot')
                continue;
            const role = d.direction === 'inbound' ? 'user' : 'model';
            const text = d.text || '';
            if (!text.trim())
                continue;
            history.push({ role, parts: [{ text }] });
        }
        return history;
    }
    catch (err) {
        console.warn(`[WeBot] Could not load chat history for lead ${leadId}:`, err);
        return [];
    }
}
// ─── Helper: Find matching properties (server-side, no auth guard) ────────────
// Mirrors the logic in matchPropertiesForLead.ts but runs as a trusted
// server-side call from the bot pipeline.
async function findMatchingPropertiesForBot(agencyId, requirements, topN = 10) {
    var _a;
    // Agency-owned active listings
    const agencySnap = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .get();
    const agencyProps = agencySnap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
    // Global listings from city sub-collections
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
            id: prop.id,
            city: prop.city,
            neighborhood: prop.neighborhood,
            price: prop.price,
            rooms: prop.rooms,
            type: prop.type,
            hasElevator: prop.hasElevator,
            hasParking: prop.hasParking,
            hasBalcony: prop.hasBalcony,
            hasSafeRoom: prop.hasSafeRoom,
        };
        const result = (0, matchingEngine_1.evaluateMatch)(mp, requirements);
        if (result) {
            matches.push(Object.assign(Object.assign({}, prop), { matchScore: result.matchScore, category: result.category }));
        }
    }
    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches.slice(0, topN);
}
// ─── Main Handler ─────────────────────────────────────────────────────────────
async function handleWeBotReply(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, greenApiCreds, _idMessage) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        // ── 1. Fetch agency + lead docs ─────────────────────────────────────────
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
        const rawConfig = agencyData.weBotConfig || {};
        const botConfig = mapWeBotConfig(rawConfig);
        // ── 2. Bot active check (agency-level) ─────────────────────────────────
        if (!botConfig.isActive) {
            console.log(`[WeBot] Bot disabled by agency ${agencyId}. Skipping.`);
            return;
        }
        // ── 3. AI Firewall: honour lastHumanReplyAt mute window ────────────────
        const muteMs = ((_a = botConfig.firewallMuteHours) !== null && _a !== void 0 ? _a : 12) * 60 * 60 * 1000;
        const lastHumanReplyAt = (_d = (_c = (_b = leadData.lastHumanReplyAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : 0;
        if (Date.now() - lastHumanReplyAt < muteMs) {
            console.log(`[WeBot] 🔇 Firewall mute active for lead ${leadId} — human replied ${Math.floor((Date.now() - lastHumanReplyAt) / 60000)} min ago.`);
            return;
        }
        // ── 4. RAG: fetch active properties for this agency ────────────────────
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
        // ── 5. Build dynamic system prompt ─────────────────────────────────────
        const systemPrompt = (0, whatsappService_1.buildWeBotPrompt)(botConfig, ragProperties);
        // ── 6. Load conversation history from Firestore ─────────────────────────
        const chatHistory = await loadChatHistory(leadId);
        console.log(`[WeBot] Loaded ${chatHistory.length} history messages for lead ${leadId}`);
        // ── 7. Initialise Gemini with Function Calling + chat history ───────────
        const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            tools: [{ functionDeclarations: [scheduleMeetingDeclaration, updateLeadRequirementsDeclaration, createCatalogDeclaration] }],
            systemInstruction: systemPrompt,
        });
        const chat = model.startChat({ history: chatHistory });
        // ── 8. Agentic loop: handle chained function calls ──────────────────────
        let chatResponse = await chat.sendMessage(incomingMessage);
        let finalReply = '';
        let iterCount = 0;
        while (iterCount < 5) {
            iterCount++;
            const fnCalls = (_g = (_f = (_e = chatResponse.response).functionCalls) === null || _f === void 0 ? void 0 : _f.call(_e)) !== null && _g !== void 0 ? _g : [];
            if (fnCalls.length === 0) {
                finalReply = chatResponse.response.text();
                break;
            }
            const call = fnCalls[0];
            let functionResult;
            // ── schedule_meeting ──────────────────────────────────────────────────
            if (call.name === 'schedule_meeting') {
                const { date, time, propertyId } = call.args;
                await db.collection('meetings').add({
                    agencyId,
                    leadId,
                    date,
                    time,
                    propertyId,
                    status: 'scheduled',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                console.log(`[WeBot] 📅 Meeting scheduled: lead=${leadId} property=${propertyId} at ${date} ${time}`);
                functionResult = { success: true, message: 'הפגישה נקבעה בהצלחה.' };
                // ── update_lead_requirements ──────────────────────────────────────────
            }
            else if (call.name === 'update_lead_requirements') {
                const args = call.args;
                // Build a clean requirements object — only include defined fields
                const requirements = {};
                if (Array.isArray(args.desiredCity) && args.desiredCity.length > 0)
                    requirements.desiredCity = args.desiredCity;
                if (typeof args.maxBudget === 'number')
                    requirements.maxBudget = args.maxBudget;
                if (typeof args.minRooms === 'number')
                    requirements.minRooms = args.minRooms;
                if (typeof args.maxRooms === 'number')
                    requirements.maxRooms = args.maxRooms;
                if (Array.isArray(args.propertyType) && args.propertyType.length > 0)
                    requirements.propertyType = args.propertyType;
                if (typeof args.mustHaveParking === 'boolean')
                    requirements.mustHaveParking = args.mustHaveParking;
                if (typeof args.mustHaveElevator === 'boolean')
                    requirements.mustHaveElevator = args.mustHaveElevator;
                if (typeof args.mustHaveBalcony === 'boolean')
                    requirements.mustHaveBalcony = args.mustHaveBalcony;
                if (typeof args.mustHaveSafeRoom === 'boolean')
                    requirements.mustHaveSafeRoom = args.mustHaveSafeRoom;
                // Merge with existing requirements to avoid overwriting unrelated fields
                const existingReqs = leadData.requirements || {};
                await db.collection('leads').doc(leadId).update({
                    requirements: Object.assign(Object.assign({}, existingReqs), requirements),
                });
                console.log(`[WeBot] 📋 Lead requirements saved: lead=${leadId}`, requirements);
                functionResult = { success: true };
                // ── create_catalog ────────────────────────────────────────────────────
            }
            else if (call.name === 'create_catalog') {
                // Read the latest lead data (requirements may have just been updated)
                const freshLead = await db.collection('leads').doc(leadId).get();
                const reqs = ((_h = freshLead.data()) === null || _h === void 0 ? void 0 : _h.requirements) || {};
                if (!((_j = reqs.desiredCity) === null || _j === void 0 ? void 0 : _j.length) && !reqs.maxBudget && !reqs.minRooms) {
                    console.warn(`[WeBot] create_catalog called but no requirements saved for lead ${leadId}`);
                    functionResult = {
                        success: false,
                        reason: 'missing_requirements',
                        message: 'לא נמצאו דרישות שמורות. יש לאסוף מהלקוח לפחות עיר, תקציב או מספר חדרים לפני יצירת הקטלוג.',
                    };
                }
                else {
                    const matchedProperties = await findMatchingPropertiesForBot(agencyId, reqs, 10);
                    if (matchedProperties.length === 0) {
                        console.log(`[WeBot] No matching properties found for lead ${leadId}`);
                        functionResult = { success: false, reason: 'no_matches', message: 'לא נמצאו נכסים מתאימים לפי הדרישות.' };
                    }
                    else {
                        const propertyIds = matchedProperties.map(p => p.id);
                        const catalogUrl = await (0, whatsappService_1.createSharedCatalog)(db, agencyId, agencyData, leadId, ((_k = freshLead.data()) === null || _k === void 0 ? void 0 : _k.name) || 'לקוח', propertyIds);
                        console.log(`[WeBot] 📄 Catalog created: lead=${leadId} URL=${catalogUrl} count=${propertyIds.length}`);
                        functionResult = { success: true, url: catalogUrl, count: matchedProperties.length };
                    }
                }
            }
            else {
                console.warn(`[WeBot] Unknown function call: ${call.name}`);
                functionResult = { success: false, reason: 'unknown_function' };
            }
            // Send the function result back to Gemini so it can continue
            chatResponse = await chat.sendMessage([{
                    functionResponse: { name: call.name, response: functionResult },
                }]);
        }
        if (!finalReply.trim()) {
            console.warn(`[WeBot] Empty reply from Gemini for lead ${leadId}, skipping send.`);
            return;
        }
        // ── 9. Send reply via Green API ─────────────────────────────────────────
        const integration = {
            idInstance: greenApiCreds.idInstance,
            apiTokenInstance: greenApiCreds.apiTokenInstance,
            isConnected: true,
        };
        const isSent = await (0, whatsappService_1.sendWhatsAppMessage)(integration, customerPhone, finalReply);
        console.log(`[WeBot] Reply ${isSent ? 'sent ✅' : 'FAILED ❌'} to ${customerPhone} for lead ${leadId}`);
        // ── 10. Log bot reply to CRM ────────────────────────────────────────────
        // NOTE: The inbound message is already logged in webhookWhatsAppAI.ts
        // before calling handleWeBotReply. We only log the BOT's outbound reply here.
        if (isSent) {
            await db.collection(`leads/${leadId}/messages`).add({
                text: finalReply,
                direction: 'outbound',
                senderPhone: 'bot',
                source: 'whatsapp_ai_bot',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: true,
            });
        }
    }
    catch (err) {
        console.error('[WeBot] handleWeBotReply error:', err);
    }
}
//# sourceMappingURL=handleWeBotReply.js.map