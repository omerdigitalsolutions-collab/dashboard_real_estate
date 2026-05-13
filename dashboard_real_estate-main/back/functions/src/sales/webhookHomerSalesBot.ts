/**
 * ─── Homer Sales Bot Webhook ──────────────────────────────────────────────────
 *
 * HTTP Cloud Function that receives Green API webhooks for Homer's own WhatsApp
 * number and routes inbound messages to the sales bot.
 *
 * Homer's integration credentials + bot settings are stored in:
 *   homer_settings/salesBot  {
 *     isActive: boolean
 *     mode: 'agents' | 'demo'
 *     idInstance: string
 *     apiTokenInstance: string
 *     updatedAt: Timestamp
 *     updatedBy: string
 *   }
 *
 * Endpoint: POST /webhookHomerSalesBot
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { handleHomerSalesBot } from './homerSalesBot';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const db = admin.firestore();

// ─── Idempotency guard ────────────────────────────────────────────────────────

async function markProcessed(msgId: string): Promise<boolean> {
  const ref = db.collection('homer_processed_messages').doc(msgId);
  try {
    await ref.create({ processedAt: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  } catch (err: any) {
    if (err?.code === 6 /* ALREADY_EXISTS */) return false;
    throw err;
  }
}

// ─── Phone normaliser ─────────────────────────────────────────────────────────

function normalisePhone(rawSender: string): string {
  let digits = rawSender.replace(/\D/g, '');
  if (digits.startsWith('972')) digits = '0' + digits.substring(3);
  return digits;
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

export const webhookHomerSalesBot = onRequest(
  {
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 120,
    concurrency: 20,
    minInstances: 0,
    secrets: [geminiApiKey],
  },
  async (req, res) => {
    // Always ACK immediately so Green API doesn't retry
    res.status(200).send('ok');

    try {
      const body = req.body ?? {};
      const { typeWebhook, idMessage, senderData, messageData } = body;

      // Only handle inbound DMs
      if (typeWebhook !== 'incomingMessageReceived') return;
      if (!senderData?.sender || senderData.chatId?.endsWith('@g.us')) return;

      const text: string =
        messageData?.textMessageData?.textMessage ||
        messageData?.extendedTextMessageData?.text ||
        '';
      if (!text.trim()) return;

      const msgId: string = idMessage || `${senderData.sender}-${Date.now()}`;

      // Idempotency
      const isNew = await markProcessed(msgId);
      if (!isNew) {
        console.log(`[HomerSalesBot] Duplicate message ${msgId}, skipping`);
        return;
      }

      // Load bot settings
      const settingsSnap = await db.collection('homer_settings').doc('salesBot').get();
      if (!settingsSnap.exists) {
        console.log('[HomerSalesBot] homer_settings/salesBot not found, bot inactive');
        return;
      }

      const settings = settingsSnap.data()!;
      if (!settings.isActive) {
        console.log('[HomerSalesBot] Bot is inactive');
        return;
      }

      const { idInstance, apiTokenInstance, mode } = settings;
      if (!idInstance || !apiTokenInstance) {
        console.error('[HomerSalesBot] Missing Green API credentials in homer_settings/salesBot');
        return;
      }

      const phone = normalisePhone(senderData.sender);
      if (!phone) return;

      await handleHomerSalesBot({
        phone,
        text: text.trim(),
        geminiApiKey: geminiApiKey.value(),
        homerIntegration: {
          idInstance,
          apiTokenInstance,
          isConnected: true,
        },
        botMode: mode ?? 'agents',
      });
    } catch (err) {
      console.error('[HomerSalesBot] Unhandled error:', err);
    }
  },
);
