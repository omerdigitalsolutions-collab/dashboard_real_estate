"use strict";
/**
 * ─── Homer Sales Bot ──────────────────────────────────────────────────────────
 *
 * WhatsApp bot that manages inbound leads for Homer itself — real estate agency
 * owners interested in purchasing the system.
 *
 * Flow:  NEW → INTRO → QUALIFYING → CLOSING → DONE
 *
 * Rules:
 *  - Max 4 bot replies per phone per 24 h (excess messages are silently ignored)
 *  - First inbound message in a 24 h window → push notification to Homer team
 *  - End goal: schedule a free training via https://homer.management/training
 *    (or accept a free-text preferred time and save it)
 *  - If prospect wants a human: prompt them to call 050-7706024
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
exports.handleHomerSalesBot = handleHomerSalesBot;
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
const whatsappService_1 = require("../whatsappService");
const sanitizeInput_1 = require("../whatsapp/security/sanitizeInput");
const detectInjection_1 = require("../whatsapp/security/detectInjection");
const db = admin.firestore();
const DAILY_REPLY_LIMIT_AGENTS = 4;
const DAILY_REPLY_LIMIT_DEMO = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const HOMER_TEAM_PHONE = '0507706024';
const TRAINING_URL = 'https://homer.management/training';
const AGENTS_COLLECTION = 'homer_prospects';
const DEMO_COLLECTION = 'homer_demo_prospects';
// ─── Gemini Setup ─────────────────────────────────────────────────────────────
let _genAI = null;
let _genAIKey = '';
function getGenAI(apiKey) {
    if (!_genAI || _genAIKey !== apiKey) {
        _genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        _genAIKey = apiKey;
    }
    return _genAI;
}
function withTimeout(label, ms, fn) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        fn().then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}
// B2B: targets real estate agency owners who want to purchase Homer
const AGENTS_SYSTEM_PROMPT = `אתה בוט המכירות של homer — מערכת CRM לסוכנויות נדל"ן ישראליות.

== מי אתה מדבר איתו ==
בעלי משרדי תיווך שהתעניינו במערכת homer ושלחו הודעה לוואצפ שלנו. הם עדיין לא לקוחות.

== המטרה ==
1. להבין את המשרד — שם, גודל, כלים קיימים
2. להציג את ערך homer בקצרה
3. לתאם הדרכה חינמית — שלח את הלינק: ${TRAINING_URL}
   - אם הם מעדיפים לתת מועד בטקסט — קבל וקרא ל-schedule_training
4. אם הם רוצים נציג אנושי — אמור: "ניתן להתקשר ישירות ל-050-7706024"

== homer בקצרה ==
• ניהול לידים, נכסים ועסקאות — הכל במקום אחד
• בוט וואצפ AI שמנהל שיחות עם קונים ומוכרים אוטומטית
• קטלוגים דיגיטליים שנשלחים ללקוחות תוך שניות
• מתאים למשרדים מ-1 עד 30+ סוכנים
• דמו + הדרכה ראשונה חינם

== כללים ==
1. ענה תמיד בעברית טבעית וקלילה
2. היה קצר — לא יותר מ-3 משפטים בתשובה אחת
3. אל תמציא מחירים; אם שואלים — "נדון בכך בהדרכה"
4. אל תתחייב להתאמות פיתוח ספציפיות

== function calls ==
קרא לפונקציות כשיש מידע לשמור. ניתן לקרוא בכל שלב של השיחה.`;
// Demo: simulates Homer acting as an agency's own AI WhatsApp bot (B2C experience)
const DEMO_SYSTEM_PROMPT = `אתה "הומר" — בוט הנדל"ן של משרד תיווך לדוגמה. זוהי הדגמה של המוצר homer.

== מי אתה מדבר איתו ==
אדם שמתעניין בנכסים — קונה, מוכר או שוכר. זוהי הדגמה בלבד; אין עסקאות אמיתיות.

== המטרה ==
1. לזהות האם הם מחפשים לקנות, למכור או לשכור
2. לאסוף העדפות: אזור, תקציב, גודל
3. להציג 2-3 נכסים לדוגמה (המצא נכסים סבירים — הם פיקטיביים)
4. להציע לתאם ביקור עם סוכן (סוכן פיקטיבי לדוגמה)
5. אם שואלים "מי מאחורי הבוט" — ניתן לציין: "זוהי הדגמה של מערכת homer"

== כללים ==
1. ענה תמיד בעברית טבעית וחמה
2. היה קצר — לא יותר מ-3 משפטים בתשובה אחת
3. הנכסים הם לדוגמה בלבד — אל תציג אותם כאמיתיים
4. אל תדון במחירים אמיתיים של homer; זה לא רלוונטי לשיחה זו

== function calls ==
קרא לפונקציות כשיש מידע לשמור על המתעניין. ניתן לקרוא בכל שלב.`;
const functionDeclarations = [
    {
        name: 'save_prospect_info',
        description: 'Save collected information about the prospect agency',
        parameters: {
            type: generative_ai_1.SchemaType.OBJECT,
            properties: {
                name: { type: generative_ai_1.SchemaType.STRING, description: 'Full name of the contact person' },
                agencyName: { type: generative_ai_1.SchemaType.STRING, description: 'Name of the real estate agency' },
                city: { type: generative_ai_1.SchemaType.STRING, description: 'City/region where the agency operates' },
                agentCount: { type: generative_ai_1.SchemaType.NUMBER, description: 'Number of agents in the agency' },
                currentTools: { type: generative_ai_1.SchemaType.STRING, description: 'Tools or CRM they currently use' },
            },
            required: [],
        },
    },
    {
        name: 'advance_state',
        description: 'Move the conversation to the next state in the flow',
        parameters: {
            type: generative_ai_1.SchemaType.OBJECT,
            properties: {
                nextState: {
                    type: generative_ai_1.SchemaType.STRING,
                    description: 'Target state: INTRO | QUALIFYING | CLOSING | DONE',
                },
            },
            required: ['nextState'],
        },
    },
    {
        name: 'schedule_training',
        description: 'Record the preferred training time given by the prospect in free text',
        parameters: {
            type: generative_ai_1.SchemaType.OBJECT,
            properties: {
                preferredTime: {
                    type: generative_ai_1.SchemaType.STRING,
                    description: 'The date/time the prospect mentioned, verbatim',
                },
            },
            required: ['preferredTime'],
        },
    },
    {
        name: 'request_human_rep',
        description: 'Mark that the prospect wants to speak with a human representative',
        parameters: {
            type: generative_ai_1.SchemaType.OBJECT,
            properties: {},
            required: [],
        },
    },
];
// ─── Daily-reply helpers ──────────────────────────────────────────────────────
async function getRepliesInfo(phone, collection) {
    var _a, _b, _c, _d, _e;
    const snap = await db.collection(collection).doc(phone).get();
    if (!snap.exists)
        return { dailyReplies: 0, isFirstToday: true };
    const data = snap.data();
    const lastMsg = (_b = (_a = data.lastMessageAt) === null || _a === void 0 ? void 0 : _a.toMillis()) !== null && _b !== void 0 ? _b : 0;
    const lastReply = (_d = (_c = data.lastReplyAt) === null || _c === void 0 ? void 0 : _c.toMillis()) !== null && _d !== void 0 ? _d : 0;
    const isFirstToday = Date.now() - lastMsg > WINDOW_MS;
    const replyWindowExpired = Date.now() - lastReply > WINDOW_MS;
    const dailyReplies = replyWindowExpired ? 0 : ((_e = data.dailyReplies) !== null && _e !== void 0 ? _e : 0);
    return { dailyReplies, isFirstToday };
}
async function incrementDailyReplies(phone, wasWindowExpired, collection) {
    const ref = db.collection(collection).doc(phone);
    await ref.update({
        dailyReplies: wasWindowExpired ? 1 : admin.firestore.FieldValue.increment(1),
        lastReplyAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
// ─── Chat history ─────────────────────────────────────────────────────────────
async function loadHistory(phone, collection) {
    const snap = await db
        .collection(`${collection}/${phone}/messages`)
        .orderBy('timestamp', 'asc')
        .limitToLast(16)
        .get();
    const history = [];
    for (const doc of snap.docs) {
        const d = doc.data();
        if (d.direction !== 'inbound' && d.direction !== 'outbound')
            continue;
        history.push({
            role: d.direction === 'outbound' ? 'model' : 'user',
            parts: [{ text: d.text }],
        });
    }
    return history;
}
// ─── Main export ──────────────────────────────────────────────────────────────
async function handleHomerSalesBot(params) {
    var _a;
    const { phone, text, geminiApiKey, homerIntegration, botMode } = params;
    const isDemo = botMode === 'demo';
    const collection = isDemo ? DEMO_COLLECTION : AGENTS_COLLECTION;
    const dailyLimit = isDemo ? DAILY_REPLY_LIMIT_DEMO : DAILY_REPLY_LIMIT_AGENTS;
    const systemPrompt = isDemo ? DEMO_SYSTEM_PROMPT : AGENTS_SYSTEM_PROMPT;
    // 1. Sanitize + injection check
    const sanitized = (0, sanitizeInput_1.sanitizeInput)(text);
    const { isInjection } = (0, detectInjection_1.detectInjection)(sanitized);
    if (isInjection) {
        console.warn(`[HomerSalesBot] Injection attempt from ${phone}`);
        return;
    }
    // 2. Daily reply guard — read before any writes
    const { dailyReplies, isFirstToday } = await getRepliesInfo(phone, collection);
    if (dailyReplies >= dailyLimit) {
        console.log(`[HomerSalesBot] Daily limit reached for ${phone} (mode=${botMode}), ignoring`);
        return;
    }
    const replyWindowExpired = dailyReplies === 0 || isFirstToday;
    // 3. Upsert prospect doc in the correct collection
    const prospectRef = db.collection(collection).doc(phone);
    const prospectSnap = await prospectRef.get();
    const isNew = !prospectSnap.exists;
    const prospectData = isNew ? {} : prospectSnap.data();
    if (isNew) {
        await prospectRef.set({
            phone,
            chatState: 'NEW',
            dailyReplies: 0,
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
            lastReplyAt: null,
            wantsHumanRep: false,
            botMode,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    else {
        prospectRef.update({ lastMessageAt: admin.firestore.FieldValue.serverTimestamp() }).catch(e => console.warn('[HomerSalesBot] lastMessageAt update failed:', e.message));
    }
    // 4. Notify Homer team on first inbound message — only in agents mode (not demo)
    if (!isDemo && isFirstToday) {
        const notifyText = [
            '🔔 הודעה חדשה מפרוספקט ב-homer!',
            `טלפון: ${phone}`,
            prospectData.name ? `שם: ${prospectData.name}` : null,
            prospectData.agencyName ? `משרד: ${prospectData.agencyName}` : null,
        ]
            .filter(Boolean)
            .join('\n');
        (0, whatsappService_1.sendWhatsAppMessage)(homerIntegration, HOMER_TEAM_PHONE, notifyText).catch(e => console.warn('[HomerSalesBot] team notification failed:', e.message));
    }
    // 5. Load chat history for context
    const history = await loadHistory(phone, collection);
    // 6. Call Gemini with mode-specific prompt
    const model = getGenAI(geminiApiKey).getGenerativeModel({
        model: 'gemini-2.5-flash-preview-05-20',
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations }],
    });
    const chat = model.startChat({ history });
    let result = await withTimeout('HomerSalesBot Gemini', 15000, () => chat.sendMessage(sanitized));
    let response = result.response;
    // 7. Process function calls (up to 4 rounds)
    for (let round = 0; round < 4 && ((_a = response.functionCalls()) === null || _a === void 0 ? void 0 : _a.length); round++) {
        const calls = response.functionCalls();
        const fnResults = [];
        for (const call of calls) {
            const args = call.args;
            if (call.name === 'save_prospect_info') {
                const update = {};
                if (args.name)
                    update.name = args.name;
                if (args.agencyName)
                    update.agencyName = args.agencyName;
                if (args.city)
                    update.city = args.city;
                if (args.agentCount)
                    update.agentCount = args.agentCount;
                if (args.currentTools)
                    update.currentTools = args.currentTools;
                if (Object.keys(update).length) {
                    await prospectRef.update(update);
                    Object.assign(prospectData, update);
                }
                fnResults.push({ functionResponse: { name: call.name, response: { ok: true } } });
            }
            if (call.name === 'advance_state') {
                const valid = ['INTRO', 'QUALIFYING', 'CLOSING', 'DONE'];
                const stateValid = valid.includes(args.nextState);
                if (stateValid) {
                    await prospectRef.update({ chatState: args.nextState });
                }
                fnResults.push({ functionResponse: { name: call.name, response: { ok: stateValid } } });
            }
            if (call.name === 'schedule_training') {
                await prospectRef.update({
                    trainingFreeText: args.preferredTime,
                    chatState: 'DONE',
                });
                fnResults.push({ functionResponse: { name: call.name, response: { trainingUrl: TRAINING_URL, savedTime: args.preferredTime } } });
            }
            if (call.name === 'request_human_rep') {
                await prospectRef.update({ wantsHumanRep: true });
                // Only notify the real team when talking to real prospects (agents mode)
                if (!isDemo) {
                    const repNotify = [
                        '🆘 פרוספקט מבקש נציג אנושי!',
                        `טלפון: ${phone}`,
                        prospectData.name ? `שם: ${prospectData.name}` : null,
                        prospectData.agencyName ? `משרד: ${prospectData.agencyName}` : null,
                    ]
                        .filter(Boolean)
                        .join('\n');
                    (0, whatsappService_1.sendWhatsAppMessage)(homerIntegration, HOMER_TEAM_PHONE, repNotify).catch(e => console.warn('[HomerSalesBot] human-rep notify failed:', e.message));
                }
                fnResults.push({ functionResponse: { name: call.name, response: { ok: true } } });
            }
        }
        result = await withTimeout('HomerSalesBot fn-result', 10000, () => chat.sendMessage(fnResults));
        response = result.response;
    }
    const botReply = response.text().trim();
    if (!botReply)
        return;
    // 8. Send reply to prospect
    const sent = await (0, whatsappService_1.sendWhatsAppMessage)(homerIntegration, phone, botReply);
    if (!sent) {
        console.error(`[HomerSalesBot] Failed to send reply to ${phone}`);
        return;
    }
    // 9. Increment daily counter
    await incrementDailyReplies(phone, replyWindowExpired, collection);
    // 10. Log inbound + outbound messages (fire-and-forget)
    const msgCol = db.collection(`${collection}/${phone}/messages`);
    const ts = admin.firestore.FieldValue.serverTimestamp();
    Promise.all([
        msgCol.add({ text: sanitized, direction: 'inbound', timestamp: ts }),
        msgCol.add({ text: botReply, direction: 'outbound', timestamp: ts }),
    ]).catch(e => console.warn('[HomerSalesBot] message log failed:', e.message));
}
//# sourceMappingURL=homerSalesBot.js.map