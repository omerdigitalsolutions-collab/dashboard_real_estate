/**
 * ─── Bot Security Pipeline ────────────────────────────────────────────────────
 *
 * Entry point for every inbound DM before reaching the AI bot.
 * Order of operations:
 *   1. Blocklist check
 *   2. Rate limit (10 msgs/min)
 *   3. Sanitize input
 *   4. Injection detection + auto-block at score ≥ 3
 *   5. 24-hour security session TTL
 *   6. Property-specific routing (exclusive → agent, other → admin)
 *   7. Delegate to handleWeBotReply
 *   8. Audit log every interaction
 */

import * as admin from 'firebase-admin';
import axios from 'axios';
import { checkBlocklist, blockPhone } from './security/blocklist';
import { checkRateLimit } from './security/rateLimiter';
import { sanitizeInput } from './security/sanitizeInput';
import { detectInjection } from './security/detectInjection';
import { handleWeBotReply } from '../handleWeBotReply';

const db = admin.firestore();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMITED_MSG = 'יותר מדי הודעות. נסה שוב בעוד דקה.';

export interface GreenApiCreds {
  idInstance: string;
  apiTokenInstance: string;
}

export interface PipelineParams {
  phone: string;
  waChatId: string;
  text: string;
  agencyId: string;
  leadId: string;
  geminiApiKey: string;
  creds: GreenApiCreds;
  idMessage?: string;
  inboundMsgDocId: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function sendDirect(creds: GreenApiCreds, chatId: string, message: string): Promise<void> {
  const url = `https://7105.api.greenapi.com/waInstance${creds.idInstance}/sendMessage/${creds.apiTokenInstance}`;
  await axios
    .post(url, { chatId, message }, { timeout: 15_000 })
    .catch((e) => console.warn('[Pipeline] sendDirect failed:', e.message));
}

async function writeAuditLog(
  phone: string,
  agencyId: string,
  direction: 'inbound' | 'outbound' | 'blocked',
  text: string,
  extra?: Record<string, any>,
): Promise<void> {
  await db
    .collection('whatsapp_audit_log')
    .add({
      phone,
      agencyId,
      direction,
      text: text.substring(0, 500),
      ...extra,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    })
    .catch((e) => console.warn('[Pipeline] audit log write failed:', e.message));
}

async function getOrCreateSession(
  phone: string,
  agencyId: string,
): Promise<admin.firestore.DocumentData & { id: string }> {
  const sessionId = `${agencyId}_${phone}`;
  const ref = db.collection('whatsapp_sessions').doc(sessionId);
  const now = admin.firestore.Timestamp.now();
  const snap = await ref.get();

  if (snap.exists) {
    await ref.update({ lastMessageAt: now });
    return { id: snap.id, ...snap.data()!, lastMessageAt: now };
  }

  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + SESSION_TTL_MS);
  const session = { phone, agencyId, createdAt: now, lastMessageAt: now, expiresAt, status: 'active' };
  await ref.set(session);
  return { id: sessionId, ...session };
}

// ─── Property-specific routing ─────────────────────────────────────────────────
// Returns true if the message was handled (conversation should not continue to AI bot).

