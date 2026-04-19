import * as admin from 'firebase-admin';

const db = admin.firestore();

export async function checkBlocklist(phone: string): Promise<boolean> {
  const doc = await db.collection('whatsapp_blocklist').doc(phone).get();
  return doc.exists;
}

export async function blockPhone(phone: string, reason: string): Promise<void> {
  await db.collection('whatsapp_blocklist').doc(phone).set({
    phone,
    reason,
    blockedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.warn(`[Bot Security] ⛔ Blocked phone: ${phone} — reason: ${reason}`);
}
