import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { defineSecret } from 'firebase-functions/params';
import { Resend } from 'resend';

const resendApiKey = defineSecret('RESEND_API_KEY');
const db = getFirestore();

// Google Apps Script webhook — same URL used in LandingPage contact form
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbz2XVMpUrISGf6TwoHOb9LFw_Q5AuGVpd7ZEbJBf0V9681fpbjSB9BDrvEMUUqrdelu/exec';

/**
 * checkPhoneAvailable — Checks if a given phone number is already registered in the system.
 */
export const checkPhoneAvailable = onCall({ cors: true }, async (request) => {
    try {
        let { phone } = request.data as { phone?: string };
        if (!phone?.trim()) {
            throw new HttpsError('invalid-argument', 'phone is required.');
        }

        const phoneRef = db.collection('used_phones').doc(phone);
        const snap = await phoneRef.get();

        return { available: !snap.exists };
    } catch (error: any) {
        console.error('[checkPhoneAvailable] Error:', error);

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError('internal', 'שגיאה בבדיקת זמינות מספר הטלפון. אנא נסה שוב.');
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
export const createAgencyAccount = onCall({ cors: true, secrets: [resendApiKey] }, async (request) => {
    // 1. Auth Guard
    if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'You must be signed in to create an agency account.'
        );
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email ?? '';

    // 2. Input Validation
    const { agencyName, userName, phone, legalConsent, leadId } = request.data as {
        agencyName?: string;
        userName?: string;
        phone?: string;
        legalConsent?: { acceptedAt: string; version: string };
        leadId?: string;
    };

    if (!agencyName?.trim() || !userName?.trim() || !phone?.trim()) {
        throw new HttpsError(
            'invalid-argument',
            'agencyName, userName, and phone are all required.'
        );
    }

    // 2.1 Legal Consent Validation
    if (!legalConsent || !legalConsent.acceptedAt || !legalConsent.version) {
        throw new HttpsError(
            'invalid-argument',
            'Legal consent is mandatory for registration.'
        );
    }

    // 3. Phone verification via Firebase Auth (TEMPORARILY DISABLED)
    const normalizedPhone = phone.trim();
    /*
    const userRecord = await getAuth().getUser(uid);
    if (userRecord.phoneNumber !== normalizedPhone) {
        throw new HttpsError(
            'permission-denied',
            'אימות מספר הטלפון לא הושלם. אנא חזור לשלב אימות ה-SMS ונסה שוב.'
        );
    }
    */

    // 4. Duplicate Trial Check (outside transaction)
    const oldTrials = await db.collection('activeTrials')
        .where('uid', '==', uid)
        .limit(1)
        .get();

    if (!oldTrials.empty) {
        throw new HttpsError(
            'permission-denied',
            'You have already used your free trial on another agency account.'
        );
    }

    const agencyRef = db.collection('agencies').doc();
    const userRef = db.doc(`users/${uid}`);
    const trialRef = db.collection('activeTrials').doc();
    const phoneRef = db.collection('used_phones').doc(normalizedPhone);

    // 5. Set Custom User Claims before Firestore writes
    try {
        await getAuth().setCustomUserClaims(uid, {
            agencyId: agencyRef.id,
            role: 'admin',
        });
    } catch (claimsErr) {
        console.error('[createAgencyAccount] Failed to set custom claims:', claimsErr);
        throw new HttpsError('internal', 'Failed to set user permissions. Please try again.');
    }

    // 6. DB Transaction — Reads then Writes
    const trialEndsDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    try {
        await db.runTransaction(async (t) => {
            // Reads first
            const existingUser = await t.get(userRef);
            if (existingUser.exists) {
                throw new HttpsError('already-exists', 'User is already associated with an agency.');
            }

            const existingPhone = await t.get(phoneRef);
            if (existingPhone.exists) {
                throw new HttpsError('already-exists', 'This phone number is already registered to an agency.');
            }

            // Writes
            t.set(agencyRef, {
                name: agencyName.trim(),
                subscriptionTier: 'free',
                status: 'pending_approval',
                monthlyGoals: { commissions: 100000, deals: 5, leads: 20 },
                settings: {},
                legalConsent: {
                    acceptedBy: uid,
                    acceptedAt: legalConsent.acceptedAt,
                    version: legalConsent.version,
                    ipAddress: request.rawRequest?.ip || 'unknown'
                },
                billing: {
                    planId: 'free_trial',
                    status: 'trialing',
                    trialEndsAt: trialEndsDate,
                    ownerPhone: normalizedPhone,
                },
                createdAt: FieldValue.serverTimestamp(),
            });

            // Conversion trigger: mark lead as converted if exists
            if (leadId) {
                const leadRef = db.collection('leads').doc(leadId);
                t.update(leadRef, {
                    status: 'converted',
                    convertedToAgencyId: agencyRef.id,
                    convertedAt: FieldValue.serverTimestamp()
                });
            }

            t.set(userRef, {
                uid,
                email,
                name: userName.trim(),
                phone: normalizedPhone,
                agencyId: agencyRef.id,
                role: 'admin',
                isActive: false,
                isRegistrationPending: true,
                createdAt: FieldValue.serverTimestamp(),
            });

            t.set(trialRef, {
                agencyId: agencyRef.id,
                uid,
                trialEndsAt: trialEndsDate,
                status: 'active',
                createdAt: FieldValue.serverTimestamp(),
            });

            t.set(phoneRef, {
                uid,
                email,
                usedAt: FieldValue.serverTimestamp()
            });
        });
    } catch (txErr) {
        console.error('[createAgencyAccount] Transaction failed:', txErr);
        // Step 5 rollback — clear claims if DB write failed
        try {
            await getAuth().setCustomUserClaims(uid, {});
        } catch (cleanupErr) {
            console.error('[createAgencyAccount] Failed to clear stale claims:', uid, cleanupErr);
        }

        if (txErr instanceof HttpsError) {
            throw txErr;
        }
        throw new HttpsError('internal', 'Failed to create agency account. Please try again.');
    }

    // 7. Non-blocking side effects: Emails
    const apiKey = resendApiKey.value();
    if (apiKey) {
        try {
            const resend = new Resend(apiKey);
            const adminEmail = 'omerdigitalsolutions@gmail.com';

            // Admin notification: new pending registration
            await resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: adminEmail,
                subject: `🔔 בקשה חדשה להצטרפות: ${agencyName.trim()}`,
                html: `
                <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; color: #1e293b; max-width: 600px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
                    <h1 style="color: #38bdf8; font-size: 24px; margin: 0;">🔔 בקשת הצטרפות חדשה</h1>
                  </div>
                  <div style="background: #f8fafc; padding: 32px; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0; border-top: none;">
                    <p style="color: #475569; font-size: 16px;">סוכנות חדשה השלימה את תהליך ההרשמה וממתינה לאישורך.</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                      <tr style="background: #f1f5f9;"><td style="padding: 10px 14px; font-weight: bold; color: #64748b; width: 40%;">שם הסוכנות</td><td style="padding: 10px 14px; color: #0f172a; font-weight: 600;">${agencyName.trim()}</td></tr>
                      <tr><td style="padding: 10px 14px; font-weight: bold; color: #64748b;">שם המנהל</td><td style="padding: 10px 14px; color: #0f172a;">${userName.trim()}</td></tr>
                      <tr style="background: #f1f5f9;"><td style="padding: 10px 14px; font-weight: bold; color: #64748b;">אימייל</td><td style="padding: 10px 14px; color: #0f172a;">${email}</td></tr>
                      <tr><td style="padding: 10px 14px; font-weight: bold; color: #64748b;">טלפון</td><td style="padding: 10px 14px; color: #0f172a;">${normalizedPhone}</td></tr>
                      <tr style="background: #f1f5f9;"><td style="padding: 10px 14px; font-weight: bold; color: #64748b;">זמן הרשמה</td><td style="padding: 10px 14px; color: #0f172a;">${new Date().toLocaleString('he-IL')}</td></tr>
                      <tr><td style="padding: 10px 14px; font-weight: bold; color: #64748b;">Agency ID</td><td style="padding: 10px 14px; font-family: monospace; color: #6366f1;">${agencyRef.id}</td></tr>
                    </table>
                    <div style="text-align: center; margin-top: 24px;">
                      <a href="https://homer-crm.co.il/dashboard/super-admin"
                         style="display:inline-block; padding: 14px 36px; background: linear-gradient(135deg, #2563eb, #0ea5e9); color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 15px;">
                        אשר את הסוכנות בדאשבורד ←
                      </a>
                    </div>
                  </div>
                </div>`
            });
            // Note: Welcome email to user is sent later via superAdminApproveAgency when admin approves.
        } catch (emailErr) {
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
    } catch (sheetsErr) {
        console.warn('[createAgencyAccount] Sheets log failed:', sheetsErr);
    }

    return { success: true, agencyId: agencyRef.id };
});

/**
 * captureLead — Records initial onboarding data (Step 0) for lead management.
 * Returns a leadId to be used in createAgencyAccount.
 * This is publicly accessible to allow "immediate save" before auth.
 */
export const captureLead = onCall({ cors: true }, async (request) => {
    try {
        const { name, email, phone } = request.data as {
            name?: string;
            email?: string;
            phone?: string;
        };

        if (!name?.trim() || !phone?.trim()) {
            throw new HttpsError('invalid-argument', 'name and phone are required for lead capture.');
        }

        const leadRef = db.collection('leads').doc();
        const leadData = {
            name: name.trim(),
            email: email?.trim() || '',
            phone: phone.trim(),
            source: 'onboarding_step_0',
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            ipAddress: request.rawRequest?.ip || 'unknown'
        };

        await leadRef.set(leadData);

        return { leadId: leadRef.id };
    } catch (error: any) {
        console.error('[captureLead] Error:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'שגיאה בשמירת פרטי הליד. אנא נסה שוב.');
    }
});