async function handlePropertyRouting(
  phone: string,
  waChatId: string,
  text: string,
  agencyId: string,
  creds: GreenApiCreds,
): Promise<boolean> {
  const propertyKeywords = ['רחוב', 'כתובת', 'נכס ב', 'דירה ב', 'הנכס ב', 'פרויקט', 'מגדל', 'גוש', 'חלקה', 'קומה'];
  if (!propertyKeywords.some((kw) => text.includes(kw))) return false;

  const words = text.split(/\s+/).filter((w) => w.length > 2);
  if (words.length < 2) return false;

  const propSnap = await db
    .collection('agencies').doc(agencyId).collection('properties')
    .where('status', '==', 'active')
    .limit(50)
    .get();

  const matched = propSnap.docs.find((doc) => {
    const d = doc.data();
    const addrObj = d.address;
    const haystack = [
      typeof addrObj === 'object' ? addrObj?.fullAddress : addrObj,
      addrObj?.street,
      addrObj?.city,
      addrObj?.neighborhood,
    ].filter(Boolean).join(' ').toLowerCase();
    return words.some((w) => haystack.includes(w.toLowerCase()));
  });

  if (!matched) return false;

  const prop = matched.data();
  const assignedAgentId: string | null = prop.management?.assignedAgentId || prop.agentId || null;
  const toIntl = (p: string) => `${p.replace(/^0/, '972')}@c.us`;

  if (prop.isExclusive && assignedAgentId) {
    const agentDoc = await db.collection('users').doc(assignedAgentId).get();
    const agentPhone: string | null = agentDoc.data()?.phone || agentDoc.data()?.phoneNumber || null;
    if (agentPhone) {
      const desc = prop.address?.fullAddress || prop.address?.city || prop.city || 'נכס';
      await sendDirect(
        creds,
        toIntl(agentPhone),
        `🏠 *פנייה ישירה לנכס — מהבוט*\nטלפון לקוח: ${phone}\nשאל על: ${desc}\n\nהודעה:\n"${text}"`,
      );
      await sendDirect(creds, waChatId, 'מעביר אותך לסוכן שאחראי על הנכס — הוא יחזור אליך בהקדם. 🏡');
      return true;
    }
  }

  // Non-exclusive or no agent phone → admin + create lead notification
  const adminSnap = await db
    .collection('users')
    .where('agencyId', '==', agencyId)
    .where('role', '==', 'admin')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (!adminSnap.empty) {
    const adminPhone: string | null =
      adminSnap.docs[0].data()?.phone || adminSnap.docs[0].data()?.phoneNumber || null;
    if (adminPhone) {
      await sendDirect(
        creds,
        toIntl(adminPhone),
        `🏠 *ליד חדש מהבוט*\nטלפון: ${phone}\nשאל על: ${prop.address?.fullAddress || prop.address?.city || prop.city || 'נכס'}\n\nהודעה:\n"${text}"`,
      );
    }
  }

  await sendDirect(creds, waChatId, 'פנינו לנציג שיחזור אליך בהקדם. 🏡');
  return true;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function processInboundMessage(params: PipelineParams): Promise<void> {
  const { phone, waChatId, text, agencyId, leadId, geminiApiKey, creds, idMessage, inboundMsgDocId } = params;

  // 1. Blocklist
  if (await checkBlocklist(phone)) {
    await writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'blocklist' });
    return;
  }

  // 2. Rate limit
  if (!(await checkRateLimit(phone))) {
    await sendDirect(creds, waChatId, RATE_LIMITED_MSG);
    await writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'rate_limit' });
    return;
  }

  // 3. Sanitize
  const sanitized = sanitizeInput(text);

  // 4. Injection detection
  const { isInjection, score } = detectInjection(sanitized);
  if (isInjection) {
    const suspRef = db.collection('whatsapp_suspicious').doc(phone);
    const suspSnap = await suspRef.get();
    const prev = suspSnap.exists ? (suspSnap.data()!.score ?? 0) : 0;
    const newScore = prev + score;

    await suspRef.set(
      { phone, agencyId, score: newScore, lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

    if (newScore >= 3) {
      await blockPhone(phone, `injection_attempts_score_${newScore}`);
      await writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'auto_block_injection', score: newScore });
      return;
    }
    await writeAuditLog(phone, agencyId, 'inbound', sanitized, { injectionScore: newScore, flagged: true });
    // Continue — system prompt handles the injection attempt gracefully
  } else {
    await writeAuditLog(phone, agencyId, 'inbound', sanitized);
  }

  // 5. Security session TTL (rolling 24h — expires 24h after last message, not after creation)
  const session = await getOrCreateSession(phone, agencyId);
  const lastActive = session.lastMessageAt
    ? (session.lastMessageAt as admin.firestore.Timestamp).toMillis()
    : 0;
  const isExpired =
    session.status === 'expired' ||
    (Date.now() - lastActive > SESSION_TTL_MS);

  if (isExpired) {
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    const agencyPhone = agencyDoc.data()?.phone || agencyDoc.data()?.phoneNumber || '';
    await sendDirect(creds, waChatId, `השיחה פגה. לחידוש פנה ל: ${agencyPhone}`);
    await db.collection('whatsapp_sessions').doc(`${agencyId}_${phone}`).delete();
    return;
  }

  // 6. Property-specific routing
  const wasRouted = await handlePropertyRouting(phone, waChatId, sanitized, agencyId, creds);
  if (wasRouted) {
    await writeAuditLog(phone, agencyId, 'outbound', '[property routing]', { routed: true });
    return;
  }

  // 7. Delegate to existing AI bot
  await handleWeBotReply(agencyId, leadId, phone, sanitized, geminiApiKey, creds, idMessage, inboundMsgDocId);
}
