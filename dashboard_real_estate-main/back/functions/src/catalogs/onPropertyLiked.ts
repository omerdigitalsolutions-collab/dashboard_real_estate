import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { sendWhatsAppMessage } from '../whatsappService';

const db = admin.firestore();
const masterKey = defineSecret('ENCRYPTION_MASTER_KEY');

const ALGORITHM = 'aes-256-cbc';

function decryptToken(encryptedData: string, ivText: string, secret: string): string {
  const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
  const iv = Buffer.from(ivText, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export const onPropertyLiked = onCall(
  { cors: true, region: 'europe-west1', secrets: [masterKey] },
  async (request) => {
    const { catalogId, propertyId, propertyAddress } = request.data as {
      catalogId?: string;
      propertyId?: string;
      propertyAddress?: string;
    };

    if (!catalogId || !propertyId) return { success: false };

    const catalogSnap = await db.collection('shared_catalogs').doc(catalogId).get();
    if (!catalogSnap.exists) return { success: false };

    const catalog = catalogSnap.data()!;
    const agencyId: string | undefined = catalog.agencyId;
    const leadId: string | null = catalog.leadId ?? null;
    const leadName: string = catalog.leadName || 'לקוח';
    const addr = propertyAddress?.trim() || 'הנכס';

    if (!agencyId) return { success: false };

    // CRM notification (always, even for general catalogs without a lead)
    db.collection('notifications').add({
      agencyId,
      leadId: leadId ?? null,
      leadName,
      type: 'catalog_like',
      propertyId,
      propertyAddress: addr,
      message: `${leadName} סימן עניין בנכס ב${addr}`,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((e) => console.warn('[onPropertyLiked] notification write failed:', e.message));

    // WhatsApp to lead — only if catalog is tied to a specific lead
    if (!leadId) return { success: true };

    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) return { success: true };
    const phone: string | undefined = leadSnap.data()!.phone;
    if (!phone) return { success: true };

    const credsDoc = await db
      .collection('agencies').doc(agencyId)
      .collection('private_credentials').doc('whatsapp')
      .get();
    if (!credsDoc.exists) return { success: true };
    const credsData = credsDoc.data()!;
    if (!credsData.idInstance || !credsData.encryptedToken || !credsData.iv) return { success: true };

    let apiTokenInstance: string;
    try {
      apiTokenInstance = decryptToken(credsData.encryptedToken, credsData.iv, masterKey.value());
    } catch {
      console.warn(`[onPropertyLiked] Failed to decrypt creds for agency ${agencyId}`);
      return { success: true };
    }

    const integration = { idInstance: credsData.idInstance, apiTokenInstance, isConnected: true };
    const message = `היי ${leadName}! 🏠 ראינו שאהבת את הנכס ב${addr}. נציג שלנו יחזור אליך בקרוב – תודה על ההתעניינות! 😊`;

    try {
      const sent = await sendWhatsAppMessage(integration, phone, message);
      if (sent) {
        db.collection(`leads/${leadId}/messages`).add({
          text: message,
          direction: 'outbound',
          senderPhone: 'bot',
          source: 'whatsapp_ai_bot',
          botSentAt: Date.now(),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          isRead: true,
        }).catch((e) => console.warn('[onPropertyLiked] message log failed:', e.message));
        console.log(`[onPropertyLiked] ✅ Sent like confirmation to lead ${leadId} (${phone})`);
      }
    } catch (err) {
      console.warn(`[onPropertyLiked] Failed to send WA to lead ${leadId}:`, err);
    }

    return { success: true };
  },
);
