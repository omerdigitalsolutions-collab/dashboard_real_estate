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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappWebhook = exports.getWhatsAppQrCode = void 0;
const https_1 = require("firebase-functions/v2/https");
const https_2 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
// במידה ו-admin.initializeApp() כבר הופעל ב-index.ts
const db = admin.firestore();
/**
 * פונקציה 1: משיכת ה-QR Code מ-Green API
 * מופעלת מהקליינט (הדפדפן) על ידי הסוכן
 */
exports.getWhatsAppQrCode = (0, https_1.onCall)({ region: 'europe-west1' }, async (request) => {
    // אימות שהמשתמש מחובר
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "רק משתמשים מחוברים יכולים לבצע פעולה זו.");
    }
    const { idInstance, apiTokenInstance, agencyId } = request.data;
    if (!idInstance || !apiTokenInstance || !agencyId) {
        throw new https_1.HttpsError("invalid-argument", "חסרים פרטי זיהוי של Green API.");
    }
    try {
        // פנייה ל-Green API למשיכת ה-QR כ-Base64
        const url = `https://api.greenapi.com/waInstance${idInstance}/qr/${apiTokenInstance}`;
        const response = await axios_1.default.get(url);
        if (response.data && response.data.type === "qrCode") {
            // שמירת המפתחות ב-Firestore של המשרד בסטטוס "ממתין לסריקה"
            await db.collection("agencies").doc(agencyId).set({
                whatsappIntegration: {
                    idInstance,
                    apiTokenInstance,
                    status: 'pending',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }
            }, { merge: true });
            // החזרת המחרוזת לקליינט
            return { qrCode: response.data.message };
        }
        else {
            throw new https_1.HttpsError("internal", "Green API לא החזיר קוד QR תקין.");
        }
    }
    catch (error) {
        console.error("Error fetching QR from Green API:", error);
        throw new https_1.HttpsError("internal", "שגיאה בתקשורת מול שרתי ווטסאפ.");
    }
});
/**
 * פונקציה 2: ה-Webhook המרכזי לכל המשרדים
 * ה-URL של הפונקציה הזו הוא מה שאתה מזין בהגדרות של Green API
 */
exports.whatsappWebhook = (0, https_2.onRequest)({ region: 'europe-west1' }, async (req, res) => {
    var _a, _b, _c;
    try {
        const body = req.body;
        // חובה להחזיר 200 ל-Green API מיד כדי שלא ישלחו שוב ושוב
        res.status(200).send("OK");
        const idInstance = body === null || body === void 0 ? void 0 : body.idInstance;
        const typeWebhook = body === null || body === void 0 ? void 0 : body.typeWebhook;
        // אנחנו מעוניינים רק בהודעות נכנסות כרגע
        if (!idInstance || typeWebhook !== "incomingMessageReceived")
            return;
        // חילוץ המספר של השולח וניקוי שלו (Green API שולח בפורמט 972501234567@c.us)
        const rawSender = (_a = body === null || body === void 0 ? void 0 : body.senderData) === null || _a === void 0 ? void 0 : _a.sender;
        const textMessage = (_c = (_b = body === null || body === void 0 ? void 0 : body.messageData) === null || _b === void 0 ? void 0 : _b.textMessageData) === null || _c === void 0 ? void 0 : _c.textMessage;
        if (!rawSender || !textMessage)
            return;
        // המרה לפורמט טלפון ישראלי ששמור אצלנו במערכת (0501234567)
        let cleanPhone = rawSender.replace("@c.us", "");
        if (cleanPhone.startsWith("972")) {
            cleanPhone = "0" + cleanPhone.substring(3);
        }
        // 1. מציאת המשרד (Agency) שלו שייך ה-Instance הזה
        const agenciesSnapshot = await db.collection("agencies")
            .where("whatsappIntegration.idInstance", "==", idInstance)
            .limit(1)
            .get();
        if (agenciesSnapshot.empty) {
            console.log(`Webhook Error: Unrecognized idInstance ${idInstance}`);
            return;
        }
        const agencyId = agenciesSnapshot.docs[0].id;
        // 2. מציאת הליד בתוך המשרד הזה לפי מספר טלפון
        const leadsSnapshot = await db.collection("leads")
            .where("agencyId", "==", agencyId)
            .where("phone", "==", cleanPhone)
            .limit(1)
            .get();
        if (leadsSnapshot.empty) {
            // אם אין ליד כזה, אנחנו פשוט מתעלמים מההודעה (אפשר גם לפתוח ליד חדש אוטומטית אם תרצה בעתיד)
            console.log(`Ignored message from ${cleanPhone} - No matching lead found.`);
            return;
        }
        const leadId = leadsSnapshot.docs[0].id;
        // 3. שמירת ההודעה בתת-הקולקציה של הליד
        await db.collection(`leads/${leadId}/messages`).add({
            text: textMessage,
            direction: 'inbound', // הודעה נכנסת
            senderPhone: cleanPhone,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false
        });
        console.log(`Successfully routed message to lead ${leadId}`);
    }
    catch (error) {
        console.error("Fatal Webhook Error:", error);
        // כבר החזרנו 200 קודם, אז רק נרשום בלוגים
    }
});
//# sourceMappingURL=whatsapp.js.map