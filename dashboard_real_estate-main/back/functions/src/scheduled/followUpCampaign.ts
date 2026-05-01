import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { sendWhatsAppMessage } from '../whatsappService';

const db = admin.firestore();
const masterKey = defineSecret('ENCRYPTION_MASTER_KEY');

const ALGORITHM = 'aes-256-cbc';

const STEP_DELAYS_MS: Record<number, number> = {
  1: 3 * 24 * 60 * 60 * 1000,
  2: 4 * 24 * 60 * 60 * 1000,
  3: 7 * 24 * 60 * 60 * 1000,
  4: 7 * 24 * 60 * 60 * 1000,
};

const CAMPAIGN_MESSAGES: Record<number, string> = {
  1: 'שלום! 😊 רצינו לבדוק אם אתם עדיין מחפשים נכס. אנחנו כאן לכל שאלה!',
  2: 'היי! יש כמה נכסים חדשים שנכנסו לאחרונה שעשויים להתאים לכם. רוצים שנשלח לכם?',
  3: 'שלום שוב, אנחנו לא רוצים להפריע – רק שתדעו שאנחנו כאן כשתהיו מוכנים. 🏠',
  4: 'זוהי הודעה אחרונה שלנו בינתיים. אם תרצו לחדש את החיפוש, פשוט שלחו לנו הודעה! להסרה מרשימת ההודעות שלחו: *הסר*',
};

const ACTIVE_CHAT_STATES = new Set([
  'COLLECTING_NAME',
  'COLLECTING_REQS',
  'ASKING_EXTRA_CRITERIA',
  'SCHEDULING_CALL',
  'COLLECTING_SELLER_INFO',
  'SCHEDULING_SELLER_CALL',
  'CLOSED',
]);

function decryptToken(encryptedData: string, ivText: string, secret: string): string {
  const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
  const iv = Buffer.from(ivText, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export const followUpCampaign = onSchedule(
  {
    schedule: '0 9 * * *',
    timeZone: 'Asia/Jerusalem',
    secrets: [masterKey],
  },
  async () => {
    const now = Date.now();

    const agenciesSnap = await db.collection('agencies')
      .where('weBotConfig.isActive', '==', true)
      .get();

    for (const agencyDoc of agenciesSnap.docs) {
      const agencyId = agencyDoc.id;
      const agencyData = agencyDoc.data();
      if (agencyData.weBotConfig?.followUpEnabled === false) continue;
      const maxSteps: number = agencyData.weBotConfig?.followUpSteps ?? 4;

      const credsDoc = await db
        .collection('agencies').doc(agencyId)
        .collection('private_credentials').doc('whatsapp')
        .get();
      if (!credsDoc.exists) continue;
      const credsData = credsDoc.data()!;
      if (!credsData.idInstance || !credsData.encryptedToken || !credsData.iv) continue;

      let apiTokenInstance: string;
      try {
        apiTokenInstance = decryptToken(credsData.encryptedToken, credsData.iv, masterKey.value());
      } catch {
        console.warn(`[FollowUpCampaign] Failed to decrypt creds for agency ${agencyId}`);
        continue;
      }
      const integration = { idInstance: credsData.idInstance, apiTokenInstance, isConnected: true };

      const leadsSnap = await db.collection('leads')
        .where('agencyId', '==', agencyId)
        .where('isBotActive', '==', true)
        .get();

      for (const leadDoc of leadsSnap.docs) {
        const lead = leadDoc.data();
        const leadId = leadDoc.id;

        // Skip opted-out leads
        if (lead.followUpOptedOut === true) continue;

        // Skip leads in an active conversation state
        const chatState = lead.chatState as { state?: string } | undefined;
        const currentState = chatState?.state ?? 'IDLE';
        if (ACTIVE_CHAT_STATES.has(currentState)) continue;

        const currentStep: number = lead.followUpCampaignStep ?? 0;
        if (currentStep >= maxSteps) continue;

        const lastInteractionMs: number =
          (lead.lastInteraction as admin.firestore.Timestamp | undefined)?.toDate().getTime()
          ?? (lead.createdAt as admin.firestore.Timestamp | undefined)?.toDate().getTime()
          ?? 0;
        const lastCampaignSentMs: number =
          (lead.followUpCampaignLastSentAt as admin.firestore.Timestamp | undefined)?.toDate().getTime()
          ?? 0;

        // Use the more recent of the two timestamps as the "last activity"
        const lastActivityMs = Math.max(lastInteractionMs, lastCampaignSentMs);

        const nextStep = currentStep + 1;
        const requiredDelay = STEP_DELAYS_MS[nextStep];
        if (now - lastActivityMs < requiredDelay) continue;

        const phone: string | undefined = lead.phone;
        if (!phone) continue;

        const message = CAMPAIGN_MESSAGES[nextStep];

        try {
          const sent = await sendWhatsAppMessage(integration, phone, message);
          if (sent) {
            await db.collection(`leads/${leadId}/messages`).add({
              text: message,
              direction: 'outbound',
              senderPhone: 'bot',
              source: 'whatsapp_ai_bot',
              botSentAt: Date.now(),
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              isRead: true,
            });
            await db.collection('leads').doc(leadId).update({
              followUpCampaignStep: nextStep,
              followUpCampaignLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`[FollowUpCampaign] ✅ Step ${nextStep} sent to lead ${leadId} (${phone})`);
          }
        } catch (err) {
          console.warn(`[FollowUpCampaign] Failed to send to lead ${leadId}:`, err);
        }
      }
    }

    console.log('[FollowUpCampaign] ✅ Daily follow-up campaign run complete.');
  },
);
