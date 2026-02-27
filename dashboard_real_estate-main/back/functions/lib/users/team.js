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
exports.completeAgentSetup = exports.getInviteInfo = exports.inviteAgent = exports.deleteAgent = exports.toggleAgentStatus = exports.updateAgentRole = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const nodemailer = __importStar(require("nodemailer"));
const db = (0, firestore_1.getFirestore)();
// ─── Email Transporter ────────────────────────────────────────────────────────
// Gmail App Password is stored in process.env to avoid hard-coding credentials.
// Set via: firebase functions:secrets:set GMAIL_APP_PASSWORD (Google Secret Manager)
// Or add to your .env.local for local emulator testing.
function getTransporter() {
    const appPassword = process.env.GMAIL_APP_PASSWORD;
    if (!appPassword) {
        console.warn('[team.ts] GMAIL_APP_PASSWORD not set — email will not be sent.');
        return null;
    }
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'omerdigitalsolutions@gmail.com',
            pass: appPassword,
        },
    });
}
/**
 * updateAgentRole — Changes the role of a team member.
 *
 * Security:
 *   - Caller must be authenticated and have role === 'admin'.
 *   - Target user must be in the same agency as the caller.
 *
 * Input:  { userId: string, newRole: 'admin' | 'agent' }
 * Output: { success: true }
 */
exports.updateAgentRole = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in.');
    }
    const { userId, newRole } = request.data;
    if (!(userId === null || userId === void 0 ? void 0 : userId.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'userId is required.');
    }
    if (newRole !== 'admin' && newRole !== 'agent') {
        throw new https_1.HttpsError('invalid-argument', 'newRole must be admin or agent.');
    }
    // ── Verify caller is admin ───────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Caller user document not found.');
    }
    const caller = callerDoc.data();
    if (caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can change roles.');
    }
    if (caller.isActive === false) {
        throw new https_1.HttpsError('permission-denied', 'Suspended accounts cannot perform this action.');
    }
    // ── Verify target belongs to same agency ────────────────────────────────────
    const targetDoc = await db.doc(`users/${userId.trim()}`).get();
    if (!targetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Target user not found.');
    }
    const target = targetDoc.data();
    if (target.agencyId !== caller.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'Cannot modify users in a different agency.');
    }
    await db.doc(`users/${userId.trim()}`).update({ role: newRole });
    // Sync the new role to the user's Custom Claims
    await (0, auth_1.getAuth)().setCustomUserClaims(userId.trim(), { agencyId: target.agencyId, role: newRole });
    return { success: true };
});
/**
 * toggleAgentStatus — Suspends or reactivates a team member.
 *
 * Security:
 *   - Caller must be authenticated and have role === 'admin'.
 *   - Caller cannot suspend themselves.
 *   - Target user must be in the same agency.
 *
 * Input:  { userId: string, isActive: boolean }
 * Output: { success: true }
 */
exports.toggleAgentStatus = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in.');
    }
    const { userId, isActive } = request.data;
    if (!(userId === null || userId === void 0 ? void 0 : userId.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'userId is required.');
    }
    if (typeof isActive !== 'boolean') {
        throw new https_1.HttpsError('invalid-argument', 'isActive must be a boolean.');
    }
    // ── Prevent self-suspension ──────────────────────────────────────────────────
    if (request.auth.uid === userId.trim()) {
        throw new https_1.HttpsError('permission-denied', 'You cannot change your own active status.');
    }
    // ── Verify caller is admin ───────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Caller user document not found.');
    }
    const caller = callerDoc.data();
    if (caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can change agent status.');
    }
    if (caller.isActive === false) {
        throw new https_1.HttpsError('permission-denied', 'Suspended accounts cannot perform this action.');
    }
    // ── Verify target belongs to same agency ────────────────────────────────────
    const targetDoc = await db.doc(`users/${userId.trim()}`).get();
    if (!targetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Target user not found.');
    }
    const target = targetDoc.data();
    if (target.agencyId !== caller.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'Cannot modify users in a different agency.');
    }
    await db.doc(`users/${userId.trim()}`).update({ isActive });
    return { success: true };
});
/**
 * deleteAgent — Permanently removes a team member's Firestore document.
 *
 * Security:
 *   - Caller must be authenticated and have role === 'admin'.
 *   - Caller cannot delete themselves.
 *   - Target user must be in the same agency.
 *
 * Input:  { userId: string }
 * Output: { success: true }
 */
