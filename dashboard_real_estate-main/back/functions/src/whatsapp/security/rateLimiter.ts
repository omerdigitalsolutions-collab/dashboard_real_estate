import * as admin from 'firebase-admin';

const db = admin.firestore();

const MAX_MSGS_PER_MINUTE_PER_PHONE = 10;
const WINDOW_MS = 60_000;

// Global agency-level cap: prevents phone-rotation attacks from flooding Gemini.
// Counts all inbound messages to the agency regardless of phone number.
const MAX_MSGS_PER_HOUR_PER_AGENCY = 500;
const AGENCY_WINDOW_MS = 60 * 60_000;

async function checkPhoneLimit(phone: string): Promise<boolean> {
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
    if (data.count >= MAX_MSGS_PER_MINUTE_PER_PHONE) return false;
    tx.update(docRef, { count: admin.firestore.FieldValue.increment(1) });
    return true;
  });
}

async function checkAgencyLimit(agencyId: string): Promise<boolean> {
  const docRef = db.collection('_rate_limits').doc(`agency_${agencyId}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    if (!doc.exists) {
      tx.set(docRef, { count: 1, windowStart: now });
      return true;
    }
    const data = doc.data()!;
    if (now - data.windowStart > AGENCY_WINDOW_MS) {
      tx.set(docRef, { count: 1, windowStart: now });
      return true;
    }
    if (data.count >= MAX_MSGS_PER_HOUR_PER_AGENCY) return false;
    tx.update(docRef, { count: admin.firestore.FieldValue.increment(1) });
    return true;
  });
}

export async function checkRateLimit(phone: string, agencyId?: string): Promise<boolean> {
  const checks = [checkPhoneLimit(phone)];
  if (agencyId) checks.push(checkAgencyLimit(agencyId));
  const results = await Promise.all(checks);
  return results.every(Boolean);
}
