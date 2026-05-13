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

import * as admin from 'firebase-admin';
import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  SchemaType,
  Content,
} from '@google/generative-ai';
import { sendWhatsAppMessage, WhatsappIntegration } from '../whatsappService';
import { sanitizeInput } from '../whatsapp/security/sanitizeInput';
import { detectInjection } from '../whatsapp/security/detectInjection';

const db = admin.firestore();
const DAILY_REPLY_LIMIT = 4;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const HOMER_TEAM_PHONE = '0507706024';
const TRAINING_URL = 'https://homer.management/training';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatState = 'NEW' | 'INTRO' | 'QUALIFYING' | 'CLOSING' | 'DONE';

export interface HomerSalesBotParams {
  phone: string;
  text: string;
  geminiApiKey: string;
  homerIntegration: WhatsappIntegration;
  botMode: 'agents' | 'demo';
}

// ─── Gemini Setup ─────────────────────────────────────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;
let _genAIKey = '';
function getGenAI(apiKey: string): GoogleGenerativeAI {
  if (!_genAI || _genAIKey !== apiKey) {
    _genAI = new GoogleGenerativeAI(apiKey);
    _genAIKey = apiKey;
  }
  return _genAI;
}

function withTimeout<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    fn().then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
}

const SYSTEM_PROMPT = `אתה בוט המכירות של homer — מערכת CRM לסוכנויות נדל"ן ישראליות.

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

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'save_prospect_info',
    description: 'Save collected information about the prospect agency',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name:         { type: SchemaType.STRING, description: 'Full name of the contact person' },
        agencyName:   { type: SchemaType.STRING, description: 'Name of the real estate agency' },
        city:         { type: SchemaType.STRING, description: 'City/region where the agency operates' },
        agentCount:   { type: SchemaType.NUMBER, description: 'Number of agents in the agency' },
        currentTools: { type: SchemaType.STRING, description: 'Tools or CRM they currently use' },
      },
      required: [],
    },
  },
  {
    name: 'advance_state',
    description: 'Move the conversation to the next state in the flow',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        nextState: {
          type: SchemaType.STRING,
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
      type: SchemaType.OBJECT,
      properties: {
        preferredTime: {
          type: SchemaType.STRING,
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
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
];

// ─── Daily-reply helpers ──────────────────────────────────────────────────────

async function getRepliesInfo(
  phone: string,
): Promise<{ dailyReplies: number; isFirstToday: boolean }> {
  const snap = await db.collection('homer_prospects').doc(phone).get();
  if (!snap.exists) return { dailyReplies: 0, isFirstToday: true };

  const data = snap.data()!;
  const lastMsg = (data.lastMessageAt as admin.firestore.Timestamp | null)?.toMillis() ?? 0;
  const lastReply = (data.lastReplyAt as admin.firestore.Timestamp | null)?.toMillis() ?? 0;

  const isFirstToday = Date.now() - lastMsg > WINDOW_MS;
  const replyWindowExpired = Date.now() - lastReply > WINDOW_MS;
  const dailyReplies = replyWindowExpired ? 0 : (data.dailyReplies ?? 0);

  return { dailyReplies, isFirstToday };
}

async function incrementDailyReplies(phone: string, wasWindowExpired: boolean): Promise<void> {
  const ref = db.collection('homer_prospects').doc(phone);
  await ref.update({
    dailyReplies: wasWindowExpired ? 1 : admin.firestore.FieldValue.increment(1),
    lastReplyAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Chat history ─────────────────────────────────────────────────────────────

async function loadHistory(phone: string): Promise<Content[]> {
  const snap = await db
    .collection(`homer_prospects/${phone}/messages`)
    .orderBy('timestamp', 'asc')
    .limitToLast(16)
    .get();

  const history: Content[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.direction !== 'inbound' && d.direction !== 'outbound') continue;
    history.push({
      role: d.direction === 'outbound' ? 'model' : 'user',
      parts: [{ text: d.text as string }],
    });
  }
  return history;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function handleHomerSalesBot(params: HomerSalesBotParams): Promise<void> {
  const { phone, text, geminiApiKey, homerIntegration, botMode } = params;

  // 1. Sanitize + injection check
  const sanitized = sanitizeInput(text);
  const { isInjection } = detectInjection(sanitized);
  if (isInjection) {
    console.warn(`[HomerSalesBot] Injection attempt from ${phone}`);
    return;
  }

  // 2. Daily reply guard — read before any writes
  const { dailyReplies, isFirstToday } = await getRepliesInfo(phone);
  if (dailyReplies >= DAILY_REPLY_LIMIT) {
    console.log(`[HomerSalesBot] Daily limit reached for ${phone}, ignoring`);
    return;
  }

  const replyWindowExpired = dailyReplies === 0 && !isFirstToday ? true : isFirstToday;

  // 3. Upsert prospect doc
  const prospectRef = db.collection('homer_prospects').doc(phone);
  const prospectSnap = await prospectRef.get();
  const isNew = !prospectSnap.exists;
  const prospectData = isNew ? {} : (prospectSnap.data() as Record<string, any>);

  if (isNew) {
    await prospectRef.set({
      phone,
      chatState: 'NEW' as ChatState,
      dailyReplies: 0,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastReplyAt: null,
      wantsHumanRep: false,
      botMode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    prospectRef.update({ lastMessageAt: admin.firestore.FieldValue.serverTimestamp() }).catch(e =>
      console.warn('[HomerSalesBot] lastMessageAt update failed:', e.message),
    );
  }

  // 4. Notify Homer team on first inbound message in 24 h window
  if (isFirstToday) {
    const notifyText = [
      '🔔 הודעה חדשה מפרוספקט ב-homer!',
      `טלפון: ${phone}`,
      prospectData.name ? `שם: ${prospectData.name}` : null,
      prospectData.agencyName ? `משרד: ${prospectData.agencyName}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    sendWhatsAppMessage(homerIntegration, HOMER_TEAM_PHONE, notifyText).catch(e =>
      console.warn('[HomerSalesBot] team notification failed:', e.message),
    );
  }

  // 5. Load chat history for context
  const history = await loadHistory(phone);

  // 6. Call Gemini
  const model = getGenAI(geminiApiKey).getGenerativeModel({
    model: 'gemini-2.5-flash-preview-05-20',
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations }],
  });

  const chat = model.startChat({ history });

  let result = await withTimeout('HomerSalesBot Gemini', 15_000, () =>
    chat.sendMessage(sanitized),
  );
  let response = result.response;

  // 7. Process function calls (up to 4 rounds)
  for (let round = 0; round < 4 && response.functionCalls()?.length; round++) {
    const calls = response.functionCalls()!;
    const fnResults: Array<{ functionResponse: { name: string; response: object } }> = [];

    for (const call of calls) {
      const args = call.args as Record<string, any>;

      if (call.name === 'save_prospect_info') {
        const update: Record<string, any> = {};
        if (args.name)         update.name = args.name;
        if (args.agencyName)   update.agencyName = args.agencyName;
        if (args.city)         update.city = args.city;
        if (args.agentCount)   update.agentCount = args.agentCount;
        if (args.currentTools) update.currentTools = args.currentTools;
        if (Object.keys(update).length) {
          await prospectRef.update(update);
          Object.assign(prospectData, update);
        }
        fnResults.push({ functionResponse: { name: call.name, response: { ok: true } } });
      }

      if (call.name === 'advance_state') {
        const valid: ChatState[] = ['INTRO', 'QUALIFYING', 'CLOSING', 'DONE'];
        if (valid.includes(args.nextState)) {
          await prospectRef.update({ chatState: args.nextState });
        }
        fnResults.push({ functionResponse: { name: call.name, response: { ok: true } } });
      }

      if (call.name === 'schedule_training') {
        await prospectRef.update({
          trainingFreeText: args.preferredTime,
          chatState: 'DONE' as ChatState,
        });
        fnResults.push({ functionResponse: { name: call.name, response: { trainingUrl: TRAINING_URL, savedTime: args.preferredTime } } });
      }

      if (call.name === 'request_human_rep') {
        await prospectRef.update({ wantsHumanRep: true });
        const repNotify = [
          '🆘 פרוספקט מבקש נציג אנושי!',
          `טלפון: ${phone}`,
          prospectData.name ? `שם: ${prospectData.name}` : null,
          prospectData.agencyName ? `משרד: ${prospectData.agencyName}` : null,
        ]
          .filter(Boolean)
          .join('\n');
        sendWhatsAppMessage(homerIntegration, HOMER_TEAM_PHONE, repNotify).catch(e =>
          console.warn('[HomerSalesBot] human-rep notify failed:', e.message),
        );
        fnResults.push({ functionResponse: { name: call.name, response: { ok: true } } });
      }
    }

    result = await withTimeout('HomerSalesBot fn-result', 10_000, () =>
      chat.sendMessage(fnResults),
    );
    response = result.response;
  }

  const botReply = response.text().trim();
  if (!botReply) return;

  // 8. Send reply to prospect
  const sent = await sendWhatsAppMessage(homerIntegration, phone, botReply);
  if (!sent) {
    console.error(`[HomerSalesBot] Failed to send reply to ${phone}`);
    return;
  }

  // 9. Increment daily counter
  await incrementDailyReplies(phone, replyWindowExpired);

  // 10. Log inbound + outbound messages (fire-and-forget)
  const msgCol = db.collection(`homer_prospects/${phone}/messages`);
  const ts = admin.firestore.FieldValue.serverTimestamp();
  Promise.all([
    msgCol.add({ text: sanitized, direction: 'inbound', timestamp: ts }),
    msgCol.add({ text: botReply,   direction: 'outbound', timestamp: ts }),
  ]).catch(e => console.warn('[HomerSalesBot] message log failed:', e.message));
}
