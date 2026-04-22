import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { Resend } from 'resend';
import { sendWhatsAppMessage, WhatsappIntegration } from '../whatsappService';

const resendApiKey = defineSecret('RESEND_API_KEY');

// Export secrets so Cloud Functions triggers can declare them
export const newPropertyAlertSecrets = [resendApiKey];

const db = admin.firestore();

export interface MatchedLead {
    id: string;
    name?: string;
    assignedAgentId?: string;
}

interface NotifyParams {
    agencyId: string;
    property: {
        id: string;
        source: string;
        city?: string;
        price?: number;
        rooms?: number;
        transactionType?: string;
        type?: string;           // legacy fallback
        address?: string;
    };
    matchedLeads: MatchedLead[];
}

const SOURCE_LABEL: Record<string, string> = {
    whatsapp_group: 'קבוצת WhatsApp',
    yad2_alert: 'Yad2',
    madlan_alert: 'מדלן',
    manual: 'הוזן ידנית',
};

function buildMessage(
    property: NotifyParams['property'],
    matchCount: number,
): string {
    const sourceLabel = SOURCE_LABEL[property.source] ?? 'מקור חיצוני';
    const txType = property.transactionType || property.type;
    const typeLabel = txType === 'rent' ? 'להשכרה' : 'למכירה';
    const location = property.city || property.address || 'לא ידוע';
    const price = property.price ? `${property.price.toLocaleString('he-IL')}₪` : 'מחיר לא ידוע';
    const rooms = property.rooms ? `${property.rooms} חד׳` : '';
    const details = [typeLabel, rooms, price].filter(Boolean).join(', ');

    const matchLine = matchCount > 0
        ? `המערכת מצאה ${matchCount} לקוחות מתאימים.\n`
        : '';

    return (
        `🏠 נכס חדש (${sourceLabel}): ${details} ב${location}\n` +
        matchLine +
        `פרטים: https://app.homer-crm.co.il/dashboard/properties`
    );
}

