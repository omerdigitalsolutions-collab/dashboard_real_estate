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
exports.onNewAgencyRegistered = exports.onSubscriptionRequestCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const whatsapp_1 = require("../whatsapp");
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
const params_1 = require("firebase-functions/params");
const resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
const GREEN_API_MASTER_KEY = (0, params_1.defineString)('GREEN_API_MASTER_KEY');
exports.onSubscriptionRequestCreated = (0, firestore_1.onDocumentCreated)({
    document: "subscription_requests/{requestId}",
    secrets: [resendApiKey]
}, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    const name = data.name || "לא ידוע";
    const phone = data.phone || "לא ידוע";
    const email = data.email || "לא סופק";
    const plan = data.plan || "לא ידוע";
    const adminEmail = "omerdigitalsolutions@gmail.com";
    const adminWhatsApp = "972507706024";
    // 1. Send Email Notification
    try {
        const apiKey = resendApiKey.value();
        if (apiKey) {
            const resend = new resend_1.Resend(apiKey);
            await resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: adminEmail,
                subject: `🚀 בקשת מנוי חדשה מתוך המערכת: ${name}`,
                html: `
                    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                      <h2 style="color: #020b18;">ליד חם - בקשה לשדרוג מנוי!</h2>
                      <p>התקבלה בקשה חדשה במערכת דרך חלון השדרוג:</p>
                      <ul style="list-style: none; padding: 0;">
                        <li><b>שם הלקוח:</b> ${name}</li>
                        <li><b>מספר טלפון:</b> ${phone}</li>
                        <li><b>אימייל:</b> ${email}</li>
                        <li><b>מסלול מבוקש:</b> ${plan}</li>
                      </ul>
                      <p><b>מומלץ לחזור אליו בהקדם בוואטסאפ או בשיחה לסגירת העסקה.</b></p>
                      <br/>
                      <p>צוות hOMER CRM</p>
                    </div>
                  `
            });
            console.log(`[onSubscriptionRequestCreated] Email sent to ${adminEmail}`);
        }
        else {
            console.warn('[onSubscriptionRequestCreated] RESEND_API_KEY not set — email skipped.');
        }
    }
    catch (err) {
        console.error("Error sending Resend email:", err);
    }
    // 2. Add System Alert for Super Admin inside the DB (so it shows in dashboard later if we want)
    try {
        await admin.firestore().collection("admin_alerts").add({
            type: "subscription_request",
            title: "בקשת מנוי חדשה",
            body: `${name} השאיר פרטים לשדרוג מסלול ${plan}. טלפון: ${phone}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false
        });
    }
    catch (err) {
        console.error("Error creating admin alert:", err);
    }
    // 3. Log to Google Sheets via Apps Script webhook
    try {
        const sheetsWebhookUrl = "https://script.google.com/macros/s/AKfycbz2XVMpUrISGf6TwoHOb9LFw_Q5AuGVpd7ZEbJBf0V9681fpbjSB9BDrvEMUUqrdelu/exec";
        const payload = {
            type: "subscription_request",
            name,
            phone,
            email,
            plan,
            timestamp: new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
        };
        const response = await fetch(sheetsWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        console.log(`[onSubscriptionRequestCreated] Google Sheets response: ${response.status}`);
    }
    catch (err) {
        console.error("Error logging to Google Sheets:", err);
    }
    // 4. Send WhatsApp Alert via GreenAPI
    try {
        const adminPhoneForWhatsapp = "972507706024";
        const greenApiKey = GREEN_API_MASTER_KEY.value();
        if (greenApiKey) {
            const message = `🔔 *ליד חם - בקשה לשדרוג מנוי!*\n\nהתקבלה בקשה מחלון השדרוג במערכת:\n\n*שם הלקוח:* ${name}\n*טלפון:* ${phone}\n*אימייל:* ${email}\n*מסלול:* ${plan}\n\nמומלץ לחזור אליו כעת! 🚀`;
            await (0, whatsapp_1.sendSystemWhatsappMessage)(adminPhoneForWhatsapp, message, greenApiKey);
            console.log(`[onSubscriptionRequestCreated] WhatsApp alert sent to ${adminPhoneForWhatsapp}`);
        }
        else {
            console.warn('[onSubscriptionRequestCreated] GREEN_API_MASTER_KEY not set.');
        }
    }
    catch (err) {
        console.error("Error sending WhatsApp alert:", err);
    }
});
exports.onNewAgencyRegistered = (0, firestore_1.onDocumentCreated)({
    document: "agencies/{agencyId}",
    secrets: [resendApiKey]
}, async (event) => {
    var _a;
    const snap = event.data;
    if (!snap)
        return;
    const data = snap.data();
    const agencyName = data.name || "לא ידוע";
    const ownerPhone = ((_a = data.billing) === null || _a === void 0 ? void 0 : _a.ownerPhone) || "לא ידוע";
    const agencyId = event.params.agencyId;
    const adminEmail = "omerdigitalsolutions@gmail.com";
    // Try to get the owner's email from the users collection
    let ownerEmail = "";
    let ownerName = "";
    try {
        const usersSnap = await admin.firestore().collection('users')
            .where('agencyId', '==', agencyId)
            .where('role', '==', 'admin')
            .limit(1)
            .get();
        if (!usersSnap.empty) {
            ownerEmail = usersSnap.docs[0].data().email;
            ownerName = usersSnap.docs[0].data().name || "לקוח יקר";
        }
    }
    catch (err) {
        console.error("Could not fetch owner email for welcome email", err);
    }
    try {
        const apiKey = resendApiKey.value();
        if (apiKey) {
            const resend = new resend_1.Resend(apiKey);
            // 1. Send Alert to Super Admin
            await resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: adminEmail,
                subject: `🎉 סוכנות חדשה נרשמה למערכת: ${agencyName}`,
                html: `
                    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                      <h2 style="color: #020b18;">לקוח חדש במערכת!</h2>
                      <p>סוכנות חדשה סיימה את תהליך ההרשמה (Onboarding) וכעת בתקופת ניסיון.</p>
                      <ul style="list-style: none; padding: 0;">
                        <li><b>שם הסוכנות:</b> ${agencyName}</li>
                        <li><b>שם הלקוח:</b> ${ownerName}</li>
                        <li><b>מספר טלפון:</b> ${ownerPhone}</li>
                        <li><b>אימייל:</b> ${ownerEmail}</li>
                        <li><b>זמן הרשמה:</b> ${new Date().toLocaleString('he-IL')}</li>
                      </ul>
                      <p><b>בהצלחה!</b></p>
                    </div>
                  `
            });
            // 2. Send Welcome Email to the new Agency Owner
            if (ownerEmail) {
                await resend.emails.send({
                    from: 'hOMER CRM <noreply@homer-crm.co.il>',
                    to: ownerEmail,
                    subject: `ברוכים הבאים ל-hOMER CRM! 🎉`,
                    html: `
                        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                          <h2 style="color: #020b18;">שלום ${ownerName}, ברוכים הבאים ל-hOMER!</h2>
                          <p>שמחים שבחרת ב-hOMER לניהול סוכנות הנדל"ן שלך: <b>${agencyName}</b>.</p>
                          <p>החשבון שלך נוצר בהצלחה וקיבלת <b>7 ימי ניסיון חינם</b> במסלול הפרימיום שלנו (Pro) כדי לחוות את כל הכלים שיש למערכת להציע.</p>
                          <br/>
                          <p><b>מה עכשיו?</b></p>
                          <ul>
                            <li>התחבר למערכת והזמן את הסוכנים שלך למשרד.</li>
                            <li>העלה את הנכסים שלך או ייבא אותם בצורה חכמה.</li>
                            <li>נהל את הלידים והעסקאות שלך בקלות.</li>
                          </ul>
                          <br/>
                          <a href="https://homer-crm.co.il" style="display:inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">היכנס למערכת</a>
                          <br/><br/>
                          <p>אנו כאן לכל שאלה,<br/>צוות hOMER</p>
                        </div>
                      `
                });
            }
            console.log(`[onNewAgencyRegistered] Emails sent successfully.`);
        }
    }
    catch (err) {
        console.error("Error sending Resend emails:", err);
    }
});
//# sourceMappingURL=manual_requests.js.map