exports.deleteAgent = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in.');
    }
    const { userId } = request.data;
    if (!(userId === null || userId === void 0 ? void 0 : userId.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'userId is required.');
    }
    // ── Prevent self-deletion ────────────────────────────────────────────────────
    if (request.auth.uid === userId.trim()) {
        throw new https_1.HttpsError('permission-denied', 'You cannot delete yourself.');
    }
    // ── Verify caller is admin ───────────────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Caller user document not found.');
    }
    const caller = callerDoc.data();
    if (caller.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can delete agents.');
    }
    if (caller.isActive === false) {
        throw new https_1.HttpsError('permission-denied', 'Suspended accounts cannot perform this action.');
    }
    // ── Verify target belongs to same agency ────────────────────────────────────
    const targetDoc = await db.doc(`users/${userId.trim()}`).get();
    if (!targetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Target user not found.');
    }
    const target = targetDoc.data();
    if (target.agencyId !== caller.agencyId) {
        throw new https_1.HttpsError('permission-denied', 'Cannot modify users in a different agency.');
    }
    // ── DELETE ──────────────────────────────────────────────────────────────────
    await db.doc(`users/${userId.trim()}`).delete();
    // If the user was already linked to an Auth account, we *could* delete it here,
    // but usually it's better to just remove their access via Custom Claims or 
    // just Firestore doc deletion which is checked by security rules. 
    // For now, simple Firestore deletion satisfies the requirement.
    return { success: true };
});
// ─── HTML Email Template ──────────────────────────────────────────────────────
function buildInviteEmail(agentName, agencyName, joinLink) {
    return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>הזמנה להצטרף ל${agencyName}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:40px 40px 32px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <span style="font-size:28px;">🏠</span>
              </div>
              <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">הוזמנת להצטרף!</h1>
              <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">${agencyName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="color:#1e293b;font-size:16px;margin:0 0 8px;">שלום ${agentName},</p>
              <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 28px;">
                הוזמנת להצטרף ל<strong>${agencyName}</strong> כסוכן נדל"ן.<br/>
                לחץ על הכפתור למטה, התחבר עם חשבון Google שלך, ותוכל להתחיל לעבוד!
              </p>
              <div style="text-align:center;margin-bottom:32px;">
                <a href="${joinLink}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
                  הצטרף עכשיו →
                </a>
              </div>
              <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">
                אם הכפתור לא עובד, העתק את הקישור הבא לדפדפן שלך:<br/>
                <a href="${joinLink}" style="color:#3b82f6;word-break:break-all;">${joinLink}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="color:#94a3b8;font-size:11px;margin:0;">הודעה זו נשלחה על ידי מערכת הניהול של ${agencyName} • Powered by Omer Digital Solutions</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
/**
 * inviteAgent — Creates a stub user document for a future team member,
 * sends an invite email via Gmail SMTP, and optionally returns a WhatsApp URL.
 *
 * Security:
 *   - Caller must be authenticated.
 *   - Caller must have role === 'admin' in Firestore.
 *
 * Input:  { email: string, name: string, role: 'admin' | 'agent', phone?: string, appUrl?: string }
 * Output: { success: true, stubId: string, whatsappUrl?: string }
 */
exports.inviteAgent = (0, https_1.onCall)(async (request) => {
    var _a;
    // ── Auth Guard ──────────────────────────────────────────────────────────────
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to invite agents.');
    }
    // ── Input Validation ────────────────────────────────────────────────────────
    const { email, name, role, phone, appUrl } = request.data;
    if (!(email === null || email === void 0 ? void 0 : email.trim()) || !(name === null || name === void 0 ? void 0 : name.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'email and name are required.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new https_1.HttpsError('invalid-argument', 'email is invalid.');
    }
    const normalizedRole = role === 'admin' ? 'admin' : 'agent';
    // ── RBAC: Verify caller is an admin ─────────────────────────────────────────
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Caller user document not found.');
    }
    const callerData = callerDoc.data();
    if (callerData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can invite new team members.');
    }
    if (callerData.isActive === false) {
        throw new https_1.HttpsError('permission-denied', 'Suspended accounts cannot perform this action.');
    }
    // ── Prevent duplicate stubs for same email in same agency ───────────────────
    const existingSnap = await db
        .collection('users')
        .where('email', '==', email.trim().toLowerCase())
        .where('agencyId', '==', callerData.agencyId)
        .limit(1)
        .get();
    if (!existingSnap.empty) {
        throw new https_1.HttpsError('already-exists', `A user with email ${email} already exists in this agency.`);
    }
    // ── Read Agency Name ─────────────────────────────────────────────────────────
    const agencyDoc = await db.doc(`agencies/${callerData.agencyId}`).get();
    const agencyName = ((_a = agencyDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'הסוכנות שלנו';
    // ── Create Stub Document ─────────────────────────────────────────────────────
    const stubRef = await db.collection('users').add({
        uid: null, // linked when the agent first signs in
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: normalizedRole,
        agencyId: callerData.agencyId,
        phone: (phone === null || phone === void 0 ? void 0 : phone.trim()) || null,
        isActive: true,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const stubId = stubRef.id;
    // ── Compute Join URL ─────────────────────────────────────────────────────────
    const baseUrl = (appUrl === null || appUrl === void 0 ? void 0 : appUrl.trim())
        ? appUrl.trim().replace(/\/$/, '')
        : 'https://your-app.web.app'; // fallback — frontend passes real origin
    const joinLink = `${baseUrl}/join?token=${stubId}`;
    // ── Send Invite Email ────────────────────────────────────────────────────────
    const transporter = getTransporter();
    if (transporter) {
        try {
            await transporter.sendMail({
                from: `"${agencyName} — מערכת ניהול" <omerdigitalsolutions@gmail.com>`,
                to: email.trim().toLowerCase(),
                subject: `הוזמנת להצטרף ל${agencyName} 🏠`,
                html: buildInviteEmail(name.trim(), agencyName, joinLink),
            });
            console.log(`[inviteAgent] Invite email sent to ${email}`);
        }
        catch (mailErr) {
            // Don't fail the whole call if only email delivery fails — stub is already created
            console.error('[inviteAgent] Failed to send invite email:', mailErr);
        }
    }
    // ── Build WhatsApp URL (if phone provided) ───────────────────────────────────
    let whatsappUrl;
    if (phone === null || phone === void 0 ? void 0 : phone.trim()) {
        // Strip non-digits and ensure international format (Israel: add 972 prefix)
        const digits = phone.trim().replace(/\D/g, '');
        const intl = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
        const msg = encodeURIComponent(`שלום ${name.trim()}! 👋\nהוזמנת להצטרף ל${agencyName} כסוכן נדל"ן.\nלחץ על הקישור כדי להצטרף: ${joinLink}`);
        whatsappUrl = `https://wa.me/${intl}?text=${msg}`;
    }
    return { success: true, stubId, whatsappUrl };
});
/**
 * getInviteInfo — Public (no-auth) function to fetch invite details from a stub ID.
 * Called by the /join page to display the agency name before login.
 *
 * Input:  { token: string }   (token === Firestore stub document ID)
 * Output: { agencyName: string, agentName: string, email: string }
 */
exports.getInviteInfo = (0, https_1.onCall)(async (request) => {
    var _a;
    const { token } = request.data;
    if (!(token === null || token === void 0 ? void 0 : token.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'token is required.');
    }
    const stubDoc = await db.doc(`users/${token.trim()}`).get();
    if (!stubDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Invite token not found or already used.');
    }
    const stub = stubDoc.data();
    // Don't expose invite if already linked (already joined)
    if (stub.uid) {
        throw new https_1.HttpsError('already-exists', 'This invite has already been used.');
    }
    // Fetch agency name
    const agencyDoc = await db.doc(`agencies/${stub.agencyId}`).get();
    const agencyName = ((_a = agencyDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'הסוכנות';
    return {
        agencyName,
        agentName: stub.name,
        // email intentionally omitted — client has it from Google Auth
    };
});
/**
 * completeAgentSetup — Lets a newly-linked agent save their name and phone.
 *
 * Called from the /agent-setup page after the stub has been linked to the
 * agent's Firebase UID.
 *
 * Security:
 *   - Caller must be authenticated.
 *   - The stub document at `token` must already have `uid === request.auth.uid`
 *     (linking happens client-side before this function is called).
 *
 * Input:  { token: string, name?: string, phone?: string }
 * Output: { success: true }
 */
exports.completeAgentSetup = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in.');
    }
    const { token, name, phone } = request.data;
    if (!(token === null || token === void 0 ? void 0 : token.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'token is required.');
    }
    const stubRef = db.doc(`users/${token.trim()}`);
    const stubDoc = await stubRef.get();
    if (!stubDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Invite token not found.');
    }
    const stub = stubDoc.data();
    // Ensure the caller is the linked agent
    if (stub.uid !== request.auth.uid) {
        throw new https_1.HttpsError('permission-denied', 'This token is not linked to your account.');
    }
    // Build update payload — only include provided fields
    const update = {};
    if (name === null || name === void 0 ? void 0 : name.trim())
        update.name = name.trim();
    if (phone === null || phone === void 0 ? void 0 : phone.trim())
        update.phone = phone.trim();
    if (Object.keys(update).length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'At least name or phone must be provided.');
    }
    await stubRef.update(update);
    // Set the actual custom claims on the linked user token
    await (0, auth_1.getAuth)().setCustomUserClaims(request.auth.uid, { agencyId: stub.agencyId, role: stub.role });
    return { success: true };
});
//# sourceMappingURL=team.js.map