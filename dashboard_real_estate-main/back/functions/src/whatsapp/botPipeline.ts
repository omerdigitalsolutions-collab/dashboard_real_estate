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
 *   6. Delegate to handleWeBotReply (property-specific answering + handoff
 *      live inside handleAddressQuery there — they were removed from this
 *      pipeline to avoid hijacking buyer/seller flows on messages that
 *      merely mention "רחוב" or "דירה ב…")
 *   7. Audit log every interaction
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

const OPT_OUT_KEYWORDS = ['הסר', 'הסירו', 'הסר אותי', 'הפסיקו', 'stop', 'unsubscribe'];
const OPT_OUT_CONFIRM_MSG = 'הוסרת בהצלחה מרשימת ההודעות האוטומטיות שלנו. תמיד נשמח לשמוע ממך! 😊';

function isOptOutMessage(text: string): boolean {
  const n = text.toLowerCase().trim();
  return OPT_OUT_KEYWORDS.some(kw => n === kw.toLowerCase() || n.startsWith(kw.toLowerCase() + ' '));
}

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
  resendApiKey?: string;
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
    // Fire-and-forget — don't block the bot reply on a "lastMessageAt" stamp.
    ref.update({ lastMessageAt: now }).catch((e) => console.warn('[Pipeline] session update failed:', e.message));
    return { id: snap.id, ...snap.data()!, lastMessageAt: now };
  }

  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + SESSION_TTL_MS);
  const session = { phone, agencyId, createdAt: now, lastMessageAt: now, expiresAt, status: 'active' };
  await ref.set(session);
  return { id: sessionId, ...session };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function processInboundMessage(params: PipelineParams): Promise<void> {
  const { phone, waChatId, text, agencyId, leadId, geminiApiKey, resendApiKey, creds, idMessage, inboundMsgDocId } = params;

  // Bypass phone — always gets a response regardless of locks/checks.
  // Set via BYPASS_PHONE env var (Firebase Functions config); no hardcoded number.
  const bypassPhone = process.env.BYPASS_PHONE ?? '';
  const isBypassPhone = bypassPhone !== '' && phone === bypassPhone;

  // 1. & 2. Blocklist + Rate limit (parallel, fail-safe)
  const [isBlocked, passedRateLimit] = await Promise.all([
    checkBlocklist(phone).catch(() => false),     // fail-safe: assume not blocked
    checkRateLimit(phone, agencyId).catch(() => true), // fail-safe: assume passed
  ]);

  if (!isBypassPhone && isBlocked) {
    writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'blocklist' });
    return;
  }

  if (!isBypassPhone && !passedRateLimit) {
    await sendDirect(creds, waChatId, RATE_LIMITED_MSG);
    writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'rate_limit' });
    return;
  }

  // 3. Sanitize
  const sanitized = sanitizeInput(text);

  // 3.5. Opt-out detection — after sanitize, before injection check
  if (!isBypassPhone && isOptOutMessage(sanitized)) {
    await db.collection('leads').doc(leadId).update({ followUpOptedOut: true });
    await sendDirect(creds, waChatId, OPT_OUT_CONFIRM_MSG);
    db.collection(`leads/${leadId}/messages`).add({
      text: OPT_OUT_CONFIRM_MSG,
      direction: 'outbound',
      senderPhone: 'bot',
      source: 'whatsapp_ai_bot',
      botSentAt: Date.now(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: true,
    }).catch((e) => console.warn('[Pipeline] opt-out log failed:', e.message));
    writeAuditLog(phone, agencyId, 'outbound', OPT_OUT_CONFIRM_MSG, { optOut: true });
    return;
  }

  // 4. Injection detection
  const { isInjection, score } = detectInjection(sanitized);
  if (isInjection) {
    const suspRef = db.collection('whatsapp_suspicious').doc(phone);
    const suspSnap = await suspRef.get();
    const prev = suspSnap.exists ? (suspSnap.data()!.score ?? 0) : 0;
    const newScore = prev + score;

    suspRef.set(
      { phone, agencyId, score: newScore, lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    ).catch((e) => console.warn('[Pipeline] suspicious-set failed:', e.message));

    if (!isBypassPhone && newScore >= 3) {
      await blockPhone(phone, `injection_attempts_score_${newScore}`);
      writeAuditLog(phone, agencyId, 'blocked', text, { reason: 'auto_block_injection', score: newScore });
      return;
    }
    // Never forward injection attempts to Gemini — reply generically and stop.
    await sendDirect(creds, waChatId, 'לא הצלחתי להבין את הבקשה. אשמח לעזור אם תנסח מחדש.');
    writeAuditLog(phone, agencyId, 'blocked', sanitized, { injectionScore: newScore, flagged: true, reason: 'injection_blocked_pre_ai' });
    return;
  } else {
    writeAuditLog(phone, agencyId, 'inbound', sanitized);
  }

  // 5. Security session TTL (rolling 24h — expires 24h after last message, not after creation)
  const session = await getOrCreateSession(phone, agencyId);
  const lastActive = session.lastMessageAt
    ? (session.lastMessageAt as admin.firestore.Timestamp).toMillis()
    : 0;
  const isExpired =
    session.status === 'expired' ||
    (Date.now() - lastActive > SESSION_TTL_MS);

  if (!isBypassPhone && isExpired) {
    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    const agencyPhone = agencyDoc.data()?.phone || agencyDoc.data()?.phoneNumber || '';
    await sendDirect(creds, waChatId, `השיחה פגה. לחידוש פנה ל: ${agencyPhone}`);
    await db.collection('whatsapp_sessions').doc(`${agencyId}_${phone}`).delete();
    return;
  }

  // 6. Delegate to existing AI bot. Property-specific answering + agent
  //    notification (for exclusive listings) live in handleAddressQuery
  //    inside handleWeBotReply — see the rationale at the top of this file.
  await handleWeBotReply(agencyId, leadId, phone, sanitized, geminiApiKey, creds, idMessage, inboundMsgDocId, resendApiKey);
}
