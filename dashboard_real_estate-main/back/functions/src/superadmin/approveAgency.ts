import * as functions from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { Resend } from 'resend';

const resendApiKey = defineSecret('RESEND_API_KEY');

/**
 * superAdminApproveAgency
 *
 * Approves a pending agency registration:
 *   1. Sets agency status to 'active'.
 *   2. Sets all users in the agency to isActive: true, isRegistrationPending: false.
 *   3. Sends a welcome email to the agency admin.
 *
 * Strictly restricted to Super Admins.
 */
export const superAdminApproveAgency = functions.https.onCall(
    { cors: true, secrets: [resendApiKey] },
    async (request) => {
        // 1. Security: Strict Super Admin check
        if (!request.auth || request.auth.token.superAdmin !== true) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'You must be a Super Admin to perform this action.'
            );
        }

        const { agencyId } = request.data as { agencyId: string };

        if (!agencyId) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Missing required parameter: agencyId.'
            );
        }

        const db = getFirestore();
        const agencyRef = db.collection('agencies').doc(agencyId);

        // 2. Load agency data (to get info for the welcome email)
        const agencySnap = await agencyRef.get();
        if (!agencySnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Agency not found.');
        }
        const agencyData = agencySnap.data()!;

        // 3. Batch update: activate agency + all its users
        const batch = db.batch();
        batch.update(agencyRef, {
            status: 'active',
            approvedAt: FieldValue.serverTimestamp(),
        });

        const usersSnap = await db.collection('users').where('agencyId', '==', agencyId).get();
        let adminUser: { email: string; name: string } | null = null;

        usersSnap.forEach((userDoc) => {
            batch.update(userDoc.ref, {
                isActive: true,
                isRegistrationPending: false,
            });
            // Capture admin user data for the welcome email
            const userData = userDoc.data();
            if (userData.role === 'admin' && userData.email) {
                adminUser = { email: userData.email, name: userData.name || 'שלום' };
            }
        });

        await batch.commit();

        console.log(`[superAdminApproveAgency] Approved agency ${agencyId} with ${usersSnap.size} users.`);

        // 4. Send welcome email to the agency admin (non-blocking)
        const apiKey = resendApiKey.value();
        if (apiKey && adminUser) {
            try {
                const resend = new Resend(apiKey);
                const { email, name } = adminUser as { email: string; name: string };

                await resend.emails.send({
                    from: 'hOMER CRM <noreply@homer-crm.co.il>',
                    to: email,
                    subject: `🎉 ברוכים הבאים ל-hOMER! המשתמש שלך אושר`,
                    html: `
                    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8; color: #1e293b; max-width: 600px; margin: 0 auto;">
                      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); padding: 40px 32px; border-radius: 16px 16px 0 0; text-align: center;">
                        <h1 style="color: #38bdf8; font-size: 28px; margin: 0; letter-spacing: 2px;">hOMER CRM</h1>
                        <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">מערכת ניהול נדל"ן</p>
                      </div>
                      <div style="background: #f8fafc; padding: 40px 32px; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0; border-top: none;">
                        <h2 style="color: #0f172a; font-size: 22px;">שלום ${name}, המשתמש שלך אושר! 🎉</h2>
                        <p style="color: #475569; font-size: 16px;">
                          אנחנו שמחים לבשר לך שבקשת ההצטרפות שלך לסוכנות <b>"${agencyData.name}"</b> אושרה בהצלחה.
                        </p>
                        <p style="color: #475569;">
                          כעת יש לך גישה מלאה למערכת hOMER CRM. לחץ על הכפתור למטה כדי להתחבר ולהתחיל לעבוד:
                        </p>
                        <div style="text-align: center; margin: 32px 0;">
                          <a href="https://homer-crm.co.il/dashboard" 
                             style="display:inline-block; padding: 16px 40px; background: linear-gradient(135deg, #2563eb, #0ea5e9); color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 16px; letter-spacing: 0.5px; box-shadow: 0 4px 15px rgba(37,99,235,0.3);">
                            כניסה למערכת ←
                          </a>
                        </div>
                        <p style="color: #94a3b8; font-size: 13px; text-align: center; margin-top: 24px;">
                          בברכה, צוות hOMER CRM<br/>
                          <a href="mailto:hello@homer.management" style="color: #38bdf8;">hello@homer.management</a>
                        </p>
                      </div>
                    </div>`,
                });

                console.log(`[superAdminApproveAgency] Welcome email sent to ${email}`);
            } catch (emailErr) {
                console.error('[superAdminApproveAgency] Email error (non-fatal):', emailErr);
            }
        }

        return {
            success: true,
            message: `Agency ${agencyId} approved. ${usersSnap.size} users activated.`,
        };
    }
);
