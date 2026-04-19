import * as admin from 'firebase-admin';

const db = admin.firestore();
const MAX_MSGS_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

export async function checkRateLimit(phone: string): Promise<boolean> {
  const docRef = db.collection('_rate_limits').doc(`wa_${phone}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    if (!doc.exists) {
      tx.set(docRef, { count: 1, windowStart: now });
      return true;
    }
    const data = doc.data()!;
    if (now - data.windowStart > WINDOW_MS) {
      tx.set(docRef, { count: 1, windowStart: now });
      return true;
    }
    if (data.count >= MAX_MSGS_PER_MINUTE) return false;
    tx.update(docRef, { count: admin.firestore.FieldValue.increment(1) });
    return true;
  });
}
