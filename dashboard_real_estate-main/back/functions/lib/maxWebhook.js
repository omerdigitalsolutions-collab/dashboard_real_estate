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
exports.maxPaymentWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const resend_1 = require("resend");
// Firebase Admin — initialized in config/admin.ts (already imported by index.ts)
const db = admin.firestore();
const auth = admin.auth();
// ─── Environment Secrets ──────────────────────────────────────────────────────
// Removed MAX_API_SECRET and RESEND_API_KEY temporarily to allow deployment
// ─── Helper: HMAC signature verification ─────────────────────────────────────
/**
 * Max typically sends a signature parameter built as:
 *   HMAC-SHA256( secret, transactionId + status + uid )
 * Adjust field order to match the actual documentation you receive from Max.
 *
 * If Max doesn't send a signature, set MAX_API_SECRET to any string and
 * temporarily skip verification (see TODO below).
 */
function isSignatureValid(secret, receivedSignature, transactionId, status, uid) {
    const payload = `${transactionId}${status}${uid}`;
    const expected = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
    // Constant-time comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(Buffer.from(receivedSignature, "hex"), Buffer.from(expected, "hex"));
    }
    catch (_a) {
        return false;
    }
}
// ─── Main Webhook Handler ─────────────────────────────────────────────────────
/**
 * maxPaymentWebhook
 *
 * HTTP POST endpoint called by Max's IPN (Instant Payment Notification) service.
 * Max sends a server-to-server POST after every completed/failed transaction.
 *
 * Expected request body fields (sent by Max):
 *   status        - "000" means approved/success (other codes = failure)
 *   transactionId - Max's unique transaction ID
 *   uid           - The Firebase UID passed as a URL param when sending user to Max
 *   plan          - The subscription plan ("solo" | "boutique")
 *   email         - Customer email
 *   name          - Customer name (optional)
 *   token         - Recurring billing token (optional, for future charges)
 *   signature     - HMAC-SHA256 of the request (see isSignatureValid above)
 */
