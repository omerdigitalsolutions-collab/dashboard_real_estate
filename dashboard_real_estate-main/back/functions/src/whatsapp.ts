import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';

/**
 * ─── WhatsApp Managed Architecture (WAHA / Green API) ───────────────────────
 *
 * ALL credentials live server-side only.
 * The frontend never sees apiToken / instanceId / sessionName.
 *
 * Environment variables required (set via `firebase functions:secrets:set`):
 *   WAHA_BASE_URL   – e.g. https://your-waha-server.com or https://api.greenapi.com
 *   WAHA_MASTER_KEY – master Bearer token for WAHA, OR ignored for Green API flow
 *
 * Green API flow  → each agency gets its own idInstance + apiToken stored in Firestore.
 * WAHA flow       → each agency gets a session named `agency_{agencyId}`.
 *
 * This file supports BOTH by detecting `WAHA_MASTER_KEY` presence:
 *   - If present  → WAHA self-hosted (session-based)
 *   - If absent   → Green API (instance-based)
 */

const db = admin.firestore();
const REGION = 'europe-west1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWahaBaseUrl(): string {
  const url = process.env.WAHA_BASE_URL;
  if (!url) throw new HttpsError('internal', 'WAHA_BASE_URL is not configured.');
  return url.replace(/\/$/, '');
}

/** Normalise Israeli phone to international format: 0501234567 → 972501234567@c.us */
function toWaId(phone: string): string {
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return `${clean}@c.us`;
}

/** Resolve agencyId from uid via Firestore */
async function getAgencyId(uid: string): Promise<string> {
  const userDoc = await db.collection('users').doc(uid).get();
  const agencyId = userDoc.data()?.agencyId;
  if (!agencyId) throw new HttpsError('failed-precondition', 'User is not linked to an agency.');
  return agencyId;
}

/** Read WhatsApp integration doc from agency */
async function getAgencyWhatsApp(agencyId: string) {
  const agencyDoc = await db.collection('agencies').doc(agencyId).get();
  return agencyDoc.data()?.whatsappIntegration as Record<string, string> | undefined;
}

// ─── 1. generateWhatsAppQR ───────────────────────────────────────────────────

/**
 * Called by the frontend when the user clicks "Connect WhatsApp".
 * Creates / restarts a WAHA session (or fetches QR from Green API) and
 * returns ONLY the QR code string — never any tokens.
 */
export const generateWhatsAppQR = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);
  const wahaBase = getWahaBaseUrl();
  const masterKey = process.env.WAHA_MASTER_KEY;

  // ── Green API mode (no master key) ───────────────────────────────────────
  if (!masterKey) {
    const wa = await getAgencyWhatsApp(agencyId);
    const idInstance = wa?.idInstance;
    const apiToken = wa?.apiTokenInstance;
    if (!idInstance || !apiToken) {
      throw new HttpsError(
        'failed-precondition',
        'Green API credentials not configured for this agency. Contact support.'
      );
    }

    const url = `${wahaBase}/waInstance${idInstance}/qr/${apiToken}`;
    const resp = await axios.get(url);

    if (resp.data?.type !== 'qrCode') {
      throw new HttpsError('internal', 'Green API did not return a QR code.');
    }

    await db.collection('agencies').doc(agencyId).set(
      { whatsappIntegration: { status: 'pending', updatedAt: admin.firestore.FieldValue.serverTimestamp() } },
      { merge: true }
    );

    return { qrCode: resp.data.message as string };
  }

  // ── WAHA self-hosted mode ─────────────────────────────────────────────────
  const sessionName = `agency_${agencyId}`;

  // Stop existing session silently (ignore errors — might not exist yet)
  try {
    await axios.post(`${wahaBase}/api/sessions/stop`, { name: sessionName }, {
      headers: { Authorization: `Bearer ${masterKey}` }
    });
  } catch (_) { /* ignore */ }

  // Start (or restart) session
  await axios.post(`${wahaBase}/api/sessions/start`, {
    name: sessionName,
    config: { webhooks: [] }   // webhooks configured separately on WAHA side
  }, { headers: { Authorization: `Bearer ${masterKey}` } });

  // Poll for QR (WAHA takes a few seconds to produce it)
  let qrCode: string | null = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const statusResp = await axios.get(`${wahaBase}/api/sessions/${sessionName}/qr`, {
        headers: { Authorization: `Bearer ${masterKey}` }
      });
      if (statusResp.data?.value) {
        qrCode = statusResp.data.value as string;
        break;
      }
    } catch (_) { /* not ready yet */ }
  }

  if (!qrCode) throw new HttpsError('deadline-exceeded', 'QR code took too long to generate. Try again.');

  // Persist session name (not the key!) in Firestore
  await db.collection('agencies').doc(agencyId).set(
    {
      whatsappIntegration: {
        sessionName,
        status: 'pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    },
    { merge: true }
  );

  return { qrCode };
});

