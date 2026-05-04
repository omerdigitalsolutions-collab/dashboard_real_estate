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
exports.onContractInstanceSigned = exports.notifyInstanceSignedSecrets = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
const resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
exports.notifyInstanceSignedSecrets = [resendApiKey];
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
function buildInstanceClientEmailHtml(clientName, agencyName, contractTitle, hasPdf) {
    return `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a3c5e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">החוזה נחתם בהצלחה</h1>
  </div>
  <div style="background: #fff; padding: 28px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p>שלום ${clientName},</p>
    <p>החוזה <strong>${contractTitle}</strong> עם <strong>${agencyName}</strong> נחתם בהצלחה.</p>
    ${hasPdf ? '<p>מצורף לאימייל זה עותק PDF של החוזה החתום לשמירתך.</p>' : ''}
    <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0; color: #166534; font-weight: bold;">✅ החוזה נחתם ואושר</p>
    </div>
    <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">אם יש לך שאלות, אנא פנה ישירות למשרד.</p>
    <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">hOMER CRM — noreply@homer-crm.co.il</p>
  </div>
</div>`;
}
function buildInstanceStaffEmailHtml(clientName, contractTitle, hasPdf) {
    return `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.7; color: #333; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a3c5e; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">חוזה נחתם על ידי לקוח</h1>
  </div>
  <div style="background: #fff; padding: 28px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p>הלקוח <strong>${clientName}</strong> חתם על החוזה <strong>${contractTitle}</strong>.</p>
    ${hasPdf ? '<p>מצורף לאימייל זה עותק PDF של החוזה החתום.</p>' : ''}
    <a href="https://app.homer-crm.co.il/dashboard/contracts"
       style="display: inline-block; padding: 10px 20px; background: #1a3c5e; color: #fff; text-decoration: none; border-radius: 6px; margin-top: 8px;">
      לצפייה בחוזים
    </a>
    <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">hOMER CRM — noreply@homer-crm.co.il</p>
  </div>
</div>`;
}
exports.onContractInstanceSigned = (0, firestore_1.onDocumentUpdated)({
    document: 'agencies/{agencyId}/contractInstances/{instanceId}',
    secrets: [resendApiKey],
}, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    if (before.status === after.status)
        return;
    if (after.status !== 'signed')
        return;
    const { agencyId, instanceId } = event.params;
    const { templateId, dealId, leadId, createdBy, signedPdfUrl } = after;
    // ── Fetch agency ──────────────────────────────────────────────────────
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    const agencyData = agencyDoc.data();
    const agencyName = (agencyData === null || agencyData === void 0 ? void 0 : agencyData.name) || (agencyData === null || agencyData === void 0 ? void 0 : agencyData.displayName) || 'משרד התיווך';
    // ── Fetch template for title ──────────────────────────────────────────
    let contractTitle = 'חוזה';
    try {
        const tmplDoc = await db
            .collection('agencies').doc(agencyId)
            .collection('contractTemplates').doc(templateId)
            .get();
        if (tmplDoc.exists)
            contractTitle = ((_c = tmplDoc.data()) === null || _c === void 0 ? void 0 : _c.title) || contractTitle;
    }
    catch ( /* non-fatal */_j) { /* non-fatal */ }
    // ── Fetch client from lead ────────────────────────────────────────────
    let clientEmail;
    let clientName = 'לקוח';
    const resolvedLeadId = leadId || (dealId ? (_d = (await db.collection('deals').doc(dealId).get()).data()) === null || _d === void 0 ? void 0 : _d.leadId : undefined);
    if (resolvedLeadId) {
        const leadDoc = await db.collection('leads').doc(resolvedLeadId).get();
        const leadData = leadDoc.data();
        if (leadData) {
            clientName = leadData.name || clientName;
            clientEmail = leadData.email || undefined;
        }
    }
    // ── Fetch agent ───────────────────────────────────────────────────────
    let agentEmail;
    if (createdBy) {
        const agentDoc = await db.collection('users').doc(createdBy).get();
        agentEmail = ((_e = agentDoc.data()) === null || _e === void 0 ? void 0 : _e.email) || undefined;
    }
    // ── Fetch admin ───────────────────────────────────────────────────────
    let adminEmail;
    const adminSnap = await db.collection('users')
        .where('agencyId', '==', agencyId)
        .where('role', '==', 'admin')
        .limit(1)
        .get();
    if (!adminSnap.empty) {
        adminEmail = ((_f = agencyData === null || agencyData === void 0 ? void 0 : agencyData.notifications) === null || _f === void 0 ? void 0 : _f.contactEmail) || ((_g = adminSnap.docs[0].data()) === null || _g === void 0 ? void 0 : _g.email) || undefined;
    }
    else {
        adminEmail = ((_h = agencyData === null || agencyData === void 0 ? void 0 : agencyData.notifications) === null || _h === void 0 ? void 0 : _h.contactEmail) || undefined;
    }
    // ── Fetch PDF if exists ───────────────────────────────────────────────
    // Template instances don't generate a server-side PDF (client-side html2pdf only),
    // so signedPdfUrl is null here unless a future flow sets it.
    const pdfBase64 = signedPdfUrl ? await fetchPdfAsBase64(signedPdfUrl) : null;
    const hasPdf = pdfBase64 !== null;
    const attachments = hasPdf
        ? [{ filename: `חוזה_חתום_${instanceId}.pdf`, content: pdfBase64 }]
        : [];
    // ── Send emails ───────────────────────────────────────────────────────
    const apiKey = resendApiKey.value();
    if (apiKey) {
        const resend = new resend_1.Resend(apiKey);
        const emailPromises = [];
        if (clientEmail) {
            emailPromises.push(resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: clientEmail,
                subject: `החוזה שלך נחתם — ${agencyName}`,
                html: buildInstanceClientEmailHtml(clientName, agencyName, contractTitle, hasPdf),
                attachments,
            }).then(() => console.log(`[onContractInstanceSigned] Client email sent to ${clientEmail}`))
                .catch(err => console.error('[onContractInstanceSigned] Client email failed:', err)));
        }
        const staffTargets = new Map();
        if (agentEmail)
            staffTargets.set(agentEmail, 'סוכן');
        if (adminEmail && adminEmail !== agentEmail)
            staffTargets.set(adminEmail, 'מנהל');
        for (const [email] of staffTargets) {
            emailPromises.push(resend.emails.send({
                from: 'hOMER CRM <noreply@homer-crm.co.il>',
                to: email,
                subject: `✅ חוזה נחתם — ${clientName}`,
                html: buildInstanceStaffEmailHtml(clientName, contractTitle, hasPdf),
                attachments,
            }).then(() => console.log(`[onContractInstanceSigned] Staff email sent to ${email}`))
                .catch(err => console.error(`[onContractInstanceSigned] Staff email failed for ${email}:`, err)));
        }
        await Promise.all(emailPromises);
    }
    else {
        console.warn('[onContractInstanceSigned] RESEND_API_KEY not set — email skipped.');
    }
    // ── System alert ──────────────────────────────────────────────────────
    try {
        await db.collection('alerts').add({
            agencyId,
            targetAgentId: 'all',
            title: 'חוזה נחתם!',
            message: `הלקוח ${clientName} חתם על החוזה "${contractTitle}". הקובץ החתום זמין.`,
            type: 'contract_signed',
            isRead: false,
            relatedTo: { id: instanceId, type: 'contractInstance' },
            signedPdfUrl: signedPdfUrl || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (err) {
        console.error('[onContractInstanceSigned] Alert failed:', err);
    }
});
//# sourceMappingURL=notifyInstanceSigned.js.map