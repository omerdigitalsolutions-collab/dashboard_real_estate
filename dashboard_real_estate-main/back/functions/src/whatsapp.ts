import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireFeatureAccess } from './config/featureGuard';

const masterKey = defineSecret('ENCRYPTION_MASTER_KEY');
const geminiApiKey = defineSecret('GEMINI_API_KEY');

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

// Allowed CORS origins — add your production domain here when deploying
const CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://dashboard-6f9d1.web.app',
  'https://dashboard-6f9d1.firebaseapp.com',
  true, // Allow all origins (for callable functions, the SDK handles auth)
] as const;

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

// ─── Cryptography Helpers (AES-256-CBC) ──────────────────────────────────────

const ALGORITHM = 'aes-256-cbc';

function encryptToken(text: string, secret: string): { encryptedToken: string; iv: string } {
  // Ensure secret is 32 bytes for aes-256
  const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encryptedToken: encrypted, iv: iv.toString('hex') };
}

function decryptToken(encryptedData: string, ivText: string, secret: string): string {
  const key = crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
  const iv = Buffer.from(ivText, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Retrieve and decrypt Green API credentials for an agency */
async function getGreenApiCredentials(agencyId: string, secretValue: string) {
  const doc = await db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp').get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (!data.idInstance || !data.encryptedToken || !data.iv) return null;

  try {
    const apiTokenInstance = decryptToken(data.encryptedToken, data.iv, secretValue);
    return { idInstance: data.idInstance, apiTokenInstance };
  } catch (err) {
    console.error(`[WhatsApp] Failed to decrypt credentials for agency ${agencyId}`, err);
    return null;
  }
}

// ─── Instance Recycling (Business Plan) ──────────────────────────────────────

/**
 * connectAgencyWhatsApp:
 * Pulls an available Green API instance from the `available_instances` pool,
 * encrypts the API token, assigns it to `agencies/{agencyId}/private_credentials/whatsapp`,
 * removes it from the pool, then immediately fetches and returns the QR code.
 *
 * The agency status is set to PENDING_SCAN until the user scans the QR.
 * Only checkWhatsAppStatus (called by the frontend poller) will update it to CONNECTED.
 */
export const connectAgencyWhatsApp = onCall({
  region: REGION,
  cors: true,
  secrets: [masterKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);

  const credsRef = db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp');
  const agencyRef = db.collection('agencies').doc(agencyId);

  // Check if agency already has keys in the private vault
  const credsDoc = await credsRef.get();
  const existingInstance = credsDoc.exists && credsDoc.data()?.idInstance ? credsDoc.data()!.idInstance as string : null;

  // If already CONNECTED in Firestore, block re-allocation
  const agencyDoc = await agencyRef.get();
  const currentStatus = agencyDoc.data()?.whatsappIntegration?.status?.toUpperCase();
  if (currentStatus === 'CONNECTED' && agencyDoc.data()?.isWhatsappConnected === true) {
    throw new HttpsError('already-exists', 'WhatsApp is already connected. Disconnect first.');
  }

  let instanceId: string;
  let instanceToken: string;

  if (existingInstance) {
    // Instance already allocated (PENDING_SCAN state) — reuse it without touching the pool
    console.log(`[WhatsApp] Reusing already-allocated instance ${existingInstance} for agency ${agencyId}`);
    const creds = await getGreenApiCredentials(agencyId, masterKey.value());
    if (!creds?.idInstance || !creds?.apiTokenInstance) {
      throw new HttpsError('internal', 'Could not decrypt existing instance credentials.');
    }
    instanceId = creds.idInstance;
    instanceToken = creds.apiTokenInstance;
  } else {
    // Allocate a new instance from the pool
    const availableSnap = await db.collection('available_instances').limit(1).get();
    if (availableSnap.empty) {
      throw new HttpsError('resource-exhausted', 'No available WhatsApp instances at the moment. Please contact support.');
    }

    const instanceDoc = availableSnap.docs[0];
    const instanceData = instanceDoc.data() as { idInstance: string; apiTokenInstance: string };
    instanceId = instanceData.idInstance;
    instanceToken = instanceData.apiTokenInstance;

    // Encrypt the token
    const { encryptedToken, iv } = encryptToken(instanceToken, masterKey.value());

    // Save credentials and update agency status atomically
    await db.runTransaction(async (t) => {
      t.set(credsRef, {
        idInstance: instanceId,
        encryptedToken,
        iv,
        assignedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      t.set(agencyRef, {
        greenApiKeys: admin.firestore.FieldValue.delete(),
        whatsappIntegration: {
          status: 'PENDING_SCAN',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });
      t.delete(instanceDoc.ref);
    });

    console.log(`[WhatsApp] Allocated new instance ${instanceId} to agency ${agencyId}`);
  }

  // Now fetch the QR code immediately so the frontend only needs ONE call
  const qrUrl = `https://api.green-api.com/waInstance${instanceId}/qr/${instanceToken}`;
  try {
    console.log(`[WhatsApp] Fetching QR for instance ${instanceId}...`);
    const resp = await axios.get(qrUrl, { timeout: 40_000 });

    if (resp.data?.type === 'alreadyLogged') {
      // Instance is already authorised — mark as connected immediately
      await db.collection('agencies').doc(agencyId).set({
        isWhatsappConnected: true,
        whatsappIntegration: {
          status: 'CONNECTED',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      return { success: true, alreadyConnected: true, qrCode: null };
    }

    if (resp.data?.type !== 'qrCode' || !resp.data?.message) {
      throw new HttpsError('internal', `Green API unexpected response: ${JSON.stringify(resp.data)}`);
    }

    return { success: true, alreadyConnected: false, qrCode: resp.data.message as string };
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', `Failed to fetch QR: ${err.message}`);
  }
});

/**
 * disconnectAgencyWhatsApp:
 * Removes keys from private subcollection, decrypts to send /LogOut to Green API, 
 * and puts plain-text keys back in pool.
 */
export const disconnectAgencyWhatsApp = onCall({
  region: REGION,
  cors: true,
  secrets: [masterKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);
  const credsRef = db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp');
  const agencyRef = db.collection('agencies').doc(agencyId);

  let keys = await getGreenApiCredentials(agencyId, masterKey.value());

  const agencyDoc = await agencyRef.get();
  const legacyKeys = agencyDoc.data()?.greenApiKeys;

  // Fallback: If no encrypted keys exist, check if the agency has legacy plain-text keys
  if (!keys && legacyKeys?.idInstance && legacyKeys?.apiTokenInstance) {
    keys = {
      idInstance: legacyKeys.idInstance,
      apiTokenInstance: legacyKeys.apiTokenInstance
    };
  }

  if (!keys?.idInstance || !keys?.apiTokenInstance) {
    // If credentials are already missing but the agency doc still has metadata, clear it anyway
    if (agencyDoc.data()?.whatsappIntegration || legacyKeys) {
      await agencyRef.update({
        isWhatsappConnected: false,
        whatsappIntegration: admin.firestore.FieldValue.delete(),
        greenApiKeys: admin.firestore.FieldValue.delete()
      });
      // CRITICAL: Always delete the private credentials doc to allow reconnecting
      await credsRef.delete();
      return { success: true, message: 'Cleaned up agency metadata and private credentials (keys were missing/invalid).' };
    }
    throw new HttpsError('not-found', 'No encrypted instance allocated to this agency.');
  }

  // 1. Send LogOut to Green API to clear the current WhatsApp session
  try {
    await axios.get(`https://api.green-api.com/waInstance${keys.idInstance}/LogOut/${keys.apiTokenInstance}`, { timeout: 10_000 });
    console.log(`[WhatsApp] Logged out instance ${keys.idInstance}`);
  } catch (err: any) {
    console.warn(`[WhatsApp] Failed to cleanly logout instance ${keys.idInstance}:`, err?.message);
    // Continue anyway to recycle it
  }

  // 2. Transaction: Return to pool, remove from private subcollection and agency doc
  try {
    await db.runTransaction(async (t) => {
      // Put plain-text back in pool, using idInstance as the doc ID for uniqueness
      const poolRef = db.collection('available_instances').doc(keys!.idInstance);
      t.set(poolRef, {
        idInstance: keys!.idInstance,
        apiTokenInstance: keys!.apiTokenInstance,
        returnedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Delete from private subcollection
      t.delete(credsRef);

      // Wipe status and legacy keys from agency doc
      t.set(agencyRef, {
        isWhatsappConnected: false,
        whatsappIntegration: admin.firestore.FieldValue.delete(),
        greenApiKeys: admin.firestore.FieldValue.delete()
      }, { merge: true });
    });

    return { success: true, message: 'Disconnected and safely returned instance to pool.' };
  } catch (err: any) {
    console.error('Failed to disconnect/recycle instance:', err);
    throw new HttpsError('internal', 'Internal error while recycling instance.');
  }
});

// ─── 1. generateWhatsAppQR ───────────────────────────────────────────────────

/**
 * Called by the frontend when the user clicks "Connect WhatsApp" / "Show QR".
 * Requires that `connectAgencyWhatsApp` was called first so the agency has `greenApiKeys`.
 */
export const generateWhatsAppQR = onCall({
  region: REGION,
  cors: true,
  secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY', masterKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);

  // 1. Try Green API Credentials first
  const keys = await getGreenApiCredentials(agencyId, masterKey.value());
  if (keys?.idInstance && keys?.apiTokenInstance) {
    const qrUrl = `https://api.green-api.com/waInstance${keys.idInstance}/qr/${keys.apiTokenInstance}`;
    try {
      console.log(`[WhatsApp] Fetching Green API QR for instance ${keys.idInstance}...`);
      const resp = await axios.get(qrUrl, { timeout: 40_000 });

      if (resp.data?.type === 'alreadyLogged') {
        throw new HttpsError('already-exists', 'WhatsApp is already connected. Disconnect first.');
      }
      if (resp.data?.type !== 'qrCode' || !resp.data?.message) {
        throw new HttpsError('internal', `Green API unexpected response: ${JSON.stringify(resp.data)}`);
      }

      await updateStatus(agencyId, 'PENDING_SCAN');
      return { qrCode: resp.data.message as string };
    } catch (err: any) {
      console.error('[WhatsApp] Green API QR fetch failed:', err.message);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', `Failed to fetch QR from Green API: ${err.message}. Try again or check instance status.`);
    }
  }

  // 2. Try WAHA
  const baseUrl = process.env.WAHA_BASE_URL;
  if (baseUrl) {
    const sessionName = `agency_${agencyId}`;
    const qrUrl = `${baseUrl.replace(/\/$/, '')}/api/${sessionName}/auth/qr`;
    try {
      const headers: any = {};
      if (process.env.WAHA_MASTER_KEY) headers['Authorization'] = `Bearer ${process.env.WAHA_MASTER_KEY}`;

      const resp = await axios.get(qrUrl, { headers, responseType: 'arraybuffer', timeout: 40_000 });
      // WAHA returns a PNG image for QR. We convert it to base64.
      const base64 = Buffer.from(resp.data, 'binary').toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      await updateStatus(agencyId, 'PENDING_SCAN');
      return { qrCode: dataUrl };
    } catch (err: any) {
      console.error('[WhatsApp] WAHA QR fetch failed:', err.message);
      throw new HttpsError('internal', `Failed to fetch QR from WAHA: ${err.message}`);
    }
  }

  throw new HttpsError('failed-precondition', 'No WhatsApp instance allocated. Call connectAgencyWhatsApp first.');
});

async function updateStatus(agencyId: string, status: string) {
  await db.collection('agencies').doc(agencyId).set({
    whatsappIntegration: {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });
}

// ─── 2. checkWhatsAppStatus ──────────────────────────────────────────────────

/**
 * Checks WhatsApp status cleanly reading keys from the dynamically assigned greenApiKeys
 */
export const checkWhatsAppStatus = onCall({
  region: REGION,
  cors: true,
  secrets: [masterKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);
  const agencyDoc = await db.collection('agencies').doc(agencyId).get();
  const keys = await getGreenApiCredentials(agencyId, masterKey.value());

  if (!keys?.idInstance || !keys?.apiTokenInstance) {
    return { status: 'DISCONNECTED' };
  }

  const statusUrl = `https://api.green-api.com/waInstance${keys.idInstance}/getStateInstance/${keys.apiTokenInstance}`;

  try {
    const resp = await axios.get(statusUrl, { timeout: 10_000 });
    const state = resp.data?.stateInstance;

    let mappedStatus = 'DISCONNECTED';
    if (state === 'authorized') mappedStatus = 'CONNECTED';
    else if (state === 'notAuthorized') mappedStatus = 'PENDING_SCAN';

    // Update the agency doc if status changed
    const currentStatus = agencyDoc.data()?.whatsappIntegration?.status;
    if (currentStatus !== mappedStatus) {
      await db.collection('agencies').doc(agencyId).set({
        isWhatsappConnected: mappedStatus === 'CONNECTED',
        whatsappIntegration: {
          status: mappedStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    }

    return { status: mappedStatus, greenApiState: state };
  } catch (err: any) {
    console.warn('Status check network/timeout issue, returning stored state.');
    return { status: agencyDoc.data()?.whatsappIntegration?.status || 'PENDING_SCAN' };
  }
});

// ─── 3. sendWhatsappMessage ──────────────────────────────────────────────────

/**
 * Secure message dispatch. Frontend sends only { phone, message } — never any tokens.
 * The function resolves the agency's WAHA credentials server-side.
 */
export const sendWhatsappMessage = onCall({
  region: REGION,
  cors: true,
  secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY', masterKey]
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const { phone, message, isBroadcast } = request.data as { phone: string; message: string; isBroadcast?: boolean };
  if (!phone || !message) throw new HttpsError('invalid-argument', 'phone and message are required.');

  // Check feature guard if it's a broadcast
  if (isBroadcast) {
    await requireFeatureAccess(request, 'WHATSAPP_BROADCAST');
  }

  const agencyId = await getAgencyId(request.auth.uid);
  const wa = await getAgencyWhatsApp(agencyId);

  if (!wa || wa.status?.toUpperCase() !== 'CONNECTED') {
    throw new HttpsError('failed-precondition', 'WhatsApp is not connected. Please connect first in Settings.');
  }

  // ── Green API mode via dynamic keys ───────────────────────────────────────────────────────
  const keys = await getGreenApiCredentials(agencyId, masterKey.value());
  if (keys?.idInstance && keys?.apiTokenInstance) {
    const sendUrl = `https://api.green-api.com/waInstance${keys.idInstance}/sendMessage/${keys.apiTokenInstance}`;
    await axios.post(sendUrl, {
      chatId: toWaId(phone),
      message: message
    }, { timeout: 10_000 });
    console.log(`[Green API] Message sent to ${phone}`);
    return { success: true };
  }

  throw new HttpsError('failed-precondition', 'Session not found.');
});

/**
 * Raw helper for sending system alerts (from cron jobs, webhooks, etc) 
 * using the Super Admin's GreenAPI credentials directly.
 */
export async function sendSystemWhatsappMessage(phone: string, message: string, masterSecret: string) {
  try {
    // 1. Find the Super Admin agency to use its WhatsApp connection
    const usersSnap = await db.collection('users').where('email', '==', 'omerdigitalsolutions@gmail.com').limit(1).get();
    if (usersSnap.empty) {
      console.error('[System WhatsApp] Could not find Super Admin user.');
      return false;
    }
    const superAdminAgencyId = usersSnap.docs[0].data().agencyId;
    if (!superAdminAgencyId) return false;

    // 2. Fetch the Green API credentials for the Super Admin agency
    const keys = await getGreenApiCredentials(superAdminAgencyId, masterSecret);
    if (!keys?.idInstance || !keys?.apiTokenInstance) {
      console.error('[System WhatsApp] Super Admin WhatsApp is not connected.');
      return false;
    }

    // 3. Send the message
    const sendUrl = `https://api.green-api.com/waInstance${keys.idInstance}/sendMessage/${keys.apiTokenInstance}`;
    await axios.post(sendUrl, {
      chatId: toWaId(phone),
      message: message
    }, { timeout: 10_000 });

    return true;
  } catch (err: any) {
    console.error('[System WhatsApp] Error sending message:', err.message);
    return false;
  }
}

/**
 * 5. getGroups:
 * Fetches the list of all contacts (including groups) and filters for groups.
 */
export const getGroups = onCall({
  region: REGION,
  cors: true,
  secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY', masterKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);

  // 1. Try Green API Credentials first (Instance mode)
  const keys = await getGreenApiCredentials(agencyId, masterKey.value());
  if (keys?.idInstance && keys?.apiTokenInstance) {
    const contactsUrl = `https://api.green-api.com/waInstance${keys.idInstance}/getContacts/${keys.apiTokenInstance}`;
    const chatsUrl = `https://api.green-api.com/waInstance${keys.idInstance}/getChats/${keys.apiTokenInstance}`;

    try {
      console.log(`[WhatsApp] Fetching contacts & chats for agency ${agencyId}...`);

      // Parallel fetch for speed
      const [contactsResp, chatsResp] = await Promise.allSettled([
        axios.get(contactsUrl, { timeout: 15_000 }),
        axios.get(chatsUrl, { timeout: 15_000 })
      ]);

      const allGroupsMap = new Map<string, { id: string, name: string }>();

      // Process Contacts
      if (contactsResp.status === 'fulfilled' && Array.isArray(contactsResp.value.data)) {
        console.log(`[WhatsApp] Contacts fetched: ${contactsResp.value.data.length}`);
        contactsResp.value.data.forEach((c: any) => {
          const isGroup = c.type === 'group' || (c.id && c.id.endsWith('@g.us'));
          if (isGroup && c.id) {
            allGroupsMap.set(c.id, { id: c.id, name: c.name || c.id.split('@')[0] });
          }
        });
      } else if (contactsResp.status === 'rejected') {
        console.error(`[WhatsApp] Contacts fetch failed:`, contactsResp.reason?.message);
      }

      // Process Chats (often contains more recent groups even if unsaved)
      if (chatsResp.status === 'fulfilled' && Array.isArray(chatsResp.value.data)) {
        console.log(`[WhatsApp] Chats fetched: ${chatsResp.value.data.length}`);
        chatsResp.value.data.forEach((c: any) => {
          if (c.chatId?.endsWith('@g.us')) {
            allGroupsMap.set(c.chatId, {
              id: c.chatId,
              name: c.name || c.chatId.split('@')[0]
            });
          }
        });
      } else if (chatsResp.status === 'rejected') {
        console.error(`[WhatsApp] Chats fetch failed:`, chatsResp.reason?.message);
      }

      const groups = Array.from(allGroupsMap.values());
      console.log(`[WhatsApp] Final unique groups count: ${groups.length}`);

      return {
        success: true,
        groups
      };
    } catch (err: any) {
      console.error('[WhatsApp] Green API getGroups failed:', err.message);
      // Fall through...
    }
  }

  // 2. Try WAHA (Session mode)
  const baseUrl = process.env.WAHA_BASE_URL;
  const masterKeyVal = process.env.WAHA_MASTER_KEY;
  if (baseUrl) {
    const sessionName = `agency_${agencyId}`;
    const chatsUrl = `${baseUrl.replace(/\/$/, '')}/api/chats?session=${sessionName}`;
    try {
      const headers: any = {};
      if (masterKeyVal) headers['Authorization'] = `Bearer ${masterKeyVal}`;

      const resp = await axios.get(chatsUrl, { headers, timeout: 20_000 });
      const chats = resp.data;
      if (!Array.isArray(chats)) throw new Error('Invalid format');

      return {
        success: true,
        groups: chats
          .filter((c: any) => c.id?.server === 'g.us' || c.isGroup === true)
          .map((c: any) => ({
            id: c.id?.id || c.id || '',
            name: c.name || c.id?.user || 'קבוצה ללא שם'
          }))
      };
    } catch (err: any) {
      console.error('[WhatsApp] WAHA getGroups failed:', err.message);
    }
  }

  throw new HttpsError('failed-precondition', 'WhatsApp connection details not found.');
});

// ─── 6. disconnectWhatsApp ───────────────────────────────────────────────────

export const disconnectWhatsApp = onCall({
  region: REGION,
  cors: true,
  secrets: ['WAHA_BASE_URL', 'WAHA_MASTER_KEY']
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);

  // Note: True recycling happens in "disconnectAgencyWhatsApp"
  // This just wipes front-end statuses
  await db.collection('agencies').doc(agencyId).set(
    { whatsappIntegration: { status: 'DISCONNECTED', updatedAt: admin.firestore.FieldValue.serverTimestamp() } },
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
export const whatsappWebhook = onRequest({
  region: REGION,
  secrets: ['WAHA_WEBHOOK_SECRET', geminiApiKey]
}, async (req, res) => {
  // Always ACK first to prevent retries
  res.status(200).send('OK');

  try {
    const secret = req.headers['x-webhook-secret'] || req.headers['x-greenapi-webhook-secret'] || '';
    const expected = process.env.WAHA_WEBHOOK_SECRET || '';

    if (!expected || secret !== expected) {
      console.error(`Webhook: Unauthorized access attempt. Incoming secret: '${secret}'.`);
      res.status(401).send('Unauthorized');
      return;
    }

    console.log(`Webhook: Authorized request.`);

    const body = req.body;
    const typeWebhook: string = body?.typeWebhook || body?.event || '';

    // Support both Green API and WAHA event formats
    const isInboundMessage =
      typeWebhook === 'incomingMessageReceived' ||   // Green API
      typeWebhook === 'message';                     // WAHA

    console.log(`Webhook: Received event type '${typeWebhook}'. isInboundMessage: ${isInboundMessage}`);

    if (!isInboundMessage) return;

    // ── Extract idInstance (Green API) or sessionName (WAHA) ─────────────
    const idInstance: string | undefined = body?.idInstance;
    const sessionName: string | undefined = body?.session;

    // ── Find the agency ───────────────────────────────────────────────────
    let agencyId: string | undefined;

    if (idInstance) {
      const snap = await db.collectionGroup('private_credentials')
        .where('idInstance', '==', idInstance)
        .limit(1).get();
      if (!snap.empty) {
        agencyId = snap.docs[0].ref.parent.parent?.id;
      }
    } else if (sessionName) {
      const snap = await db.collection('agencies')
        .where('whatsappIntegration.sessionName', '==', sessionName)
        .limit(1).get();
      if (!snap.empty) agencyId = snap.docs[0].id;
    }

    if (!agencyId) {
      console.log(`Webhook: No agency found for instance ${idInstance} or session ${sessionName}. Ignored.`);
      return;
    }

    const agencyDoc = await db.collection('agencies').doc(agencyId).get();
    const agencyData = agencyDoc.data() || {};
    // Support both old string[] and new {id, name}[] structure
    const monitoredGroupsRaw: any[] = agencyData.whatsappIntegration?.monitoredGroups || [];
    const monitoredGroupIds = monitoredGroupsRaw.map(g => typeof g === 'string' ? g : g.id);

    // ── Extract sender and message text ────────────────────────────────────
    const senderData = body?.senderData || {};
    const messageData = body?.messageData || {};

    // Determine chat type and actual sender
    const chatId: string = senderData.chatId || '';
    const isGroup = chatId.endsWith('@g.us');
    const isDirect = chatId.endsWith('@c.us');

    // Real sender is the person who sent the message (in a group, it's senderData.sender. In direct, it's the chatId itself)
    const rawSender: string = senderData.sender || chatId || '';
    const textMessage: string = messageData.textMessageData?.textMessage || '';
    const idMessage: string | undefined = body?.idMessage;

    console.log(`Webhook: Agency ${agencyId} | ChatId: ${chatId} | isGroup: ${isGroup} | Sender: ${rawSender}`);
    if (textMessage) console.log(`Webhook: Message text preview: ${textMessage.substring(0, 50)}...`);

    if (!rawSender || !textMessage) return;

    // ── Normalise phone ─────────────────────────────────────────────────────
    let cleanPhone = rawSender.replace('@c.us', '');
    if (cleanPhone.startsWith('972')) cleanPhone = '0' + cleanPhone.substring(3);

    // ============================================================================
    // 1. B2B GROUP MESSAGES (Property Hunting)
    // ============================================================================
    if (isGroup) {
      console.log(`Webhook (Group): Checking if ${chatId} is monitored...`);
      console.log(`Webhook (Group): Monitored list -> ${JSON.stringify(monitoredGroupIds)}`);

      if (!monitoredGroupIds.includes(chatId)) {
        console.log(`Webhook (Group): Chat ${chatId} is NOT in the monitored list. Ignoring.`);
        return; // Skip if not a monitored group
      }

      console.log(`Webhook (Group): Chat ${chatId} IS monitored. Proceeding matching logic with Gemini...`);

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error("GEMINI API KEY MISSING for B2B Property Extraction");
        return;
      }


      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `You are a real estate parser for B2B WhatsApp groups in Israel.
Scan this message for property listings (for sale or rent).
If it's NOT a real estate listing (e.g., just chat), return {"isProperty": false}.
If it IS a listing, extract the details. Prices are usually in NIS.
Message: "${textMessage}"

Output strict JSON:
{
  "isProperty": boolean,
  "type": "sale" | "rent",
  "city": string | null,
  "price": number | null,
  "rooms": number | null
}`;
        const result = await model.generateContent(prompt);
        const cleanJson = result.response.text().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (parsed.isProperty) {
          await db.collection('properties').add({
            agencyId,
            source: 'whatsapp_group',
            groupId: chatId,
            externalAgentPhone: cleanPhone,
            rawDescription: textMessage,
            city: parsed.city || null,
            price: parsed.price || 0,
            rooms: parsed.rooms || null,
            type: parsed.type || 'sale',
            listingType: 'external',
            status: 'draft', // Requires manual approval in dashboard
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Webhook: AI parsed external property from group ${chatId} by ${cleanPhone}`);
        }
      } catch (e) {
        console.error('Gemini extraction failed for B2B group message:', e);
      }
      return; // Done
    }

    // ============================================================================
    // 2. DIRECT MESSAGES (Smart Lead Detection)
    // ============================================================================
    if (isDirect) {
      // ── Find existing lead ───────────────────────────────────────────────────
      const leadsSnap = await db.collection('leads')
        .where('agencyId', '==', agencyId)
        .where('phone', '==', cleanPhone)
        .limit(1).get();

      if (leadsSnap.empty) {
        // Unknown number - Use Gemini to scan and summarize
        const apiKey = geminiApiKey.value();
        let aiTriage = { isRealEstateLead: false, summary: '', intent: 'inquiry' as any };

        if (apiKey) {
          try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

            const prompt = `You are a real estate AI triage assistant. Analyze this inbound WhatsApp message.
        Message: "${textMessage}"
        
        Determine if this is a potential real estate lead (buyer, seller, or interested in a property).
        Return ONLY a JSON object:
        {
          "isRealEstateLead": boolean,
          "summary": "a short 3-7 word summary in Hebrew",
          "intent": "buy" | "rent" | "sell" | "inquiry"
        }`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();
            const cleanJson = responseText.replace(/```json|```/g, '').trim();
            aiTriage = JSON.parse(cleanJson);
          } catch (e) {
            console.error('Gemini Triage Error:', e);
            // Fallback to basic keyword check if AI fails
            const leadKeywords = ['נכס', 'דירה', 'מחיר', 'למכירה', 'להשכרה', 'פרטים', 'תיווך'];
            const hasKeyword = leadKeywords.some(kw => textMessage.toLowerCase().includes(kw));
            if (hasKeyword) aiTriage = { isRealEstateLead: true, summary: 'ליד חדש מוואטסאפ (זיהוי מילות מפתח)', intent: 'inquiry' };
          }
        }

        if (!aiTriage.isRealEstateLead) {
          console.log(`Webhook: Ignored spam/irrelevant DM from ${cleanPhone}`);
          return;
        }

        // Check for existing pending lead to avoid duplicates
        const pendingSnap = await db.collection('pending_leads')
          .where('agencyId', '==', agencyId)
          .where('phone', '==', cleanPhone)
          .limit(1).get();

        if (pendingSnap.empty) {
          const expireDate = new Date();
          expireDate.setDate(expireDate.getDate() + 14);
          const expiresAt = admin.firestore.Timestamp.fromDate(expireDate);

          await db.collection('pending_leads').add({
            agencyId,
            phone: cleanPhone,
            initialMessage: textMessage,
            aiSummary: aiTriage.summary,
            aiIntent: aiTriage.intent,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: expiresAt,
          });

          console.log(`Webhook: New pending lead created for ${cleanPhone} (AI Summary: ${aiTriage.summary})`);

          // Create notification for the agency
          await db.collection('alerts').add({
            agencyId,
            targetAgentId: 'all',
            type: 'new_pending_lead',
            title: 'ליד חדש זוהה מ-WhatsApp ✨',
            message: `${aiTriage.summary || 'הודעה חדשה'} ממספר לא מוכר (${cleanPhone}).`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            link: '/dashboard/leads?tab=pending'
          });
        }
        return;
      }

      // Existing lead - save message to their thread
      const leadId = leadsSnap.docs[0].id;

      // ── Idempotency ─────────────────────────────────────────────────────────
      if (idMessage) {
        const dup = await db.collection(`leads/${leadId}/messages`)
          .where('idMessage', '==', idMessage).limit(1).get();
        if (!dup.empty) { console.log('Webhook: duplicate message ignored'); return; }
      }

      await db.collection(`leads/${leadId}/messages`).add({
        idMessage: idMessage || null,
        text: textMessage,
        direction: 'inbound',
        senderPhone: cleanPhone,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: false,
      });

      console.log(`Webhook: message routed to lead ${leadId}`);
    }
  } catch (err) {
    console.error('Webhook fatal error:', err);
  }
});