// ─── 2. checkWhatsAppStatus ──────────────────────────────────────────────────

/**
 * Polled every 5 sec by the frontend QR modal until status is 'connected'.
 * Updates the agency Firestore doc and returns the current status.
 */
export const checkWhatsAppStatus = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);
  const wa = await getAgencyWhatsApp(agencyId);

  if (!wa) return { status: 'disconnected' };

  const masterKey = process.env.WAHA_MASTER_KEY;

  // ── Green API mode ────────────────────────────────────────────────────────
  if (!masterKey) {
    const idInstance = wa.idInstance;
    const apiToken = wa.apiTokenInstance;
    if (!idInstance || !apiToken) return { status: 'disconnected' };

    const wahaBase = getWahaBaseUrl();
    const resp = await axios.get(
      `${wahaBase}/waInstance${idInstance}/getStateInstance/${apiToken}`
    );
    const state: string = resp.data?.stateInstance || 'notAuthorized';
    const connected = state === 'authorized';

    if (connected && wa.status !== 'connected') {
      await db.collection('agencies').doc(agencyId).set(
        { whatsappIntegration: { status: 'connected', updatedAt: admin.firestore.FieldValue.serverTimestamp() } },
        { merge: true }
      );
    }

    return { status: connected ? 'connected' : wa.status || 'pending' };
  }

  // ── WAHA self-hosted mode ────────────────────────────────────────────────
  const wahaBase = getWahaBaseUrl();
  const sessionName = wa.sessionName;
  if (!sessionName) return { status: 'disconnected' };

  const resp = await axios.get(`${wahaBase}/api/sessions/${sessionName}`, {
    headers: { Authorization: `Bearer ${masterKey}` }
  });

  const rawStatus: string = resp.data?.status || 'STOPPED';
  const connected = ['WORKING', 'CONNECTED', 'AUTHORIZED'].includes(rawStatus.toUpperCase());

  if (connected && wa.status !== 'connected') {
    await db.collection('agencies').doc(agencyId).set(
      { whatsappIntegration: { status: 'connected', updatedAt: admin.firestore.FieldValue.serverTimestamp() } },
      { merge: true }
    );
  }

  return { status: connected ? 'connected' : wa.status || 'pending' };
});

// ─── 3. sendWhatsappMessage ──────────────────────────────────────────────────

/**
 * Secure message dispatch. Frontend sends only { phone, message } — never any tokens.
 * The function resolves the agency's WAHA credentials server-side.
 */
export const sendWhatsappMessage = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const { phone, message } = request.data as { phone: string; message: string };
  if (!phone || !message) throw new HttpsError('invalid-argument', 'phone and message are required.');

  const agencyId = await getAgencyId(request.auth.uid);
  const wa = await getAgencyWhatsApp(agencyId);

  if (!wa || wa.status !== 'connected') {
    throw new HttpsError('failed-precondition', 'WhatsApp is not connected. Please connect first in Settings.');
  }

  const wahaBase = getWahaBaseUrl();
  const masterKey = process.env.WAHA_MASTER_KEY;
  const chatId = toWaId(phone);

  // ── Green API mode ────────────────────────────────────────────────────────
  if (!masterKey) {
    const idInstance = wa.idInstance;
    const apiToken = wa.apiTokenInstance;

    await axios.post(
      `${wahaBase}/waInstance${idInstance}/sendMessage/${apiToken}`,
      { chatId, message }
    );
    return { success: true };
  }

  // ── WAHA self-hosted mode ─────────────────────────────────────────────────
  const sessionName = wa.sessionName;
  if (!sessionName) throw new HttpsError('failed-precondition', 'Session not found.');

  await axios.post(`${wahaBase}/api/sendText`, {
    session: sessionName,
    chatId,
    text: message,
  }, { headers: { Authorization: `Bearer ${masterKey}` } });

  return { success: true };
});

// ─── 4. disconnectWhatsApp ───────────────────────────────────────────────────

