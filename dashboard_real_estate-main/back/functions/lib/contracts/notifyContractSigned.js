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
exports.resendApiKeyForContracts = void 0;
exports.notifyContractSigned = notifyContractSigned;
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
exports.resendApiKeyForContracts = (0, params_1.defineSecret)('RESEND_API_KEY');
const db = admin.firestore();
async function fetchPdfAsBase64(url) {
    try {
        const res = await fetch(url);
        if (!res.ok)
            return null;
        const buf = await res.arrayBuffer();
        return Buffer.from(buf).toString('base64');
    }
    catch (_a) {
        return null;
    }
}
function buildClientEmailHtml(clientName, agencyName) {
    return `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a3c5e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">החוזה נחתם בהצלחה</h1>
  </div>
  <div style="background: #fff; padding: 28px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p>שלום ${clientName},</p>
    <p>החוזה שלך עם <strong>${agencyName}</strong> נחתם בהצלחה.</p>
    <p>מצורף לאימייל זה עותק PDF של החוזה החתום לשמירתך.</p>
    <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0; color: #166534; font-weight: bold;">✅ החוזה נחתם ואושר</p>
    </div>
    <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
      אם יש לך שאלות, אנא פנה ישירות למשרד.
    </p>
    <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">hOMER CRM — noreply@homer-crm.co.il</p>
  </div>
</div>`;
}
function buildStaffEmailHtml(clientName, dealId) {
    const dealUrl = `https://app.homer-crm.co.il/dashboard/deals`;
    return `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a3c5e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">חוזה נחתם על ידי לקוח</h1>
  </div>
  <div style="background: #fff; padding: 28px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p>הלקוח <strong>${clientName}</strong> חתם על החוזה.</p>
    <p>מצורף לאימייל זה עותק PDF של החוזה החתום.</p>
    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
      <tr>
        <td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">לקוח</td>
        <td style="padding: 6px 12px;">${clientName}</td>
      </tr>
      <tr>
        <td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">מזהה עסקה</td>
        <td style="padding: 6px 12px;">${dealId}</td>
      </tr>
    </table>
    <a href="${dealUrl}"
       style="display: inline-block; padding: 10px 20px; background: #1a3c5e; color: #fff; text-decoration: none; border-radius: 6px; margin-top: 8px;">
      לצפייה בעסקאות
    </a>
    <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">hOMER CRM — noreply@homer-crm.co.il</p>
  </div>
</div>`;
}
async function notifyContractSigned(params) {
    var _a, _b, _c;
    const { agencyId, dealId, signedPdfUrl } = params;
    // ── 1. Fetch agency info ──────────────────────────────────────────────────
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    const agencyData = agencyDoc.data();
    const agencyName = (agencyData === null || agencyData === void 0 ? void 0 : agencyData.name) || (agencyData === null || agencyData === void 0 ? void 0 : agencyData.displayName) || 'משרד התיווך';
    // ── 2. Fetch deal to get leadId and agentId ───────────────────────────────
    const dealDoc = await db.collection('deals').doc(dealId).get();
    const dealData = dealDoc.data();
    if (!dealData) {
        console.warn(`[notifyContractSigned] Deal ${dealId} not found, skipping.`);
        return;
    }
    const agentId = dealData.createdBy || dealData.agentId || '';
    const leadId = dealData.leadId;
    // ── 3. Fetch client info from lead ────────────────────────────────────────
    let clientEmail;
    let clientName = 'לקוח';
    if (leadId) {
        const leadDoc = await db.collection('leads').doc(leadId).get();
        const leadData = leadDoc.data();
        if (leadData) {
            clientName = leadData.name || clientName;
            clientEmail = leadData.email || undefined;
        }
    }
    // ── 4. Fetch agent info ───────────────────────────────────────────────────
    let agentEmail;
    if (agentId) {
        const agentDoc = await db.collection('users').doc(agentId).get();
        agentEmail = ((_a = agentDoc.data()) === null || _a === void 0 ? void 0 : _a.email) || undefined;
    }
    // ── 5. Fetch admin info ───────────────────────────────────────────────────
    let adminEmail;
    const adminSnap = await db.collection('users')
        .where('agencyId', '==', agencyId)
        .where('role', '==', 'admin')
        .limit(1)
        .get();
    if (!adminSnap.empty) {
        const adminData = adminSnap.docs[0].data();
        adminEmail = ((_b = agencyData === null || agencyData === void 0 ? void 0 : agencyData.notifications) === null || _b === void 0 ? void 0 : _b.contactEmail) || adminData.email || undefined;
    }
    else {
        adminEmail = ((_c = agencyData === null || agencyData === void 0 ? void 0 : agencyData.notifications) === null || _c === void 0 ? void 0 : _c.contactEmail) || undefined;
    }
    // ── 6. Fetch signed PDF as base64 for attachment ──────────────────────────
    const pdfBase64 = await fetchPdfAsBase64(signedPdfUrl);
    const attachments = pdfBase64
        ? [{ filename: `חוזה_חתום_${dealId}.pdf`, content: pdfBase64 }]
        : [];
    // ── 7. Send emails ────────────────────────────────────────────────────────
    const apiKey = exports.resendApiKeyForContracts.value();
    if (!apiKey) {
        console.warn('[notifyContractSigned] RESEND_API_KEY not set — email skipped.');
    }
    else {
        const resend = new resend_1.Resend(apiKey);
        const emailPromises = [];
        // Client email
        if (clientEmail) {
            emailPromises.push(resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: clientEmail,
                subject: `החוזה שלך נחתם — ${agencyName}`,
                html: buildClientEmailHtml(clientName, agencyName),
                attachments,
            }).then(() => console.log(`[notifyContractSigned] Client email sent to ${clientEmail}`))
                .catch(err => console.error('[notifyContractSigned] Client email failed:', err)));
        }
        // Staff emails (agent + admin, deduped)
        const staffTargets = new Map();
        if (agentEmail)
            staffTargets.set(agentEmail, 'סוכן');
        if (adminEmail && adminEmail !== agentEmail)
            staffTargets.set(adminEmail, 'מנהל');
        for (const [email, name] of staffTargets) {
            emailPromises.push(resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: email,
                subject: `✅ חוזה נחתם — ${clientName}`,
                html: buildStaffEmailHtml(clientName, dealId),
                attachments,
            }).then(() => console.log(`[notifyContractSigned] Staff email sent to ${email}`))
                .catch(err => console.error(`[notifyContractSigned] Staff email failed for ${email}:`, err)));
        }
        await Promise.all(emailPromises);
    }
    // ── 8. System alert ───────────────────────────────────────────────────────
    try {
        await db.collection('alerts').add({
            agencyId,
            targetAgentId: 'all',
            title: 'חוזה נחתם!',
            message: `הלקוח ${clientName} חתם על החוזה בעסקה. הקובץ החתום זמין להורדה.`,
            type: 'contract_signed',
            isRead: false,
            relatedTo: { id: dealId, type: 'deal' },
            signedPdfUrl,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[notifyContractSigned] System alert created for deal ${dealId}`);
    }
    catch (err) {
        console.error('[notifyContractSigned] Failed to create system alert:', err);
    }
}
//# sourceMappingURL=notifyContractSigned.js.map