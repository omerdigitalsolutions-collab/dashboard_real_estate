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
exports.stripeWebhookHandler = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const resend_1 = require("resend");
// אתחול של פיירבייס אדמין (אם טרם בוצע בקובץ הראשי)
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
const auth = admin.auth();
// Secure Firebase Params (Secret Manager)
// Removed STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and RESEND_API_KEY temporarily to allow deployment
/**
 * פונקציית ה-Webhook הראשית
 * מאזינה לבקשות HTTP POST שמגיעות מ-Stripe
 */
exports.stripeWebhookHandler = (0, https_1.onRequest)({}, async (req, res) => {
    // 1. Fetch decrypted values
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const resendApiKey = process.env.RESEND_API_KEY || "";
    let stripe;
    if (stripeSecretKey) {
        stripe = new stripe_1.default(stripeSecretKey, {
            apiVersion: '2026-01-28.clover',
        });
    }
    // 1. בדיקות אבטחה ראשוניות
    if (!stripeSecretKey || !webhookSecret || !stripe) {
        console.error("❌ Stripe API keys missing in environment variables.");
        res.status(500).send("Stripe configuration missing.");
        return;
    }
    const signature = req.headers["stripe-signature"];
    if (!signature) {
        console.error("❌ Missing stripe-signature header.");
        res.status(400).send("Missing signature.");
        return;
    }
    let event;
    try {
        // 2. אימות חתימה קריטי!
        // אנחנו משתמשים ב-req.rawBody כדי לוודא שהבקשה לא שונתה בדרך
        // ושהיא באמת הגיעה מ-Stripe בעזרת המפתח הסודי.
        event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
    }
    catch (err) {
        console.error(`⚠️  Webhook signature verification failed: ${err.message}`);
        // החזרת שגיאה 400 ל-Stripe כדי שידע שהאימות נכשל
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    // 3. ניתוב לפי סוג האירוע
    switch (event.type) {
        case "checkout.session.completed":
            // זה האירוע שאנחנו מחכים לו! תשלום בוצע בהצלחה בעמוד הסליקה.
            const session = event.data.object;
            console.log(`💰 Payment successful for session ID: ${session.id}`);
            // ביצוע תהליך ההקמה (Provisioning)
            try {
                await provisionNewAgency(session, resendApiKey);
                console.log("✨ Agency provisioning completed successfully.");
            }
            catch (error) {
                console.error("❌ Error during agency provisioning:", error);
                // הערה: אנחנו עדיין מחזירים 200 ל-Stripe כי קיבלנו את האירוע,
                // אבל לוג השגיאה יעזור לנו לטפל בבעיה הפנימית.
            }
            break;
        // ניתן להוסיף כאן אירועים נוספים בעתיד, כמו:
        // case "customer.subscription.deleted": // ביטול מנוי - הקפאת משרד
        // case "invoice.payment_failed": // כישלון תשלום חודשי
        default:
            // התעלמות מאירועים אחרים שאנחנו לא מטפלים בהם כרגע
            console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }
    // 4. אישור קבלה ל-Stripe
    // חובה להחזיר תשובת 200 OK מהר ככל האפשר כדי ש-Stripe לא ינסה לשלוח שוב.
    res.json({ received: true });
});
/**
 * פונקציית עזר: הקמת המשרד והמשתמש במערכת
 */
async function provisionNewAgency(session, resendApiKey) {
    var _a, _b;
    const customerEmail = (_a = session.customer_details) === null || _a === void 0 ? void 0 : _a.email;
    const customerName = ((_b = session.customer_details) === null || _b === void 0 ? void 0 : _b.name) || "Agency Admin";
    if (!customerEmail) {
        throw new Error("No email found in Stripe session.");
    }
    console.log(`🏗️ Starting provisioning for email: ${customerEmail}`);
    // שלב א': יצירת מסמך סוכנות (Agency) חדש ב-Firestore
    // משתמשים ב-doc() ללא פרמטרים כדי לייצר מזהה ייחודי אוטומטי
    const agencyRef = db.collection("agencies").doc();
    const newAgencyId = agencyRef.id;
    const agencyData = {
        name: `${customerName}'s Agency`, // שם זמני, הם יוכלו לשנות
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        subscriptionStatus: 'paid',
        stripeCustomerId: session.customer, // שמירת מזהה הלקוח ב-Stripe לעתיד
        stripeSubscriptionId: session.subscription,
        // הגדרות ברירת מחדל למשרד חדש
        settings: {
            dealStages: ['ליד חדש', 'פגישה נקבעה', 'במו"מ', 'חוזה נשלח', 'נחתם בשעה טובה'],
            targetDealsPerMonth: 5
        }
    };
    await agencyRef.set(agencyData);
    console.log(`✅ Created new agency document: ${newAgencyId}`);
    // שלב ב': יצירה או איתור של משתמש ב-Firebase Auth
    let uid;
    try {
        // בדיקה אם המשתמש כבר קיים במערכת
        const userRecord = await auth.getUserByEmail(customerEmail);
        uid = userRecord.uid;
        console.log(`ℹ️ User ${customerEmail} already exists (UID: ${uid}). Linking to new agency.`);
    }
    catch (error) {
        // המשתמש לא קיים - ניצור אותו
        console.log(`👤 Creating new Firebase Auth user for ${customerEmail}...`);
        const newUser = await auth.createUser({
            email: customerEmail,
            displayName: customerName,
            emailVerified: true, // אנחנו סומכים על האימות של Stripe
            // אנחנו לא מגדירים סיסמה כאן. נשלח מייל איפוס סיסמה.
        });
        uid = newUser.uid;
        console.log(`✅ Created new user with UID: ${uid}`);
    }
    // שלב ג': יצירת מסמך משתמש (User Profile) ב-Firestore וקישור למשרד
    // הגדרת התפקיד כ-'admin' היא קריטית!
    const userDocData = {
        email: customerEmail,
        name: customerName,
        role: 'admin', // מנהל המשרד
        agencyId: newAgencyId, // הקישור החשוב ביותר!
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        preferences: { theme: 'light' }
    };
    // שימוש ב-set עם merge:true למקרה שהמסמך היה קיים חלקית
    await db.collection("users").doc(uid).set(userDocData, { merge: true });
    console.log(`✅ User profile created/updated in Firestore and linked to agency.`);
    // שלב ד' (אופציונלי אך מומלץ): שליחת מייל "ברוכים הבאים"
    console.log(`TODO: 📧 Send welcome email with password reset link to ${customerEmail}`);
    if (resendApiKey) {
        try {
            const resetLink = await auth.generatePasswordResetLink(customerEmail);
            const resend = new resend_1.Resend(resendApiKey);
            await resend.emails.send({
                from: 'hOMER CRM <noreply@omer-crm.co.il>', // עדכן את הכתובת לכתובת המאומתת שלך ב-Resend
                to: [customerEmail],
                subject: 'ברוכים הבאים ל-hOMER CRM! הגדר את הסיסמה שלך',
                html: `
                    <div dir="rtl" style="font-family: sans-serif; color: #333;">
                        <h1>ברוכים הבאים, ${customerName}! 👋</h1>
                        <p>שמחים שהצטרפתם ל-hOMER CRM, המערכת החכמה לניהול משרד התיווך שלכם.</p>
                        <p>המשרד שלכם הוקם בהצלחה. כדי להתחיל לעבוד, אנא הגדירו סיסמה לחשבון שלכם על ידי לחיצה על הקישור להלן:</p>
                        <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #10b981; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px;">הגדרת סיסמה</a>
                        <p style="margin-top: 30px; font-size: 0.9em; color: #666;">
                            אם הקישור אינו פועל, ניתן להעתיק את הכתובת הבאה לדפדפן:<br>
                            ${resetLink}
                        </p>
                        <p>בברכה,<br>צוות hOMER</p>
                    </div>
                `
            });
            console.log(`✅ Welcome email sent to ${customerEmail}`);
        }
        catch (emailError) {
            console.error(`❌ Failed to send welcome email to ${customerEmail}:`, emailError);
            // לא נזרוק שגיאה כדי לא להכשיל את תהליך ה-Webhook כולו, המשרד כבר הוקם.
        }
    }
    else {
        console.log(`⚠️ RESEND_API_KEY is not defined. Skipping email to ${customerEmail}. Reset link: ${await auth.generatePasswordResetLink(customerEmail)}`);
    }
}
//# sourceMappingURL=stripeWebhook.js.map