export const disconnectWhatsApp = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);
  const wa = await getAgencyWhatsApp(agencyId);

  const masterKey = process.env.WAHA_MASTER_KEY;
  if (masterKey && wa?.sessionName) {
    const wahaBase = getWahaBaseUrl();
    try {
      await axios.post(`${wahaBase}/api/sessions/stop`, { name: wa.sessionName }, {
        headers: { Authorization: `Bearer ${masterKey}` }
      });
    } catch (_) { /* ignore */ }
  }

  await db.collection('agencies').doc(agencyId).set(
    { whatsappIntegration: { status: 'disconnected', updatedAt: admin.firestore.FieldValue.serverTimestamp() } },
    { merge: true }
  );

  return { success: true };
});

// ─── 5. whatsappWebhook ───────────────────────────────────────────────────────

/**
 * Central inbound webhook — receives messages from Green API / WAHA.
 * Set this URL in your WAHA dashboard or in each Green API instance settings.
 *
 * Security: validates X-Webhook-Secret header against WAHA_WEBHOOK_SECRET env var.
 */
export const whatsappWebhook = onRequest({ region: REGION }, async (req, res) => {
  // Always ACK first to prevent retries
  res.status(200).send('OK');

  try {
    const secret = req.headers['x-webhook-secret'] || req.headers['x-greenapi-webhook-secret'];
    if (process.env.WAHA_WEBHOOK_SECRET && secret !== process.env.WAHA_WEBHOOK_SECRET) {
      console.warn('Webhook: Invalid secret header. Request ignored.');
      return;
    }

    const body = req.body;
    const typeWebhook: string = body?.typeWebhook || body?.event || '';

    // Support both Green API and WAHA event formats
    const isInboundMessage =
      typeWebhook === 'incomingMessageReceived' ||   // Green API
      typeWebhook === 'message';                     // WAHA

    if (!isInboundMessage) return;

    // ── Extract idInstance (Green API) or sessionName (WAHA) ─────────────
    const idInstance: string | undefined = body?.idInstance;
    const sessionName: string | undefined = body?.session;

    // ── Find the agency ───────────────────────────────────────────────────
    let agencyId: string | undefined;

    if (idInstance) {
      const snap = await db.collection('agencies')
        .where('whatsappIntegration.idInstance', '==', idInstance)
        .limit(1).get();
      if (!snap.empty) agencyId = snap.docs[0].id;
    } else if (sessionName) {
      const snap = await db.collection('agencies')
        .where('whatsappIntegration.sessionName', '==', sessionName)
        .limit(1).get();
      if (!snap.empty) agencyId = snap.docs[0].id;
    }

    if (!agencyId) {
      console.log('Webhook: No agency found for this instance/session. Ignored.');
      return;
    }

    // ── Extract sender and message text ────────────────────────────────────
    const rawSender: string =
      body?.senderData?.sender ||               // Green API
      body?.payload?.from ||                    // WAHA
      '';

    const textMessage: string =
      body?.messageData?.textMessageData?.textMessage ||  // Green API
      body?.payload?.body ||                              // WAHA
      '';

    const idMessage: string | undefined = body?.idMessage || body?.payload?.id;

    if (!rawSender || !textMessage) return;

    // ── Normalise phone ─────────────────────────────────────────────────────
    let cleanPhone = rawSender.replace('@c.us', '');
    if (cleanPhone.startsWith('972')) cleanPhone = '0' + cleanPhone.substring(3);

    // ── Find lead ───────────────────────────────────────────────────────────
    const leadsSnap = await db.collection('leads')
      .where('agencyId', '==', agencyId)
      .where('phone', '==', cleanPhone)
      .limit(1).get();

    if (leadsSnap.empty) {
      console.log(`Webhook: No lead for phone ${cleanPhone} in agency ${agencyId}`);
      return;
    }
    const leadId = leadsSnap.docs[0].id;

    // ── Idempotency ─────────────────────────────────────────────────────────
    if (idMessage) {
      const dup = await db.collection(`leads/${leadId}/messages`)
        .where('idMessage', '==', idMessage).limit(1).get();
      if (!dup.empty) { console.log('Webhook: duplicate message ignored'); return; }
    }

    // ── Save inbound message ─────────────────────────────────────────────────
    await db.collection(`leads/${leadId}/messages`).add({
      idMessage: idMessage || null,
      text: textMessage,
      direction: 'inbound',
      senderPhone: cleanPhone,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: false,
    });

    console.log(`Webhook: message routed to lead ${leadId}`);
  } catch (err) {
    console.error('Webhook fatal error:', err);
  }
});
