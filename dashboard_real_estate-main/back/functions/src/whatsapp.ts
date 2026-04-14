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

    // ✅ FIX 1: FieldValue.delete() is NOT allowed inside set({}, {merge:true}).
    //           We use set() for new fields, then update() separately for deletions.
    await db.runTransaction(async (t) => {
      t.set(credsRef, {
        idInstance: instanceId,
        encryptedToken,
        iv,
        assignedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Set only new/updated fields — no FieldValue.delete() here
      t.set(agencyRef, {
        whatsappIntegration: {
          status: 'PENDING_SCAN',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });

      // Separate update() call to safely delete legacy greenApiKeys field
      t.update(agencyRef, {
        greenApiKeys: admin.firestore.FieldValue.delete()
      });

      t.delete(instanceDoc.ref);
    });

    console.log(`[WhatsApp] Allocated new instance ${instanceId} to agency ${agencyId}`);
  }

  // Now fetch the QR code immediately so the frontend only needs ONE call
  const qrUrl = `https://7105.api.greenapi.com/waInstance${instanceId}/qr/${instanceToken}`;
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

    // ✅ FIX 3: Return fetchedAt so the frontend can calculate QR TTL (~20s)
    //           and trigger a refresh before it expires.
    return {
      success: true,
      alreadyConnected: false,
      qrCode: resp.data.message as string,
      fetchedAt: Date.now(),
    };
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
    await axios.get(`https://7105.api.greenapi.com/waInstance${keys.idInstance}/LogOut/${keys.apiTokenInstance}`, { timeout: 10_000 });
    console.log(`[WhatsApp] Logged out instance ${keys.idInstance}`);
  } catch (err: any) {
    console.warn(`[WhatsApp] Failed to cleanly logout instance ${keys.idInstance}:`, err?.message);
    // Continue anyway to recycle it
  }

  // 2. Transaction: Return to pool, remove from private subcollection and agency doc
  // NOTE: FieldValue.delete() is NOT allowed inside set({}, {merge:true}).
  //       We must use update() for fields we want to delete, and set() only for new data.
  try {
    await db.runTransaction(async (t) => {
      // Return plain-text keys to the pool (idInstance as doc ID ensures uniqueness)
      const poolRef = db.collection('available_instances').doc(keys!.idInstance);
      t.set(poolRef, {
        idInstance: keys!.idInstance,
        apiTokenInstance: keys!.apiTokenInstance,
        returnedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Delete the private credentials sub-document
      t.delete(credsRef);

      // Clear the agency doc: update() correctly supports FieldValue.delete()
      t.update(agencyRef, {
        isWhatsappConnected: false,
        whatsappIntegration: admin.firestore.FieldValue.delete(),
        greenApiKeys: admin.firestore.FieldValue.delete()
      });
    });

    console.log(`[WhatsApp] Instance ${keys!.idInstance} successfully returned to pool for agency ${agencyId}`);
    return { success: true, message: 'Disconnected and safely returned instance to pool.' };
  } catch (err: any) {
    console.error('[WhatsApp] Failed to disconnect/recycle instance:', err);
    throw new HttpsError('internal', `Internal error while recycling instance: ${err?.message || 'unknown'}`);
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
    const qrUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/qr/${keys.apiTokenInstance}`;
    try {
      console.log(`[WhatsApp] Fetching Green API QR for instance ${keys.idInstance}...`);
      const resp = await axios.get(qrUrl, { timeout: 40_000 });

      // ✅ FIX 2: Instead of throwing, gracefully handle alreadyLogged
      //           and return a success response — consistent with connectAgencyWhatsApp.
      if (resp.data?.type === 'alreadyLogged') {
        await db.collection('agencies').doc(agencyId).set({
          isWhatsappConnected: true,
          whatsappIntegration: {
            status: 'CONNECTED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        }, { merge: true });
        return { qrCode: null, alreadyConnected: true };
      }

      if (resp.data?.type !== 'qrCode' || !resp.data?.message) {
        throw new HttpsError('internal', `Green API unexpected response: ${JSON.stringify(resp.data)}`);
      }

      await updateStatus(agencyId, 'PENDING_SCAN');

      // ✅ FIX 3: Return fetchedAt timestamp so frontend can manage QR TTL
      return {
        qrCode: resp.data.message as string,
        alreadyConnected: false,
        fetchedAt: Date.now(),
      };
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

      // ✅ FIX 3: Include fetchedAt for WAHA too
      return { qrCode: dataUrl, alreadyConnected: false, fetchedAt: Date.now() };
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

  const statusUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getStateInstance/${keys.apiTokenInstance}`;

  console.log(`[WhatsApp Status Check] Agency: ${agencyId}, Instance: ${keys.idInstance}`);

  try {
    const resp = await axios.get(statusUrl, { timeout: 10_000 });
    const state = resp.data?.stateInstance;
    console.log(`[WhatsApp Status Check] Green API response state: ${state}`);

    let mappedStatus = 'DISCONNECTED';
    if (state === 'authorized') mappedStatus = 'CONNECTED';
    else if (state === 'notAuthorized' || state === 'starting' || state === 'online') mappedStatus = 'PENDING_SCAN';
    else if (state === 'blocked') mappedStatus = 'BLOCKED';

    // Update the agency doc if status changed
    const currentStatus = agencyDoc.data()?.whatsappIntegration?.status;
    if (currentStatus !== mappedStatus) {
      console.log(`[WhatsApp Status Check] Status changing from ${currentStatus} to ${mappedStatus}`);

      if (mappedStatus === 'CONNECTED') {
        // ✅ FIX 4: Fetch and persist the connected phone number when status becomes CONNECTED
        let connectedPhone: string | null = null;
        try {
          const infoUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getWaSettings/${keys.apiTokenInstance}`;
          const infoResp = await axios.get(infoUrl, { timeout: 8_000 });
          // Green API returns the phone in wid field e.g. "972501234567@c.us"
          const rawWid: string = infoResp.data?.wid || '';
          connectedPhone = rawWid.replace('@c.us', '') || null;
          console.log(`[WhatsApp Status Check] Connected phone: ${connectedPhone}`);
        } catch (e) {
          console.warn('[WhatsApp Status Check] Could not fetch connected phone number:', e);
        }

        await db.collection('agencies').doc(agencyId).set({
          isWhatsappConnected: true,
          whatsappIntegration: {
            status: 'CONNECTED',
            connectedPhone, // ← stored for UI display e.g. "+972501234567"
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        }, { merge: true });
      } else {
        await db.collection('agencies').doc(agencyId).set({
          isWhatsappConnected: mappedStatus === 'CONNECTED',
          whatsappIntegration: {
            status: mappedStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        }, { merge: true });
      }
    }

    return { status: mappedStatus, greenApiState: state };
  } catch (err: any) {
    console.warn(`[WhatsApp Status Check] Network/timeout issue: ${err.message}`, err.response?.data);
    return { status: agencyDoc.data()?.whatsappIntegration?.status || 'PENDING_SCAN' };
  }
});

// ─── 3. sendWhatsappMessage ──────────────────────────────────────────────────

import { 
  buildWeBotPrompt, 
  sendWhatsAppMessage, 
  BotConfig, 
  WhatsappIntegration, 
  formatPhoneForGreenAPI,
  syncChatHistory
} from './whatsappService';

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

  const { phone, message, isBroadcast, fileUrl, fileName } = request.data as {
    phone: string;
    message: string;
    isBroadcast?: boolean;
    fileUrl?: string;
    fileName?: string;
  };
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
    if (fileUrl) {
      const sendFileUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/sendFileByUrl/${keys.apiTokenInstance}`;
      await axios.post(sendFileUrl, {
        chatId: toWaId(phone),
        urlFile: fileUrl,
        fileName: fileName || 'file',
        caption: message
      }, { timeout: 20_000 });
      console.log(`[Green API] File message sent to ${phone}`);
    } else {
      const sendUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/sendMessage/${keys.apiTokenInstance}`;
      await axios.post(sendUrl, {
        chatId: toWaId(phone),
        message: message
      }, { timeout: 10_000 });
      console.log(`[Green API] Message sent to ${phone}`);
    }
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
    const sendUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/sendMessage/${keys.apiTokenInstance}`;
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
export const syncLeadChat = onCall({
  region: REGION,
  secrets: [masterKey]
}, async (request) => {
  const { agencyId, leadId, phone } = request.data;
  if (!agencyId || !leadId || !phone) {
    throw new HttpsError('invalid-argument', 'Missing parameters');
  }

  const keys = await getGreenApiCredentials(agencyId, masterKey.value());
  if (!keys?.idInstance || !keys?.apiTokenInstance) {
    throw new HttpsError('failed-precondition', 'WhatsApp is not connected.');
  }

  // Import locally to avoid circular dependencies if any
  const { syncChatHistory } = require('./whatsappService');
  await syncChatHistory(db, agencyId, leadId, phone, keys, 15);
  return { success: true };
});

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
    const contactsUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getContacts/${keys.apiTokenInstance}`;
    const chatsUrl = `https://7105.api.greenapi.com/waInstance${keys.idInstance}/getChats/${keys.apiTokenInstance}`;

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
          const rawId = c.id || c.chatId;
          const isGroup = c.type === 'group' || (rawId && rawId.endsWith('@g.us'));
          if (isGroup && rawId) {
            allGroupsMap.set(rawId, { id: rawId, name: c.name || rawId.split('@')[0] });
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
    const secret = req.headers['x-webhook-secret'] || req.headers['x-greenapi-webhook-secret'] || '';
    const expected = process.env.WAHA_WEBHOOK_SECRET || '';

    if (!expected || secret !== expected) {
      console.error(`Webhook: Unauthorized access attempt. Incoming secret: '${secret}'.`);
      res.status(401).send('Unauthorized');
      return;
    }

    // ACK only after authorization check
    res.status(200).send('OK');
    console.log(`Webhook: Authorized request.`);

    try {

    const body = req.body;
    const typeWebhook: string = body?.typeWebhook || body?.event || '';
    const idMessage: string | undefined = body?.idMessage;

    // Support both Green API and WAHA event formats
    // We now ALSO handle outgoing messages so human replies from phone/web show up in CRM.
    const isRelevantEvent =
      typeWebhook === 'incomingMessageReceived' ||   // Green API Inbound
      typeWebhook === 'outgoingMessageReceived' ||   // Green API Human Outbound
      typeWebhook === 'outgoingAPIMessageReceived' ||// Green API Bot Outbound (for idempotency)
      typeWebhook === 'message';                     // WAHA

    console.log(`Webhook: Received event type '${typeWebhook}'. isRelevantEvent: ${isRelevantEvent}`);

    if (!isRelevantEvent) return;

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

    // For outgoing messages, the recipient is the chatId
    const isOutbound = typeWebhook === 'outgoingMessageReceived' || typeWebhook === 'outgoingAPIMessageReceived';
    const rawSender: string = isOutbound ? (body?.chatData?.chatId || body?.senderData?.chatId) : (senderData.sender || chatId);
    
    // Support various content types for Green API
    let textMessage: string = messageData.textMessageData?.textMessage || '';
    const caption: string = messageData.extendedTextMessageData?.text || 
                         messageData.imageMessageData?.caption || 
                         messageData.videoMessageData?.caption || 
                         messageData.fileMessageData?.caption || '';

    // If it's a media message without text, use a generic label
    if (!textMessage && !caption) {
      if (messageData.typeMessage === 'imageMessage') textMessage = '[תמונה]';
      else if (messageData.typeMessage === 'videoMessage') textMessage = '[סרטון]';
      else if (messageData.typeMessage === 'audioMessage') textMessage = '[הודעה קולית]';
      else if (messageData.typeMessage === 'fileMessage') textMessage = '[קובץ]';
      else if (messageData.typeMessage === 'locationMessage') textMessage = '[מיקום]';
      else if (messageData.typeMessage === 'contactMessage') textMessage = '[איש קשר]';
    } else {
      textMessage = textMessage || caption;
    }

    console.log(`Webhook: Agency ${agencyId} | ChatId: ${chatId} | isGroup: ${isGroup} | Sender: ${rawSender}`);
    if (textMessage) console.log(`Webhook: Message text preview: ${textMessage.substring(0, 50)}...`);

    if (!rawSender || !textMessage) {
      console.log('Webhook: No text content or sender, skipping.');
      return;
    }

    // ── Normalise phone ─────────────────────────────────────────────────────
    let cleanPhone = rawSender.replace('@c.us', '');
    if (cleanPhone.startsWith('972')) cleanPhone = '0' + cleanPhone.substring(3);

    // ── Message handling handled by webhookWhatsAppAI ────────────────────────
  } catch (err) {
    console.error('Webhook fatal error:', err);
  }
});


