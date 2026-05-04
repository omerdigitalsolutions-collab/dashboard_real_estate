import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { Resend } from 'resend';

const resendApiKey = defineSecret('RESEND_API_KEY');

export const notifyInstanceSignedSecrets = [resendApiKey];

const db = admin.firestore();

async function fetchPdfAsBase64(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return Buffer.from(buf).toString('base64');
    } catch {
        return null;
    }
}

function buildInstanceClientEmailHtml(clientName: string, agencyName: string, contractTitle: string, hasPdf: boolean): string {
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

function buildInstanceStaffEmailHtml(clientName: string, contractTitle: string, hasPdf: boolean): string {
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

export const onContractInstanceSigned = onDocumentUpdated(
    {
        document: 'agencies/{agencyId}/contractInstances/{instanceId}',
        secrets: [resendApiKey],
    },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();

        if (!before || !after) return;
        if (before.status === after.status) return;
        if (after.status !== 'signed') return;

        const { agencyId, instanceId } = event.params;
        const { templateId, dealId, leadId, createdBy, signedPdfUrl } = after as {
            templateId: string;
            dealId?: string;
            leadId?: string;
            createdBy: string;
            signedPdfUrl?: string;
        };

        // ── Fetch agency ──────────────────────────────────────────────────────
        const agencyDoc = await db.collection('agencies').doc(agencyId).get();
        const agencyData = agencyDoc.data();
        const agencyName: string = agencyData?.name || agencyData?.displayName || 'משרד התיווך';

        // ── Fetch template for title ──────────────────────────────────────────
        let contractTitle = 'חוזה';
        try {
            const tmplDoc = await db
                .collection('agencies').doc(agencyId)
                .collection('contractTemplates').doc(templateId)
                .get();
            if (tmplDoc.exists) contractTitle = tmplDoc.data()?.title || contractTitle;
        } catch { /* non-fatal */ }

        // ── Fetch client from lead ────────────────────────────────────────────
        let clientEmail: string | undefined;
        let clientName = 'לקוח';
        const resolvedLeadId = leadId || (dealId ? (await db.collection('deals').doc(dealId).get()).data()?.leadId : undefined);
        if (resolvedLeadId) {
            const leadDoc = await db.collection('leads').doc(resolvedLeadId).get();
            const leadData = leadDoc.data();
            if (leadData) {
                clientName = leadData.name || clientName;
                clientEmail = leadData.email || undefined;
            }
        }

        // ── Fetch agent ───────────────────────────────────────────────────────
        let agentEmail: string | undefined;
        if (createdBy) {
            const agentDoc = await db.collection('users').doc(createdBy).get();
            agentEmail = agentDoc.data()?.email || undefined;
        }

        // ── Fetch admin ───────────────────────────────────────────────────────
        let adminEmail: string | undefined;
        const adminSnap = await db.collection('users')
            .where('agencyId', '==', agencyId)
            .where('role', '==', 'admin')
            .limit(1)
            .get();
        if (!adminSnap.empty) {
            adminEmail = agencyData?.notifications?.contactEmail || adminSnap.docs[0].data()?.email || undefined;
        } else {
            adminEmail = agencyData?.notifications?.contactEmail || undefined;
        }

        // ── Fetch PDF if exists ───────────────────────────────────────────────
        // Template instances don't generate a server-side PDF (client-side html2pdf only),
        // so signedPdfUrl is null here unless a future flow sets it.
        const pdfBase64 = signedPdfUrl ? await fetchPdfAsBase64(signedPdfUrl) : null;
        const hasPdf = pdfBase64 !== null;
        const attachments = hasPdf
            ? [{ filename: `חוזה_חתום_${instanceId}.pdf`, content: pdfBase64! }]
            : [];

        // ── Send emails ───────────────────────────────────────────────────────
        const apiKey = resendApiKey.value();
        if (apiKey) {
            const resend = new Resend(apiKey);
            const emailPromises: Promise<any>[] = [];

            if (clientEmail) {
                emailPromises.push(
                    resend.emails.send({
                        from: 'hOMER CRM <noreply@homer-crm.co.il>',
                        to: clientEmail,
                        subject: `החוזה שלך נחתם — ${agencyName}`,
                        html: buildInstanceClientEmailHtml(clientName, agencyName, contractTitle, hasPdf),
                        attachments,
                    }).then(() => console.log(`[onContractInstanceSigned] Client email sent to ${clientEmail}`))
                      .catch(err => console.error('[onContractInstanceSigned] Client email failed:', err))
                );
            }

            const staffTargets = new Map<string, string>();
            if (agentEmail) staffTargets.set(agentEmail, 'סוכן');
            if (adminEmail && adminEmail !== agentEmail) staffTargets.set(adminEmail, 'מנהל');

            for (const [email] of staffTargets) {
                emailPromises.push(
                    resend.emails.send({
                        from: 'hOMER CRM <noreply@homer-crm.co.il>',
                        to: email,
                        subject: `✅ חוזה נחתם — ${clientName}`,
                        html: buildInstanceStaffEmailHtml(clientName, contractTitle, hasPdf),
                        attachments,
                    }).then(() => console.log(`[onContractInstanceSigned] Staff email sent to ${email}`))
                      .catch(err => console.error(`[onContractInstanceSigned] Staff email failed for ${email}:`, err))
                );
            }

            await Promise.all(emailPromises);
        } else {
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
        } catch (err) {
            console.error('[onContractInstanceSigned] Alert failed:', err);
        }
    }
);
