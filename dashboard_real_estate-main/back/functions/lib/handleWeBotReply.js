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
 *   • Gemini Function Calling: supports schedule_meeting tool
 *   • Logs both inbound & outbound messages to leads/{leadId}/messages
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
// ─── Gemini Function Calling: create_catalog ──────────────────────────────────
const createCatalogDeclaration = {
    name: 'create_catalog',
    description: 'יוצר קטלוג נכסים וירטואלי שניתן לשתף עם הלקוח (URL) בהתאם למזהי הנכסים שבחרת מהרשימה.',
    parameters: {
        type: generative_ai_1.SchemaType.OBJECT,
        properties: {
            propertyIds: {
                type: generative_ai_1.SchemaType.ARRAY,
                items: { type: generative_ai_1.SchemaType.STRING },
                description: 'רשימת מזהי הנכסים (ID) להוספה לקטלוג'
            },
        },
        required: ['propertyIds'],
    },
};
// ─── Helper: map Firestore weBotConfig → BotConfig ────────────────────────────
function mapWeBotConfig(raw) {
    var _a;
    // Map internal keys from Firestore (saved by WeBotSettings.tsx) to BotConfig type
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
// ─── Main Handler ─────────────────────────────────────────────────────────────
async function handleWeBotReply(agencyId, leadId, customerPhone, incomingMessage, geminiApiKey, greenApiCreds, idMessage) {
    var _a, _b, _c, _d, _e, _f;
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
        // ── 6. Initialise Gemini with Function Calling ──────────────────────────
        const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            tools: [{ functionDeclarations: [scheduleMeetingDeclaration, createCatalogDeclaration] }],
            systemInstruction: systemPrompt,
        });
        const chat = model.startChat();
        const result = await chat.sendMessage(incomingMessage);
        const resp = result.response;
        let finalReply = '';
        // ── 7. Handle Function Calling (schedule_meeting) ───────────────────────
        const fnCalls = (_f = (_e = resp.functionCalls) === null || _e === void 0 ? void 0 : _e.call(resp)) !== null && _f !== void 0 ? _f : [];
        if (fnCalls.length > 0) {
            const call = fnCalls[0];
            if (call.name === 'schedule_meeting') {
                const { date, time, propertyId } = call.args;
                // Persist meeting to Firestore
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
                // Send function result back to Gemini so it can craft the confirmation message
                const confirmResult = await chat.sendMessage([{
                        functionResponse: {
                            name: 'schedule_meeting',
                            response: { success: true, message: 'הפגישה נקבעה בהצלחה.' },
                        },
                    }]);
                finalReply = confirmResult.response.text();
            }
            else if (call.name === 'create_catalog') {
                const { propertyIds } = call.args;
                const idsArray = Array.isArray(propertyIds) ? propertyIds : [];
                if (idsArray.length === 0) {
                    console.warn(`[WeBot] Gemini attempted to create catalog with 0 properties.`);
                    const failResult = await chat.sendMessage([{
                            functionResponse: {
                                name: 'create_catalog',
                                response: { success: false, message: 'לא נבחרו נכסים.' },
                            },
                        }]);
                    finalReply = failResult.response.text();
                }
                else {
                    // Create catalog
                    const catalogUrl = await (0, whatsappService_1.createSharedCatalog)(db, agencyId, agencyData, leadId, leadData.name || 'לקוח', idsArray);
                    console.log(`[WeBot] 📄 Catalog created via AI: lead=${leadId} URL=${catalogUrl} properties=${idsArray.length}`);
                    // Send function result back to Gemini so it can craft the message with the URL
                    const confirmResult = await chat.sendMessage([{
                            functionResponse: {
                                name: 'create_catalog',
                                response: { success: true, url: catalogUrl },
                            },
                        }]);
                    finalReply = confirmResult.response.text();
                }
            }
        }
        else {
            finalReply = resp.text();
        }
        if (!finalReply.trim()) {
            console.warn(`[WeBot] Empty reply from Gemini for lead ${leadId}, skipping send.`);
            return;
        }
        // ── 8. Send reply via Green API ─────────────────────────────────────────
        const integration = {
            idInstance: greenApiCreds.idInstance,
            apiTokenInstance: greenApiCreds.apiTokenInstance,
            isConnected: true,
        };
        const isSent = await (0, whatsappService_1.sendWhatsAppMessage)(integration, customerPhone, finalReply);
        console.log(`[WeBot] Reply ${isSent ? 'sent ✅' : 'FAILED ❌'} to ${customerPhone} for lead ${leadId}`);
        // ── 9. Log bot reply to CRM ─────────────────────────────────────────────
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