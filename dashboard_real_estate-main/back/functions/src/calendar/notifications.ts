/**
 * ─── Calendar Module — WhatsApp Notifications ────────────────────────────────
 *
 * Sends WhatsApp messages after a calendar event is created:
 *   - To the assigned agent (if they have a phone number)
 *   - To the lead/client (if relatedTo.type === 'lead' and they have a phone)
 *
 * Credentials are loaded from agencies/{agencyId}/private_credentials/whatsapp
 * and decrypted with the ENCRYPTION_MASTER_KEY secret (same AES-256-CBC pattern
 * used by the scheduled follow-up jobs).
 *
 * All failures are non-fatal — errors are logged but never thrown so they
 * cannot block the primary createEvent response.
 */

import * as crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { sendWhatsAppMessage } from '../whatsappService';

const ALGORITHM = 'aes-256-cbc';

function decryptToken(encryptedData: string, ivText: string, secret: string): string {
    const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
    const iv = Buffer.from(ivText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let dec = decipher.update(encryptedData, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
}

export interface CalendarNotificationParams {
    agencyId: string;
    htmlLink: string;
    eventSummary: string;
    assignedAgentId?: string;
    relatedTo?: { id: string; type: 'lead' | 'property'; name: string };
    encryptionMasterKey: string;
}

export async function sendCalendarNotifications(params: CalendarNotificationParams): Promise<void> {
    const { agencyId, htmlLink, eventSummary, assignedAgentId, relatedTo, encryptionMasterKey } = params;
    const db = getFirestore();

    // ── Load and decrypt Green API credentials ─────────────────────────────
    let integration: { idInstance: string; apiTokenInstance: string; isConnected: true } | null = null;
    try {
        const credsDoc = await db
            .collection('agencies').doc(agencyId)
            .collection('private_credentials').doc('whatsapp')
            .get();
        if (credsDoc.exists) {
            const c = credsDoc.data()!;
            if (c.idInstance && c.encryptedToken && c.iv) {
                integration = {
                    idInstance: c.idInstance,
                    apiTokenInstance: decryptToken(c.encryptedToken, c.iv, encryptionMasterKey),
                    isConnected: true,
                };
            }
        }
    } catch (err) {
        console.warn('[calendar/notify] Failed to load WhatsApp credentials:', err);
        return;
    }

    if (!integration) {
        console.log(`[calendar/notify] No WhatsApp credentials for agency ${agencyId} — skipping`);
        return;
    }

    const sends: Promise<void>[] = [];

    // ── Notify assigned agent ──────────────────────────────────────────────
    if (assignedAgentId) {
        sends.push((async () => {
            try {
                const agentDoc = await db.collection('users').doc(assignedAgentId).get();
                if (!agentDoc.exists) return;
                const agentData = agentDoc.data()!;
                // Tenant isolation: only notify agents in the same agency
                if (agentData.agencyId !== agencyId) return;
                const phone: string | undefined = agentData.phone;
                if (!phone) return;
                await sendWhatsAppMessage(
                    integration!,
                    phone,
                    `📅 *נקבעה פגישה חדשה ביומן שלך*\n${eventSummary}\n\nלצפייה ביומן:\n${htmlLink}`
                );
                console.log(`[calendar/notify] Agent notification sent (uid=${assignedAgentId})`);
            } catch (err) {
                console.warn(`[calendar/notify] Agent notification failed (uid=${assignedAgentId}):`, err);
            }
        })());
    }

    // ── Notify lead (client) ───────────────────────────────────────────────
    if (relatedTo?.type === 'lead') {
        sends.push((async () => {
            try {
                const leadDoc = await db.collection('leads').doc(relatedTo.id).get();
                const phone: string | undefined = leadDoc.data()?.phone;
                if (!phone) return;
                await sendWhatsAppMessage(
                    integration!,
                    phone,
                    `שלום ${relatedTo.name} 😊\nהפגישה שלנו נקבעה בהצלחה!\n\nלצפייה ביומן Google:\n${htmlLink}`
                );
                console.log(`[calendar/notify] Lead notification sent (leadId=${relatedTo.id})`);
            } catch (err) {
                console.warn(`[calendar/notify] Lead notification failed (leadId=${relatedTo.id}):`, err);
            }
        })());
    }

    await Promise.all(sends);
}
