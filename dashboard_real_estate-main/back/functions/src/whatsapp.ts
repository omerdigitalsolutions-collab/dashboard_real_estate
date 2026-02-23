import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import axios from "axios";

// במידה ו-admin.initializeApp() כבר הופעל ב-index.ts
const db = admin.firestore();

/**
 * פונקציה 1: משיכת ה-QR Code מ-Green API
 * מופעלת מהקליינט (הדפדפן) על ידי הסוכן
 */
export const getWhatsAppQrCode = onCall({ region: 'europe-west1' }, async (request) => {
  // אימות שהמשתמש מחובר
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "רק משתמשים מחוברים יכולים לבצע פעולה זו.");
  }

  const { idInstance, apiTokenInstance, agencyId } = request.data;

  if (!idInstance || !apiTokenInstance || !agencyId) {
    throw new HttpsError("invalid-argument", "חסרים פרטי זיהוי של Green API.");
  }

  try {
    // פנייה ל-Green API למשיכת ה-QR כ-Base64
    const url = `https://api.greenapi.com/waInstance${idInstance}/qr/${apiTokenInstance}`;
    const response = await axios.get(url);

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
    } else {
      throw new HttpsError("internal", "Green API לא החזיר קוד QR תקין.");
    }
  } catch (error) {
    console.error("Error fetching QR from Green API:", error);
    throw new HttpsError("internal", "שגיאה בתקשורת מול שרתי ווטסאפ.");
  }
});

/**
 * פונקציה 2: ה-Webhook המרכזי לכל המשרדים
 * ה-URL של הפונקציה הזו הוא מה שאתה מזין בהגדרות של Green API
 */
export const whatsappWebhook = onRequest({ region: 'europe-west1' }, async (req, res) => {
  try {
    // 1. Webhook Security: Validate custom secret header
    // In production, define GREEN_API_WEBHOOK_SECRET in your Firebase env config (.env file)
    const secret = req.headers['x-greenapi-webhook-secret'];
    if (secret !== process.env.GREEN_API_WEBHOOK_SECRET) {
      res.status(401).send("Unauthorized");
      return;
    }

    const body = req.body;

    // חובה להחזיר 200 ל-Green API מיד כדי שלא ישלחו שוב ושוב
    res.status(200).send("OK");

    const idInstance = body?.idInstance;
    const typeWebhook = body?.typeWebhook;
    const idMessage = body?.idMessage;

    // אנחנו מעוניינים רק בהודעות נכנסות כרגע
    if (!idInstance || typeWebhook !== "incomingMessageReceived") return;

    // חילוץ המספר של השולח וניקוי שלו (Green API שולח בפורמט 972501234567@c.us)
    const rawSender = body?.senderData?.sender;
    const textMessage = body?.messageData?.textMessageData?.textMessage;

    if (!rawSender || !textMessage) return;

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

    // 3. Idempotency Check (Concurrency): ensure we don't save the same message twice
    if (idMessage) {
      const existingMessage = await db.collection(`leads/${leadId}/messages`)
        .where("idMessage", "==", idMessage)
        .limit(1)
        .get();

      if (!existingMessage.empty) {
        console.log(`Webhook Idempotency: Duplicate message ignored -> ${idMessage}`);
        return; // function completes silently since 200 OK was already sent
      }
    }

    // 4. שמירת ההודעה בתת-הקולקציה של הליד
    await db.collection(`leads/${leadId}/messages`).add({
      idMessage: idMessage || null, // store for future idempotency checks
      text: textMessage,
      direction: 'inbound', // הודעה נכנסת
      senderPhone: cleanPhone,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: false
    });

    console.log(`Successfully routed message to lead ${leadId}`);

  } catch (error) {
    console.error("Fatal Webhook Error:", error);
    // כבר החזרנו 200 קודם, אז רק נרשום בלוגים
  }
});