exports.maxPaymentWebhook = (0, https_1.onRequest)({}, async (req, res) => {
    const maxApiSecret = process.env.MAX_API_SECRET || "";
    const resendApiKey = process.env.RESEND_API_KEY || "";
    // ── 1. Accept only POST ──────────────────────────────────────────────────
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const { status, transactionId, uid, plan, email, name, token, signature, } = req.body;
    console.log(`📥 Max IPN received | status=${status} | txId=${transactionId} | uid=${uid} | plan=${plan}`);
    // ── 2. Signature Verification ────────────────────────────────────────────
    if (!maxApiSecret) {
        console.error("❌ MAX_API_SECRET is not configured — rejecting all requests.");
        res.status(500).send("Webhook secret not configured.");
        return;
    }
    if (!signature || !isSignatureValid(maxApiSecret, signature, transactionId, status, uid !== null && uid !== void 0 ? uid : "")) {
        console.error("❌ Max webhook signature missing or mismatch — rejecting request.");
        res.status(200).json({ received: true, error: "signature_mismatch" });
        return;
    }
    // ── 3. Check transaction status ──────────────────────────────────────────
    if (status !== "000") {
        console.log(`ℹ️  Non-success status received (${status}). No provisioning needed.`);
        res.status(200).json({ received: true, status: "ignored" });
        return;
    }
    // ── 4. Validate required fields ──────────────────────────────────────────
    if (!email) {
        console.error("❌ Missing email in Max IPN payload.");
        res.status(200).json({ received: true, error: "missing_email" });
        return;
    }
    // ── 5. Provision the Agency ──────────────────────────────────────────────
    try {
        await provisionNewAgency({
            email,
            name: name || "Agency Admin",
            plan: plan || "boutique",
            uid: uid || null,
            token: token || null,
            transactionId,
        }, resendApiKey);
        console.log("✨ Agency provisioning completed successfully.");
    }
    catch (error) {
        console.error("❌ Error during agency provisioning:", error);
        // Still return 200 so Max doesn't keep retrying — handle manually via logs.
    }
    // ── 6. Acknowledge to Max ────────────────────────────────────────────────
    res.status(200).json({ received: true });
});
async function provisionNewAgency(payload, resendApiKey) {
    const { email, name, plan, uid: existingUid, token, transactionId } = payload;
    console.log(`🏗️  Starting provisioning for ${email} | plan=${plan}`);
    // ── Step 1: Create Agency document ──────────────────────────────────────
    const agencyRef = db.collection("agencies").doc();
    const newAgencyId = agencyRef.id;
    const subscriptionTier = planToTier(plan);
    const agencyData = {
        name: `${name}'s Agency`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
        subscriptionStatus: "paid",
        subscriptionTier,
        maxTransactionId: transactionId,
        maxRecurringToken: token !== null && token !== void 0 ? token : null,
        monthlyGoals: { commissions: 0, deals: 5, leads: 20 },
        settings: {
            dealStages: ["ליד חדש", "פגישה נקבעה", "במו\"מ", "חוזה נשלח", "נחתם בשעה טובה"],
        },
    };
    await agencyRef.set(agencyData);
    console.log(`✅ Created agency document: ${newAgencyId}`);
    // ── Step 2: Create or locate Firebase Auth user ──────────────────────────
    let uid;
    try {
        // If uid was passed via URL params (user was logged in during checkout), use it.
        if (existingUid) {
            const record = await auth.getUser(existingUid);
            uid = record.uid;
            console.log(`ℹ️  Using existing UID from URL param: ${uid}`);
        }
        else {
            const existing = await auth.getUserByEmail(email);
            uid = existing.uid;
            console.log(`ℹ️  User already exists (UID: ${uid})`);
        }
    }
    catch (_a) {
        // User doesn't exist — create them
        const newUser = await auth.createUser({
            email,
            displayName: name,
            emailVerified: true,
        });
        uid = newUser.uid;
        console.log(`✅ Created new Firebase Auth user: ${uid}`);
    }
    // ── Step 3: Create/update User profile in Firestore ─────────────────────
    const userDoc = {
        email,
        name,
        uid,
        role: "admin",
        agencyId: newAgencyId,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        preferences: { theme: "light" },
    };
    await db.collection("users").doc(uid).set(userDoc, { merge: true });
    console.log(`✅ User profile saved (uid: ${uid})`);
    // ── Step 4: Send welcome email via Resend ────────────────────────────────
    if (resendApiKey) {
        try {
            const resend = new resend_1.Resend(resendApiKey);
            const resetLink = await auth.generatePasswordResetLink(email);
            await resend.emails.send({
                from: "hOMER CRM <noreply@omer-crm.co.il>",
                to: [email],
                subject: "ברוכים הבאים ל-hOMER CRM! הגדר את הסיסמה שלך",
                html: `
                <div dir="rtl" style="font-family: sans-serif; color: #333; max-width: 600px; margin: auto;">
                    <h1 style="color: #1e3a5f;">ברוכים הבאים, ${name}! 👋</h1>
                    <p>שמחים שהצטרפתם ל-hOMER CRM, המערכת החכמה לניהול משרד התיווך שלכם.</p>
                    <p>המנוי שלכם (<strong>${subscriptionTier}</strong>) הופעל בהצלחה. כדי להתחיל לעבוד, אנא הגדירו סיסמה:</p>
                    <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#10b981;color:white;text-decoration:none;border-radius:8px;font-weight:bold;margin-top:16px;">הגדרת סיסמה</a>
                    <p style="margin-top:24px;font-size:0.85em;color:#888;">
                        טרנזקציה #${transactionId}<br/>
                        אם הקישור אינו פועל: ${resetLink}
                    </p>
                    <p>בברכה,<br/>צוות hOMER</p>
                </div>`,
            });
            console.log(`✅ Welcome email sent to ${email}`);
        }
        catch (emailError) {
            // Don't fail provisioning just because email failed
            console.error(`❌ Welcome email failed:`, emailError);
        }
    }
    else {
        const resetLink = await auth.generatePasswordResetLink(email).catch(() => "N/A");
        console.log(`⚠️  RESEND_API_KEY not set. Reset link for ${email}: ${resetLink}`);
    }
}
// ─── Utilities ────────────────────────────────────────────────────────────────
function planToTier(plan) {
    switch (plan.toLowerCase()) {
        case "solo": return "free";
        case "boutique": return "pro";
        case "enterprise":
        case "network": return "enterprise";
        default: return "pro";
    }
}
//# sourceMappingURL=maxWebhook.js.map