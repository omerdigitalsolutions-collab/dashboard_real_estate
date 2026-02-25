/**
 * ─── WhatsApp Client Utility ──────────────────────────────────────────────────
 *
 * All WhatsApp dispatch now goes through Firebase Cloud Functions.
 * The frontend never holds any API tokens or instance credentials.
 *
 * Cloud Function endpoint: whatsapp-sendWhatsappMessage
 *   Input:  { phone: string, message: string }
 *   Output: { success: boolean }
 */

import { getFunctions, httpsCallable } from 'firebase/functions';

const fns = getFunctions(undefined, 'europe-west1');

interface SendPayload {
    phone: string;
    message: string;
}

const cfSend = httpsCallable<SendPayload, { success: boolean }>(fns, 'whatsapp-sendWhatsappMessage');

/**
 * Send a single WhatsApp message to a lead.
 * Returns `true` on success, `false` on any error.
 */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
    try {
        const result = await cfSend({ phone, message });
        return result.data.success === true;
    } catch (err) {
        console.error('[WhatsApp] sendWhatsAppMessage failed:', err);
        return false;
    }
}

/**
 * Bulk broadcast — sends the same (personalised) message to multiple leads.
 * Personalisation: {{שם_לקוח}} placeholder is replaced with the lead's name.
 *
 * @param leads   Array of { phone, name } objects
 * @param message Message template (may contain {{שם_לקוח}})
 * @returns       Number of successfully sent messages
 */
export async function sendWhatsAppBulk(
    leads: Array<{ phone: string; name: string }>,
    message: string
): Promise<number> {
    let successCount = 0;

    for (const lead of leads) {
        if (!lead.phone) continue;

        const personalised = message.replace(/\{\{שם_לקוח\}\}/g, lead.name || '');
        const ok = await sendWhatsAppMessage(lead.phone, personalised);
        if (ok) successCount++;
    }

    return successCount;
}

/**
 * Legacy compatibility shim — kept so any existing call to `sendWhatsAppWebhook`
 * continues to work without touching the call sites.
 *
 * Previously this posted to a Make.com webhook URL. Now it delegates to the
 * secure Cloud Function instead.
 *
 * @deprecated  Use `sendWhatsAppMessage` or `sendWhatsAppBulk` directly.
 */
export async function sendWhatsAppWebhook(payload: {
    action: string;
    message: string;
    leads: Array<{ phone: string; name: string }>;
}): Promise<boolean> {
    if (payload.action === 'bulk_broadcast') {
        const count = await sendWhatsAppBulk(payload.leads, payload.message);
        return count > 0;
    }

    // Single-lead fallback
    const lead = payload.leads[0];
    if (!lead?.phone) return false;
    return sendWhatsAppMessage(lead.phone, payload.message);
}