function buildEmailHtml(property: NotifyParams['property'], matchCount: number, recipientName?: string): string {
    const sourceLabel = SOURCE_LABEL[property.source] ?? 'מקור חיצוני';
    const txType2 = property.transactionType || property.type;
    const typeLabel = txType2 === 'rent' ? 'להשכרה' : 'למכירה';
    const location = property.city || property.address || 'לא ידוע';
    const price = property.price ? `${property.price.toLocaleString('he-IL')} ₪` : 'מחיר לא ידוע';
    const rooms = property.rooms ? `${property.rooms} חדרים` : '';

    return `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px;">
  <h2 style="color: #1a3c5e;">🏠 נכס חדש נוסף למערכת</h2>
  ${recipientName ? `<p>שלום ${recipientName},</p>` : ''}
  ${matchCount > 0
        ? `<p>המערכת זיהתה נכס חדש שהגיע דרך <strong>${sourceLabel}</strong> ומצאה <strong>${matchCount} לקוחות מתאימים</strong>.</p>`
        : `<p>נכס חדש הגיע דרך <strong>${sourceLabel}</strong>.</p>`
    }
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">עיר / מיקום</td><td style="padding: 6px 12px;">${location}</td></tr>
    <tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">סוג עסקה</td><td style="padding: 6px 12px;">${typeLabel}</td></tr>
    ${rooms ? `<tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">חדרים</td><td style="padding: 6px 12px;">${rooms}</td></tr>` : ''}
    <tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">מחיר</td><td style="padding: 6px 12px;">${price}</td></tr>
    <tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">מקור</td><td style="padding: 6px 12px;">${sourceLabel}</td></tr>
  </table>
  <a href="https://app.homer-crm.co.il/dashboard/properties"
     style="display: inline-block; padding: 10px 20px; background: #1a3c5e; color: #fff; text-decoration: none; border-radius: 6px; margin-top: 8px;">
    לצפייה בנכסים
  </a>
  <p style="margin-top: 24px; font-size: 12px; color: #888;">hOMER CRM — noreply@homer-crm.co.il</p>
</div>`;
}

const YAD2_MADLAN_SOURCES = new Set(['yad2_alert', 'madlan_alert']);

export async function notifyNewProperty(params: NotifyParams): Promise<void> {
    const { agencyId, property, matchedLeads } = params;
    const matchCount = matchedLeads.length;
    const isYad2OrMadlan = YAD2_MADLAN_SOURCES.has(property.source);
    if (matchCount === 0 && !isYad2OrMadlan) return;

    // Fetch agency doc
    let agencyData: admin.firestore.DocumentData | undefined;
    try {
        const agencyDoc = await db.collection('agencies').doc(agencyId).get();
        if (!agencyDoc.exists) return;
        agencyData = agencyDoc.data()!;
    } catch (err) {
        console.error('[notifyNewProperty] Failed to fetch agency:', err);
        return;
    }

    const isFromGroupChat = property.source === 'whatsapp_group';

    const channels = {
        // Never send WhatsApp replies to contacts who sent group messages
        whatsapp: !isFromGroupChat && agencyData.notifications?.newPropertyChannels?.whatsapp !== false,
        email: agencyData.notifications?.newPropertyChannels?.email !== false,
    };

    const message = buildMessage(property, matchCount);

    // --- Collect recipients ---

    // Manager: from officePhone + admin user email
    const officePhone: string | undefined =
        agencyData.officePhone ||
        agencyData.whatsappIntegration?.phoneNumber ||
        agencyData.billing?.ownerPhone;

    const overrideEmail: string | undefined =
        agencyData.notifications?.contactEmail;

    let adminEmail: string | undefined = overrideEmail;
    let adminName: string | undefined;
    if (!adminEmail) {
        try {
            const adminSnap = await db.collection('users')
                .where('agencyId', '==', agencyId)
                .where('role', '==', 'admin')
                .limit(1)
                .get();
            if (!adminSnap.empty) {
                const adminData = adminSnap.docs[0].data();
                adminEmail = adminData.email;
                adminName = adminData.displayName || adminData.name;
            }
        } catch (err) {
            console.error('[notifyNewProperty] Failed to fetch admin user:', err);
        }
    }

    // Unique agent IDs to notify (exclude undefined / 'all')
    const agentIds = [...new Set(
        matchedLeads
            .map(l => l.assignedAgentId)
            .filter((id): id is string => !!id && id !== 'all')
    )];

    interface AgentInfo { phone?: string; email?: string; name?: string }
    const agentInfos: AgentInfo[] = [];
    if (agentIds.length > 0) {
        try {
            const agentDocs = await Promise.all(agentIds.map(id => db.collection('users').doc(id).get()));
            for (const doc of agentDocs) {
                if (doc.exists) {
                    const d = doc.data()!;
                    agentInfos.push({ phone: d.phone, email: d.email, name: d.displayName || d.name });
                }
            }
        } catch (err) {
            console.error('[notifyNewProperty] Failed to fetch agent users:', err);
        }
    }

    const integration: WhatsappIntegration | undefined = agencyData.whatsappIntegration?.isConnected
        ? (agencyData.whatsappIntegration as WhatsappIntegration)
        : undefined;

    // --- Send WhatsApp ---
    if (channels.whatsapp && integration) {
        const phones = [officePhone, ...agentInfos.map(a => a.phone)].filter((p): p is string => !!p);
        await Promise.all(phones.map(phone =>
            sendWhatsAppMessage(integration, phone, message)
                .then(ok => console.log(`[notify WA] ${phone} → ${ok ? 'ok' : 'failed'}`))
                .catch(err => console.error('[notify WA] error:', err))
        ));
    } else if (channels.whatsapp && !integration) {
        console.warn(`[notifyNewProperty] WhatsApp channel enabled but agency ${agencyId} has no active integration.`);
    }

    // --- Send Email ---
    if (channels.email) {
        const apiKey = resendApiKey.value();
        if (apiKey) {
            const resend = new Resend(apiKey);
            const emailTargets: Array<{ email: string; name?: string }> = [];
            if (adminEmail) emailTargets.push({ email: adminEmail, name: adminName });
            // For group-sourced properties only notify admin, not agents
            if (!isFromGroupChat) {
                agentInfos.forEach(a => { if (a.email) emailTargets.push({ email: a.email, name: a.name }); });
            }

            // Dedupe by email address
            const seen = new Set<string>();
            const uniqueTargets = emailTargets.filter(t => {
                if (seen.has(t.email)) return false;
                seen.add(t.email);
                return true;
            });

            await Promise.all(uniqueTargets.map(target =>
                resend.emails.send({
                    from: 'hOMER CRM <noreply@homer-crm.co.il>',
                    to: target.email,
                    subject: matchCount > 0
                        ? `🏠 נכס חדש נוסף — ${matchCount} לקוחות מתאימים`
                        : `🏠 נכס חדש נוסף מ${SOURCE_LABEL[property.source] ?? property.source}`,
                    html: buildEmailHtml(property, matchCount, target.name),
                })
                .then(() => console.log(`[notify Email] sent to ${target.email}`))
                .catch(err => console.error(`[notify Email] failed for ${target.email}:`, err))
            ));
        } else {
            console.warn('[notifyNewProperty] RESEND_API_KEY not set — email skipped.');
        }
    }

}
