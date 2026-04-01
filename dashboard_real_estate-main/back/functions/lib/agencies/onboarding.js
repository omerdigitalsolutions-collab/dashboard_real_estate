"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgencyAccount = exports.checkPhoneAvailable = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
const resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
const db = (0, firestore_1.getFirestore)();
// Google Apps Script webhook — same URL used in LandingPage contact form
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbz2XVMpUrISGf6TwoHOb9LFw_Q5AuGVpd7ZEbJBf0V9681fpbjSB9BDrvEMUUqrdelu/exec';
/**
 * checkPhoneAvailable — Checks if a given phone number is already registered in the system.
 */
exports.checkPhoneAvailable = (0, https_1.onCall)({ cors: true }, async (request) => {
    try {
        let { phone } = request.data;
        if (!(phone === null || phone === void 0 ? void 0 : phone.trim())) {
            throw new https_1.HttpsError('invalid-argument', 'phone is required.');
        }
        const phoneRef = db.collection('used_phones').doc(phone);
        const snap = await phoneRef.get();
        return { available: !snap.exists };
    }
    catch (error) {
        console.error('[checkPhoneAvailable] Error:', error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError('internal', 'שגיאה בבדיקת זמינות מספר הטלפון. אנא נסה שוב.');
    }
});
/**
 * createAgencyAccount — Called when a new admin completes onboarding.
 *
 * Creates:
 *   1. A new `agencies` document.
 *   2. A `users/{uid}` document linked to the new agency.
 *   3. An `activeTrials` document.
 *   4. A `used_phones` document.
 *
 * Security: Requires an authenticated Firebase user.
 */
exports.createAgencyAccount = (0, https_1.onCall)({ cors: true, secrets: [resendApiKey] }, async (request) => {
    var _a;
    // 1. Auth Guard
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to create an agency account.');
    }
    const uid = request.auth.uid;
    const email = (_a = request.auth.token.email) !== null && _a !== void 0 ? _a : '';
    // 2. Input Validation
    const { agencyName, userName, phone } = request.data;
    if (!(agencyName === null || agencyName === void 0 ? void 0 : agencyName.trim()) || !(userName === null || userName === void 0 ? void 0 : userName.trim()) || !(phone === null || phone === void 0 ? void 0 : phone.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'agencyName, userName, and phone are all required.');
    }
    // 3. Phone verification via Firebase Auth
    const normalizedPhone = phone.trim();
    const userRecord = await (0, auth_1.getAuth)().getUser(uid);
    if (userRecord.phoneNumber !== normalizedPhone) {
        throw new https_1.HttpsError('permission-denied', 'אימות מספר הטלפון לא הושלם. אנא חזור לשלב אימות ה-SMS ונסה שוב.');
    }
    // 4. Duplicate Trial Check (outside transaction)
    const oldTrials = await db.collection('activeTrials')
        .where('uid', '==', uid)
        .limit(1)
        .get();
    if (!oldTrials.empty) {
        throw new https_1.HttpsError('permission-denied', 'You have already used your free trial on another agency account.');
    }
    const agencyRef = db.collection('agencies').doc();
    const userRef = db.doc(`users/${uid}`);
    const trialRef = db.collection('activeTrials').doc();
    const phoneRef = db.collection('used_phones').doc(normalizedPhone);
    // 5. Set Custom User Claims before Firestore writes
    try {
        await (0, auth_1.getAuth)().setCustomUserClaims(uid, {
            agencyId: agencyRef.id,
            role: 'admin',
        });
    }
    catch (claimsErr) {
        console.error('[createAgencyAccount] Failed to set custom claims:', claimsErr);
        throw new https_1.HttpsError('internal', 'Failed to set user permissions. Please try again.');
    }
    // 6. DB Transaction — Reads then Writes
    const trialEndsDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
        await db.runTransaction(async (t) => {
            // Reads first
            const existingUser = await t.get(userRef);
            if (existingUser.exists) {
                throw new https_1.HttpsError('already-exists', 'User is already associated with an agency.');
            }
            const existingPhone = await t.get(phoneRef);
            if (existingPhone.exists) {
                throw new https_1.HttpsError('already-exists', 'This phone number is already registered to an agency.');
            }
            // Writes
            t.set(agencyRef, {
                name: agencyName.trim(),
                subscriptionTier: 'free',
                monthlyGoals: { commissions: 100000, deals: 5, leads: 20 },
                settings: {},
                billing: {
                    planId: 'free_trial',
                    status: 'trialing',
                    trialEndsAt: trialEndsDate,
                    ownerPhone: normalizedPhone,
                },
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            t.set(userRef, {
                uid,
                email,
                name: userName.trim(),
                phone: normalizedPhone,
                agencyId: agencyRef.id,
                role: 'admin',
                isActive: true,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            t.set(trialRef, {
                agencyId: agencyRef.id,
                uid,
                trialEndsAt: trialEndsDate,
                status: 'active',
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            t.set(phoneRef, {
                uid,
                email,
                usedAt: firestore_1.FieldValue.serverTimestamp()
            });
        });
    }
    catch (txErr) {
        console.error('[createAgencyAccount] Transaction failed:', txErr);
        // Step 5 rollback — clear claims if DB write failed
        try {
            await (0, auth_1.getAuth)().setCustomUserClaims(uid, {});
        }
        catch (cleanupErr) {
            console.error('[createAgencyAccount] Failed to clear stale claims:', uid, cleanupErr);
        }
        if (txErr instanceof https_1.HttpsError) {
            throw txErr;
        }
        throw new https_1.HttpsError('internal', 'Failed to create agency account. Please try again.');
    }
    // 7. Non-blocking side effects: Emails
    const apiKey = resendApiKey.value();
    if (apiKey) {
        try {
            const resend = new resend_1.Resend(apiKey);
            const adminEmail = 'omerdigitalsolutions@gmail.com';
            await resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: adminEmail,
                subject: `🎉 סוכנות חדשה נרשמה: ${agencyName.trim()}`,
                html: `
                <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #020b18;">לקוח חדש במערכת!</h2>
                  <p>סוכנות חדשה סיימה תהליך הרשמה ונמצאת עכשיו בתקופת הניסיון.</p>
                  <ul style="list-style: none; padding: 0;">
                    <li><b>שם הסוכנות:</b> ${agencyName.trim()}</li>
                    <li><b>שם המנהל:</b> ${userName.trim()}</li>
                    <li><b>אימייל:</b> ${email}</li>
                    <li><b>טלפון:</b> ${normalizedPhone}</li>
                    <li><b>זמן הרשמה:</b> ${new Date().toLocaleString('he-IL')}</li>
                  </ul>
                  <p>Agency ID: <code>${agencyRef.id}</code></p>
                </div>`
            });
            await resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: email,
                subject: `ברוכים הבאים ל-hOMER CRM! 🎉`,
                html: `
                <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #020b18;">שלום ${userName.trim()}, ברוכים הבאים ל-hOMER!</h2>
                  <p>שמחים שבחרת ב-hOMER לניהול סוכנות הנדל"ן שלך: <b>${agencyName.trim()}</b>.</p>
                  <p>החשבון שלך נוצר בהצלחה וקיבלת <b>7 ימי ניסיון חינם</b> במסלול הפרימיום שלנו.</p>
                  <br/>
                  <a href="https://homer-crm.co.il" style="display:inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">היכנס למערכת</a>
                  <br/><br/>
                  <p>בהצלחה,<br/>צוות hOMER</p>
                </div>`
            });
        }
        catch (emailErr) {
            console.error('[createAgencyAccount] Email error:', emailErr);
        }
    }
    // 8. Non-blocking side effects: Google Sheets
    try {
        const sheetsPayload = JSON.stringify({
            type: 'new_registration',
            name: userName.trim(),
            phone: normalizedPhone,
            agencyName: agencyName.trim(),
            email,
            agencyId: agencyRef.id,
            timestamp: new Date().toISOString(),
        });
        await fetch(SHEETS_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: sheetsPayload,
        });
    }
    catch (sheetsErr) {
        console.warn('[createAgencyAccount] Sheets log failed:', sheetsErr);
    }
    return { success: true, agencyId: agencyRef.id };
});
//# sourceMappingURL=onboarding.js.map