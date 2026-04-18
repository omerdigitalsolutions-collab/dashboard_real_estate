"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimInviteToken = exports.sendAgentInvite = exports.joinWithCode = exports.saveAgencyJoinCode = exports.generateAgencyJoinCode = exports.addAgentManually = exports.completeAgentSetup = exports.getInviteInfo = exports.inviteAgent = exports.deleteAgent = exports.toggleAgentStatus = exports.updateAgentRole = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
const authGuard_1 = require("../config/authGuard");
const crypto_1 = require("crypto");
const resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
const db = (0, firestore_1.getFirestore)();
// ── Cryptographically secure token generation ──────────────────────────────────
// Uses Node's crypto module instead of Math.random() to produce
// 24 bytes of randomness → 48-char hex string (entropy: ~144 bits).
const generateToken = () => (0, crypto_1.randomBytes)(24).toString('hex');
const generateRandomSuffix = (length = 5) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, 0, I, 1 to avoid confusion
    const bytes = (0, crypto_1.randomBytes)(length);
    return Array.from(bytes)
        .map(b => chars[b % chars.length])
        .join('');
};
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
exports.updateAgentRole = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { userId, newRole } = request.data;
    if (!(userId === null || userId === void 0 ? void 0 : userId.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'userId is required.');
    }
    if (newRole !== 'admin' && newRole !== 'agent') {
        throw new https_1.HttpsError('invalid-argument', 'newRole must be admin or agent.');
    }
    // ── Verify caller is admin ───────────────────────────────────────────────────
    if (authData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can change roles.');
    }
    // ── Verify target belongs to same agency ────────────────────────────────────
    const targetDoc = await db.doc(`users/${userId.trim()}`).get();
    if (!targetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Target user not found.');
    }
    const target = targetDoc.data();
    if (target.agencyId !== authData.agencyId) {
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
exports.toggleAgentStatus = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { userId, isActive } = request.data;
    if (!(userId === null || userId === void 0 ? void 0 : userId.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'userId is required.');
    }
    if (typeof isActive !== 'boolean') {
        throw new https_1.HttpsError('invalid-argument', 'isActive must be a boolean.');
    }
    // ── Prevent self-suspension ──────────────────────────────────────────────────
    if (authData.uid === userId.trim()) {
        throw new https_1.HttpsError('permission-denied', 'You cannot change your own active status.');
    }
    // ── Verify caller is admin ───────────────────────────────────────────────────
    if (authData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can change agent status.');
    }
    // ── Verify target belongs to same agency ────────────────────────────────────
    const targetDoc = await db.doc(`users/${userId.trim()}`).get();
    if (!targetDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Target user not found.');
    }
    const target = targetDoc.data();
    if (target.agencyId !== authData.agencyId) {
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
exports.deleteAgent = (0, https_1.onCall)({ cors: true }, async (request) => {
    console.log('[deleteAgent] Invoked with data:', request.data);
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    console.log('[deleteAgent] Caller authenticated:', authData);
    const { userId } = request.data;
    if (!(userId === null || userId === void 0 ? void 0 : userId.trim())) {
        console.log('[deleteAgent] Missing userId');
        throw new https_1.HttpsError('invalid-argument', 'userId is required.');
    }
    // ── Prevent self-deletion ────────────────────────────────────────────────────
    if (authData.uid === userId.trim()) {
        console.log('[deleteAgent] Self deletion attempt');
        throw new https_1.HttpsError('permission-denied', 'You cannot delete yourself.');
    }
    // ── Verify caller is admin ───────────────────────────────────────────────────
    if (authData.role !== 'admin') {
        console.log(`[deleteAgent] Caller is not admin. Role: ${authData.role}`);
        throw new https_1.HttpsError('permission-denied', 'Only admins can delete agents.');
    }
    // ── Verify target belongs to same agency ────────────────────────────────────
    const targetDoc = await db.doc(`users/${userId.trim()}`).get();
    if (!targetDoc.exists) {
        console.log(`[deleteAgent] Target doc does not exist: users/${userId.trim()}`);
        throw new https_1.HttpsError('not-found', 'Target user not found.');
    }
    const target = targetDoc.data();
    console.log(`[deleteAgent] Target user agencyId: ${target.agencyId}, Caller agencyId: ${authData.agencyId}`);
    if (target.agencyId !== authData.agencyId) {
        console.log('[deleteAgent] Agency mismatch!');
        throw new https_1.HttpsError('permission-denied', 'Cannot modify users in a different agency.');
    }
    // ── DELETE ──────────────────────────────────────────────────────────────────
    console.log(`[deleteAgent] Proceeding to delete user doc: ${userId.trim()}`);
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
exports.inviteAgent = (0, https_1.onCall)({ secrets: [resendApiKey], cors: true }, async (request) => {
    var _a;
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    // ── Input Validation ────────────────────────────────────────────────────────
    const { email, name, role, phone, appUrl } = request.data;
    let normalizedEmail = null;
    if (email === null || email === void 0 ? void 0 : email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const candidate = email.trim().toLowerCase();
        if (!emailRegex.test(candidate)) {
            throw new https_1.HttpsError('invalid-argument', 'email is invalid.');
        }
        normalizedEmail = candidate;
    }
    const derivedName = (name === null || name === void 0 ? void 0 : name.trim()) || (normalizedEmail ? normalizedEmail.split('@')[0] : 'סוכן חדש');
    const normalizedRole = role === 'admin' ? 'admin' : 'agent';
    // ── RBAC: Verify caller is an admin ─────────────────────────────────────────
    if (authData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can invite new team members.');
    }
    // ── Read Agency Name ─────────────────────────────────────────────────────────
    const agencyDoc = await db.doc(`agencies/${authData.agencyId}`).get();
    const agencyName = ((_a = agencyDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'הסוכנות שלנו';
    // ── Global Check: Prevent inviting already active users (only if email provided) ──
    const inviteToken = generateToken();
    let stubId;
    if (normalizedEmail) {
        const existingSnap = await db
            .collection('users')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();
        if (!existingSnap.empty) {
            const existingDoc = existingSnap.docs[0];
            const existingData = existingDoc.data();
            if (existingData.uid) {
                throw new https_1.HttpsError('already-exists', 'המשתמש הזה כבר רשום במערכת.');
            }
            // User exists but has no UID -> It's a stub, we can repurpose/update it
            await existingDoc.ref.update({
                inviteToken,
                agencyId: authData.agencyId,
                role: normalizedRole,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
            stubId = existingDoc.id;
        }
        else {
            const stubRef = await db.collection('users').add({
                uid: null,
                email: normalizedEmail,
                name: derivedName,
                role: normalizedRole,
                agencyId: authData.agencyId,
                phone: (phone === null || phone === void 0 ? void 0 : phone.trim()) || null,
                isActive: true,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                inviteToken,
            });
            stubId = stubRef.id;
        }
    }
    else {
        // ── Create Stub Document without email ───────────────────────────────────────
        const stubRef = await db.collection('users').add({
            uid: null,
            email: null,
            name: derivedName,
            role: normalizedRole,
            agencyId: authData.agencyId,
            phone: (phone === null || phone === void 0 ? void 0 : phone.trim()) || null,
            isActive: true,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            inviteToken,
        });
        stubId = stubRef.id;
    }
    // ── Compute Join URL ─────────────────────────────────────────────────────────
    const baseUrl = 'https://homer.management';
    const joinLink = `${baseUrl}/join?token=${inviteToken}`;
    // ── Send Invite Email (only if email provided) ───────────────────────────────
    if (normalizedEmail) {
        const apiKey = resendApiKey.value();
        if (apiKey) {
            const resend = new resend_1.Resend(apiKey);
            try {
                await resend.emails.send({
                    from: 'hello@homer.management',
                    to: [normalizedEmail],
                    subject: `🏠 הזמנה להצטרף לסוכנות נדל״ן ${agencyName} 🏠`,
                    html: buildInviteEmail(derivedName, agencyName, joinLink),
                });
                console.log(`[inviteAgent] Invite email sent to ${normalizedEmail} via Resend`);
            }
            catch (mailErr) {
                console.error('[inviteAgent] Failed to send invite email:', mailErr);
            }
        }
        else {
            console.warn('[inviteAgent] RESEND_API_KEY not set — email will not be sent.');
        }
    }
    // ── Build WhatsApp & SMS URLs (if phone provided) ────────────────────────────
    let whatsappUrl;
    let smsUrl;
    if (phone === null || phone === void 0 ? void 0 : phone.trim()) {
        const digits = phone.trim().replace(/\D/g, '');
        const intl = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
        const msgText = `שלום ${derivedName}! 👋\nהוזמנת להצטרף ל${agencyName} כסוכן נדל"ן.\nלחץ על הקישור כדי להצטרף: ${joinLink}`;
        whatsappUrl = `https://wa.me/${intl}?text=${encodeURIComponent(msgText)}`;
        smsUrl = `sms:+${intl}?body=${encodeURIComponent(msgText)}`;
    }
    return { success: true, stubId, inviteToken, whatsappUrl, smsUrl };
});
/**
 * getInviteInfo — Public (no-auth) function to fetch invite details from a stub ID.
 * Called by the /join page to display the agency name before login.
 *
 * Input:  { token: string }   (token === Firestore stub document ID)
 * Output: { agencyName: string, agentName: string, email: string }
 */
exports.getInviteInfo = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    console.log('[getInviteInfo] Invoked with data:', request.data);
    const { token } = request.data;
    if (!(token === null || token === void 0 ? void 0 : token.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'token is required.');
    }
    let stubsSnap = await db.collection('users')
        .where('inviteToken', '==', token.trim())
        .limit(1)
        .get();
    let stubDoc = !stubsSnap.empty ? stubsSnap.docs[0] : null;
    // Fallback for legacy invitations (token was docId)
    if (!stubDoc && token.trim().length >= 20) {
        const legacyDoc = await db.collection('users').doc(token.trim()).get();
        const legacyData = legacyDoc.data();
        if (legacyDoc.exists && !(legacyData === null || legacyData === void 0 ? void 0 : legacyData.inviteToken)) {
            stubDoc = legacyDoc;
        }
    }
    if (!stubDoc) {
        throw new https_1.HttpsError('not-found', 'Invite token not found or already used.');
    }
    const stub = stubDoc.data();
    // Don't expose invite if already linked (already joined)
    if (stub.uid) {
        throw new https_1.HttpsError('already-exists', 'This invite has already been used.');
    }
    // Fetch agency name and logo
    const agencyDoc = await db.doc(`agencies/${stub.agencyId}`).get();
    const agencyData = agencyDoc.data();
    const agencyName = (agencyData === null || agencyData === void 0 ? void 0 : agencyData.agencyName) || (agencyData === null || agencyData === void 0 ? void 0 : agencyData.name) || 'הסוכנות שלנו';
    const logoUrl = ((_a = agencyData === null || agencyData === void 0 ? void 0 : agencyData.settings) === null || _a === void 0 ? void 0 : _a.logoUrl) || null;
    return {
        agencyName,
        agentName: stub.name,
        logoUrl,
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
exports.completeAgentSetup = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in.');
    }
    const { token, name, phone } = request.data;
    if (!(token === null || token === void 0 ? void 0 : token.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'token is required.');
    }
    const userUid = request.auth.uid;
    const userRef = db.collection('users').doc(userUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        throw new https_1.HttpsError('not-found', 'User record not found. Please log in again.');
    }
    const userData = userSnap.data();
    // Verify token matches if provided
    if (userData.inviteToken !== token.trim()) {
        throw new https_1.HttpsError('permission-denied', 'Invalid invitation token for this account.');
    }
    const stubRef = userRef;
    const stub = userData;
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
/**
 * addAgentManually — Creates a stub user document without sending an email.
 * Returns the stub ID so the admin can generate a join link manually.
 *
 * Input:  { name: string, role: 'admin' | 'agent', phone?: string }
 * Output: { success: true, stubId: string }
 */
exports.addAgentManually = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    if (authData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can add team members.');
    }
    const { name, role, phone } = request.data;
    if (!(name === null || name === void 0 ? void 0 : name.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'name is required.');
    }
    const normalizedRole = role === 'admin' ? 'admin' : 'agent';
    const stubRef = await db.collection('users').add({
        uid: null,
        email: null, // Manually added users might not have email set yet
        name: name.trim(),
        role: normalizedRole,
        agencyId: authData.agencyId,
        phone: (phone === null || phone === void 0 ? void 0 : phone.trim()) || null,
        isActive: true,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        inviteToken: generateToken(),
    });
    const stubDoc = await stubRef.get();
    const inviteToken = (_a = stubDoc.data()) === null || _a === void 0 ? void 0 : _a.inviteToken;
    return { success: true, stubId: stubRef.id, inviteToken };
});
/**
 * generateAgencyJoinCode — Generates a unique join code for an agency.
 * Pattern: [AGENCY_NAME_PREFIX]-[5_CHARS]
 *
 * Input: { agencyId: string }
 * Output: { joinCode: string }
 */
exports.generateAgencyJoinCode = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    if (authData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can generate join codes.');
    }
    const agencyDoc = await db.doc(`agencies/${authData.agencyId}`).get();
    if (!agencyDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Agency not found.');
    }
    const agencyData = agencyDoc.data();
    const name = agencyData.agencyName || agencyData.name || 'AGENCY';
    // Create a safe prefix: Uppercase, alphanumeric only, max 10 chars.
    // Hebrew (and other non-Latin) names will produce an empty string after stripping,
    // so we fall back to a generic prefix in that case.
    const rawPrefix = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove Latin accents
        .replace(/[^a-zA-Z0-9]/g, '') // Remove non-alphanumeric (incl. Hebrew)
        .toUpperCase()
        .substring(0, 10);
    // For Hebrew/non-Latin names rawPrefix is empty — fall back to the first 5 chars
    // of the agencyId (always alphanumeric), which is unique per agency.
    const prefix = rawPrefix.length > 0
        ? rawPrefix
        : authData.agencyId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 5);
    let attempts = 0;
    let finalCode = '';
    while (attempts < 5) {
        const candidate = `${prefix}${generateRandomSuffix()}`;
        const check = await db.collection('joinCodes').doc(candidate).get();
        if (!check.exists) {
            finalCode = candidate;
            break;
        }
        attempts++;
    }
    if (!finalCode) {
        throw new https_1.HttpsError('internal', 'Failed to generate a unique code after multiple attempts.');
    }
    return { joinCode: finalCode };
});
/**
 * saveAgencyJoinCode — Transactionally saves a join code for an agency.
 * Ensures the code is unique and removes any previous code for this agency.
 *
 * Input: { joinCode: string, isEnabled: boolean }
 * Output: { success: true }
 */
exports.saveAgencyJoinCode = (0, https_1.onCall)({ cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    if (authData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can set join codes.');
    }
    const { joinCode, isEnabled } = request.data;
    if (!joinCode || joinCode.trim().length < 4) {
        throw new https_1.HttpsError('invalid-argument', 'Join code must be at least 4 characters.');
    }
    const normalizedCode = joinCode.trim().toUpperCase();
    const agencyRef = db.doc(`agencies/${authData.agencyId}`);
    await db.runTransaction(async (transaction) => {
        const agencySnap = await transaction.get(agencyRef);
        if (!agencySnap.exists)
            throw new https_1.HttpsError('not-found', 'Agency not found.');
        const currentData = agencySnap.data();
        const previousCode = currentData.joinCode;
        // 1. If code is changing, check uniqueness of the NEW code
        if (previousCode !== normalizedCode) {
            const codeRef = db.collection('joinCodes').doc(normalizedCode);
            const codeSnap = await transaction.get(codeRef);
            if (codeSnap.exists) {
                throw new https_1.HttpsError('already-exists', 'This join code is already taken by another agency.');
            }
            // 2. Delete old code mapping if it exists
            if (previousCode) {
                transaction.delete(db.collection('joinCodes').doc(previousCode));
            }
            // 3. Create new code mapping
            transaction.set(db.collection('joinCodes').doc(normalizedCode), {
                agencyId: authData.agencyId,
                createdAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        // 4. Update agency document
        transaction.update(agencyRef, {
            joinCode: normalizedCode,
            isJoinCodeEnabled: isEnabled !== null && isEnabled !== void 0 ? isEnabled : true
        });
    });
    return { success: true };
});
/**
 * joinWithCode — Public function for agents to join via code.
 * Creates a stub user if validation passes.
 *
 * Input: { email: string, joinCode: string }
 * Output: { success: true, inviteToken: string }
 */
exports.joinWithCode = (0, https_1.onCall)({ cors: true }, async (request) => {
    // Auth required — prevents anyone from registering arbitrary emails as stubs
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be signed in to join with a code.');
    }
    const { joinCode } = request.data;
    // Use the verified email from the Firebase Auth token — do NOT trust client-provided email
    const email = request.auth.token.email;
    if (!email || !(joinCode === null || joinCode === void 0 ? void 0 : joinCode.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'Join code is required and account must have an email.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = joinCode.trim().toUpperCase();
    // 0. Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid email address.');
    }
    // 0b. Abuse prevention: rate-limit per email (max 5 attempts per 10 min)
    const rateLimitRef = db.collection('_rate_limits').doc(`joinCode_${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`);
    const rateLimitSnap = await rateLimitRef.get();
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes
    if (rateLimitSnap.exists) {
        const rl = rateLimitSnap.data();
        if (now - rl.firstAttemptMs < windowMs && rl.count >= 5) {
            throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please wait 10 minutes before trying again.');
        }
        if (now - rl.firstAttemptMs >= windowMs) {
            await rateLimitRef.set({ count: 1, firstAttemptMs: now });
        }
        else {
            await rateLimitRef.update({ count: rl.count + 1 });
        }
    }
    else {
        await rateLimitRef.set({ count: 1, firstAttemptMs: now });
    }
    // 1. Validate Code
    const codeSnap = await db.collection('joinCodes').doc(normalizedCode).get();
    if (!codeSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Invalid join code.');
    }
    const { agencyId } = codeSnap.data();
    // 2. Verify Agency status
    const agencySnap = await db.doc(`agencies/${agencyId}`).get();
    const agencyData = agencySnap.data();
    if (agencyData.isJoinCodeEnabled === false) {
        throw new https_1.HttpsError('failed-precondition', 'Joining via code is currently disabled for this agency.');
    }
    if (agencyData.isActive === false) {
        throw new https_1.HttpsError('failed-precondition', 'This agency is currently inactive.');
    }
    // 3. Check for existing active user
    const userSnap = await db.collection('users')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();
    if (!userSnap.empty) {
        const existing = userSnap.docs[0].data();
        if (existing.uid) {
            throw new https_1.HttpsError('already-exists', 'A user with this email is already registered. Please log in directly.');
        }
        // If it's a stub, we can potentially reuse it or update it. 
        // For now, let's update it to the new agency if they are joining via a specific code.
        const stubRef = userSnap.docs[0].ref;
        const inviteToken = generateToken();
        await stubRef.update({
            agencyId,
            role: 'agent',
            inviteToken,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        return { success: true, inviteToken };
    }
    // 4. Create new stub
    const inviteToken = generateToken();
    await db.collection('users').add({
        uid: null,
        email: normalizedEmail,
        name: normalizedEmail.split('@')[0], // Default name from email prefix
        role: 'agent',
        agencyId,
        isActive: true,
        inviteToken,
        createdAt: firestore_1.FieldValue.serverTimestamp()
    });
    return { success: true, inviteToken };
});
/**
 * sendAgentInvite — Specific function for sending a dedicated invitation email.
 * This is called from the "Invite by Email" button on the agents page.
 *
 * Security:
 *   - Caller must be authenticated.
 *   - Caller must have role === 'admin'.
 *
 * Input: { email: string }
 * Output: { success: true, message: string }
 */
exports.sendAgentInvite = (0, https_1.onCall)({ secrets: [resendApiKey], cors: true }, async (request) => {
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const { email } = request.data;
    if (!(email === null || email === void 0 ? void 0 : email.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'email is required.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'email is invalid.');
    }
    if (authData.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admins can invite new team members.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    // Check for existing user in same agency
    const existingSnap = await db
        .collection('users')
        .where('email', '==', normalizedEmail)
        .where('agencyId', '==', authData.agencyId)
        .limit(1)
        .get();
    if (!existingSnap.empty) {
        const userData = existingSnap.docs[0].data();
        if (userData.uid) {
            throw new https_1.HttpsError('already-exists', 'A user with this email is already registered.');
        }
        // If it's a stub, we'll just update it later or resend the mail
    }
    // Read Agency info
    const agencyDoc = await db.doc(`agencies/${authData.agencyId}`).get();
    const agencyData = agencyDoc.data();
    const agencyName = agencyData.agencyName || agencyData.name || 'הסוכנות שלנו';
    const inviteToken = generateToken();
    const defaultName = normalizedEmail.split('@')[0];
    // Create or update stub
    if (existingSnap.empty) {
        await db.collection('users').add({
            uid: null,
            email: normalizedEmail,
            name: defaultName,
            role: 'agent',
            agencyId: authData.agencyId,
            isActive: true,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            inviteToken,
        });
    }
    else {
        await existingSnap.docs[0].ref.update({
            inviteToken,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    const joinLink = `https://homer.management/join?token=${inviteToken}`;
    // Send Mail
    const apiKey = resendApiKey.value();
    if (apiKey) {
        const resend = new resend_1.Resend(apiKey);
        try {
            await resend.emails.send({
                from: 'hello@homer.management',
                to: [normalizedEmail],
                subject: `✉️ הזמנה להצטרף לצוות של ${agencyName}`,
                html: buildInviteEmail(defaultName, agencyName, joinLink),
            });
        }
        catch (err) {
            console.error('[sendAgentInvite] Email failed:', err);
        }
    }
    return { success: true, message: `הזמנה נשלחה בהצלחה ל-${normalizedEmail}` };
});
/**
 * claimInviteToken — Called by the client when they authenticate with an invite token.
 * This function securely looks up the stub, merges it into the user's permanent document,
 * sets custom claims, and deletes the stub.
 *
 * Target: `users/{request.auth.uid}`
 */
exports.claimInviteToken = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { token } = request.data;
    if (!(token === null || token === void 0 ? void 0 : token.trim())) {
        throw new https_1.HttpsError('invalid-argument', 'Invite token is required.');
    }
    // Find the stub matching the token
    const stubsSnap = await db.collection('users')
        .where('inviteToken', '==', token.trim())
        .limit(1)
        .get();
    let stubDoc = !stubsSnap.empty ? stubsSnap.docs[0] : null;
    // Fallback for legacy invitations (token was docId)
    if (!stubDoc && token.trim().length >= 20) {
        const legacyDoc = await db.collection('users').doc(token.trim()).get();
        const legacyData = legacyDoc.data();
        if (legacyDoc.exists && !(legacyData === null || legacyData === void 0 ? void 0 : legacyData.inviteToken)) {
            stubDoc = legacyDoc;
        }
    }
    if (!stubDoc || !stubDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Invite token not found.');
    }
    const stubData = stubDoc.data();
    // ── Verify Target Agency is active ──────────────────────────────────────────
    const agencySnap = await db.doc(`agencies/${stubData.agencyId}`).get();
    if (!agencySnap.exists) {
        throw new https_1.HttpsError('not-found', 'The agency you are trying to join no longer exists.');
    }
    const agencyData = agencySnap.data();
    if (agencyData.isActive === false) {
        throw new https_1.HttpsError('failed-precondition', 'This agency is currently inactive.');
    }
    // Check billing — allow joining if no billing field, billing is active/paid, or trial is not expired
    const billing = agencyData.billing;
    if (billing) {
        const status = billing.status;
        const trialEndsAt = billing.trialEndsAt;
        const isTrialing = status === 'trialing';
        const trialExpired = trialEndsAt && trialEndsAt.toDate() < new Date();
        if (status && status !== 'active' && status !== 'paid' && !(isTrialing && !trialExpired)) {
            throw new https_1.HttpsError('failed-precondition', 'This agency\'s subscription has expired. Contact the agency admin.');
        }
    }
    const userUid = request.auth.uid;
    const userRef = db.collection('users').doc(userUid);
    // Resolve effectiveRole before the transaction so we can use it for Custom Claims.
    // An existing admin must never be downgraded by claiming an agent invite.
    const preSnap = await userRef.get();
    const existingRole = (_a = preSnap.data()) === null || _a === void 0 ? void 0 : _a.role;
    const effectiveRole = existingRole === 'admin' ? 'admin' : stubData.role;
    // ── Atomic transaction: check stub ownership + link user + mark stub consumed ──
    // All reads and writes in one transaction to prevent race conditions where two
    // concurrent requests could both claim the same invite token.
    await db.runTransaction(async (transaction) => {
        var _a;
        // Re-read stub inside the transaction to get the freshest state
        const freshStub = await transaction.get(stubDoc.ref);
        if (!freshStub.exists) {
            throw new https_1.HttpsError('not-found', 'Invite token no longer exists.');
        }
        const freshStubData = freshStub.data();
        // Atomic ownership check — prevents two users from claiming simultaneously
        if (freshStubData.uid && freshStubData.uid !== userUid) {
            throw new https_1.HttpsError('permission-denied', 'Token is already linked to another account.');
        }
        const userSnap = await transaction.get(userRef);
        if (userSnap.exists) {
            // Migrate existing user to the new agency, preserving their role if admin.
            transaction.update(userRef, {
                agencyId: stubData.agencyId,
                role: effectiveRole,
                inviteToken: token.trim(),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        else {
            // Link: create the user document using the stub's data
            transaction.set(userRef, {
                uid: userUid,
                email: ((_a = request.auth) === null || _a === void 0 ? void 0 : _a.token.email) || stubData.email,
                name: stubData.name || null,
                phone: stubData.phone || null,
                role: effectiveRole,
                agencyId: stubData.agencyId,
                isActive: true,
                inviteToken: token.trim(),
                createdAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        // Mark stub as consumed inside the same transaction
        if (stubDoc.id !== userUid) {
            transaction.update(stubDoc.ref, { uid: userUid, claimedAt: firestore_1.FieldValue.serverTimestamp() });
        }
    });
    // Set custom claims using effectiveRole (not stubData.role) to avoid
    // accidentally downgrading an existing admin to an agent.
    await (0, auth_1.getAuth)().setCustomUserClaims(userUid, {
        agencyId: stubData.agencyId,
        role: effectiveRole
    });
    return { success: true, agencyId: stubData.agencyId };
});
//# sourceMappingURL=team.js.map