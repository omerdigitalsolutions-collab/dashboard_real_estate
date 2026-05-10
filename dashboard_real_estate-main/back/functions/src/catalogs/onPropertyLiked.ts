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

    // ─── Resolve assigned agent from property document ───────────────────────
    let assignedAgentId: string | null = null;
    const propertyIds: Array<string | { id: string; collectionPath: string }> = catalog.propertyIds || [];
    const propertyEntry = propertyIds.find(
      (p) => (typeof p === 'string' ? p : p.id) === propertyId,
    );
    const collectionPath =
      typeof propertyEntry === 'object' && propertyEntry?.collectionPath
        ? propertyEntry.collectionPath
        : `agencies/${agencyId}/properties`;

    try {
      const propertySnap = await db.doc(`${collectionPath}/${propertyId}`).get();
      if (propertySnap.exists) {
        assignedAgentId = propertySnap.data()!.management?.assignedAgentId || null;
      }
    } catch (e) {
      console.warn('[onPropertyLiked] property lookup failed:', e);
    }

    // ─── Legacy CRM notification (kept for backwards compatibility) ──────────
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

    // ─── Fetch agency admins ──────────────────────────────────────────────────
    const adminSnap = await db.collection('users')
      .where('agencyId', '==', agencyId)
      .where('role', '==', 'admin')
      .get();

    const alertBase = {
      agencyId,
      leadId: leadId ?? null,
      leadName,
      type: 'catalog_like',
      title: '❤️ לייק מהקטלוג!',
      message: `${leadName} לחץ על "אהבתי" על הנכס ב${addr}`,
      link: leadId ? `/dashboard/leads/${leadId}` : `/dashboard/properties`,
      propertyId,
      propertyAddress: addr,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Alert for the assigned agent
    if (assignedAgentId) {
      db.collection('alerts').add({
        ...alertBase,
        targetAgentId: assignedAgentId,
      }).catch((e) => console.warn('[onPropertyLiked] agent alert write failed:', e.message));
    }

    // Alerts for admins (skip if admin is the assigned agent to avoid duplicates)
    let hasAdmins = false;
    for (const adminDoc of adminSnap.docs) {
      hasAdmins = true;
      if (adminDoc.id === assignedAgentId) continue;
      db.collection('alerts').add({
        ...alertBase,
        targetAgentId: adminDoc.id,
      }).catch((e) => console.warn('[onPropertyLiked] admin alert write failed:', e.message));
    }

    // Fallback: broadcast to all if no agent and no admins found
    if (!assignedAgentId && !hasAdmins) {
      db.collection('alerts').add({
        ...alertBase,
        targetAgentId: 'all',
      }).catch((e) => console.warn('[onPropertyLiked] broadcast alert write failed:', e.message));
    }

    // ─── WhatsApp credentials ─────────────────────────────────────────────────
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
    const staffMessage = `❤️ *לייק מהקטלוג!*\n${leadName} לחץ על "אהבתי" על הנכס ב${addr}.\n\nכדאי ליצור קשר בקרוב! 😊`;

    // ─── WhatsApp to assigned agent ───────────────────────────────────────────
    let agentPhone: string | null = null;
    if (assignedAgentId) {
      try {
        const agentDoc = await db.collection('users').doc(assignedAgentId).get();
        agentPhone = agentDoc.data()?.phone || agentDoc.data()?.phoneNumber || null;
        if (agentPhone) {
          await sendWhatsAppMessage(integration, agentPhone, staffMessage);
          console.log(`[onPropertyLiked] ✅ WA sent to agent ${assignedAgentId}`);
        }
      } catch (e) {
        console.warn('[onPropertyLiked] Failed to send WA to agent:', e);
      }
    }

    // ─── WhatsApp to admins ───────────────────────────────────────────────────
    for (const adminDoc of adminSnap.docs) {
      const adminPhone: string | undefined = adminDoc.data()?.phone || adminDoc.data()?.phoneNumber;
      if (!adminPhone) continue;
      if (adminPhone === agentPhone) continue; // skip if same person
      try {
        await sendWhatsAppMessage(integration, adminPhone, staffMessage);
        console.log(`[onPropertyLiked] ✅ WA sent to admin ${adminDoc.id}`);
      } catch (e) {
        console.warn('[onPropertyLiked] Failed to send WA to admin:', e);
      }
    }

    // ─── WhatsApp to lead (only for catalogs tied to a specific lead) ─────────
    if (!leadId) return { success: true };

    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) return { success: true };
    const phone: string | undefined = leadSnap.data()!.phone;
    if (!phone) return { success: true };

    const leadMessage = `היי ${leadName}! 🏠 ראינו שאהבת את הנכס ב${addr}. נציג שלנו יחזור אליך בקרוב – תודה על ההתעניינות! 😊`;

    try {
      const sent = await sendWhatsAppMessage(integration, phone, leadMessage);
      if (sent) {
        db.collection(`leads/${leadId}/messages`).add({
          text: leadMessage,
          direction: 'outbound',
          senderPhone: 'bot',
          source: 'whatsapp_ai_bot',
          botSentAt: Date.now(),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          isRead: true,
        }).catch((e) => console.warn('[onPropertyLiked] message log failed:', e.message));
        console.log(`[onPropertyLiked] ✅ WA sent to lead ${leadId}`);
      }
    } catch (err) {
      console.warn(`[onPropertyLiked] Failed to send WA to lead ${leadId}:`, err);
    }

    return { success: true };
  },
);
