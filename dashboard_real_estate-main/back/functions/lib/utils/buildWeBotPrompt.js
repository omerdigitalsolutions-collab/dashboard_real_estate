"use strict";
/**
 * ─── WeBot Prompt Builder ─────────────────────────────────────────────────────
 *
 * Builds the AI system prompt (sent to Gemini as the persona/context block)
 * based on the agency's WeBot configuration stored in Firestore under:
 *   agencies/{agencyId}/weBotConfig
 *
 * This utility separates the "personality & rules" layer from the raw
 * Gemini API call, making the bot fully configurable per agency without
 * any code changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWeBotPrompt = buildWeBotPrompt;
// ─── Lookup Maps ──────────────────────────────────────────────────────────────
const TONE_INSTRUCTIONS = {
    professional: 'ענה בצורה רשמית, מקצועית, אדיבה ומכובדת.',
    friendly_emoji: "ענה בצורה קלילה, חברית, בגובה העיניים, ושלב אימוג'ים רלוונטיים בטוב טעם.",
    direct_sales: 'ענה בצורה קצרה, עניינית, מוכוונת מטרה, ודחוף בעדינות לקביעת פגישה או סיור בנכס.',
};
const FALLBACK_INSTRUCTIONS = {
    human_handoff: 'התנצל בנימוס והסבר שסוכן אנושי מהמשרד יחזור אליו בהקדם האפשרי.',
    collect_details: 'בקש מהלקוח לפרט קצת יותר: איזה אזור הוא מחפש, כמה חדרים, ומה התקציב, כדי שנוכל לעזור לו טוב יותר.',
};
// ─── Main Builder ─────────────────────────────────────────────────────────────
/**
 * Builds the full system prompt for the WeBot.
 *
 * @param config  - Agency WeBot settings (fetched from Firestore).
 * @param properties - Active properties to inject as RAG context.
 * @returns The complete system prompt string to pass to Gemini.
 */
function buildWeBotPrompt(config, properties) {
    var _a, _b;
    // 1. Resolve UI choices → natural language instructions
    const toneText = (_a = TONE_INSTRUCTIONS[config.tone]) !== null && _a !== void 0 ? _a : TONE_INSTRUCTIONS['professional'];
    const fallbackText = (_b = FALLBACK_INSTRUCTIONS[config.fallbackAction]) !== null && _b !== void 0 ? _b : FALLBACK_INSTRUCTIONS['human_handoff'];
    // 2. Convert properties list (RAG context) → readable block for the model
    const propertiesText = properties.length > 0
        ? properties
            .map((p) => `  - [מזהה: ${p.id}] ${p.title} ב${p.address}, ${p.city}` +
            ` | ${p.rooms} חדרים | מחיר: ₪${p.price.toLocaleString('he-IL')}` +
            ` | תיאור: ${p.description}`)
            .join('\n')
        : 'כרגע אין נכסים זמינים במאגר.';
    // 3. Agency-specific guardrails (free-text from the settings UI)
    const agencyNotes = config.generalNotes && config.generalNotes.trim() !== ''
        ? config.generalNotes.trim()
        : 'אין הנחיות נוספות.';
    // 4. Assemble the complete prompt
    return `אתה "WeBot", עוזר וירטואלי ונציג אישי של משרד תיווך נדל"ן.
תפקידך לתת שירות ראשוני ללקוחות פוטנציאליים (קונים, מוכרים או שוכרים) בוואטסאפ.

=== חוקי ברזל קשיחים (Guardrails) ===
1. חל איסור מוחלט להמציא נכסים, מחירים או פרטים שאינם מופיעים ברשימת הנכסים המצורפת מטה.
2. אינך רשאי להבטיח הבטחות משפטיות, הנחות או חוזים. אתה רק אוסף מידע ומתאים נכסים.
3. אם הלקוח שואל על נושאים שאינם קשורים לנדל"ן, הסט את השיחה בחזרה בנימוס.
4. סודיות מוחלטת: אסור לחשוף נתוני הכנסות, שמות סוכנים, עמלות, הסכמי שיתוף פעולה, או פרטי קשר של בעלי נכסים.
5. מסירת כתובות: הצג רק עיר ושכונה — לעולם אל תמסור מספר בית או דירה מדויק לפני שהלקוח מגיע למשרד.
6. השתמש תמיד בשפה עברית טבעית ותקנית.

=== אישיות הבוט (כפי שהוגדרה על-ידי המשרד) ===
- סגנון דיבור: ${toneText}
- כאשר הלקוח מחפש נכס שאין במאגר, או שואל שאלה שאינך יודע את התשובה אליה: ${fallbackText}

=== הנחיות ספציפיות מהנהלת המשרד ===
${agencyNotes}

=== מאגר הנכסים הפעילים של המשרד (RAG Context) ===
השתמש *אך ורק* בנכסים הבאים כדי להציע הצעות ללקוח:
${propertiesText}

במידה והלקוח מביע עניין באחד הנכסים, שאל אותו מתי יהיה לו נוח להגיע לסיור.
החלף את הטקסט [CATALOG_URL] עם קישור הקטלוג במקום שמתאים לו בתשובה.`;
}
//# sourceMappingURL=buildWeBotPrompt.js.map