import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
 * and removes it from the pool.
 */
export const connectAgencyWhatsApp = onCall({
  region: REGION,
  cors: true,
  secrets: [masterKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);

  // Check if agency already has keys in the private vault
  const credsRef = db.collection('agencies').doc(agencyId).collection('private_credentials').doc('whatsapp');
  const agencyRef = db.collection('agencies').doc(agencyId);

  try {
    await db.runTransaction(async (t) => {
      const credsDoc = await t.get(credsRef);
      if (credsDoc.exists && credsDoc.data()?.idInstance) {
        throw new HttpsError('already-exists', 'Agency already has an allocated WhatsApp instance.');
      }

      // Find an available instance
      const availableSnap = await t.get(db.collection('available_instances').limit(1));
      if (availableSnap.empty) {
        throw new HttpsError('resource-exhausted', 'No available WhatsApp instances at the moment. Please contact support.');
      }

      const instanceDoc = availableSnap.docs[0];
      const instanceData = instanceDoc.data() as { idInstance: string; apiTokenInstance: string };

      // Encrypt the token
      const { encryptedToken, iv } = encryptToken(instanceData.apiTokenInstance, masterKey.value());

      // Save encrypted credentials to private subcollection
      t.set(credsRef, {
        idInstance: instanceData.idInstance,
        encryptedToken,
        iv,
        assignedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update agency public metadata (remove plain-text keys if any existed, and set status)
      t.set(agencyRef, {
        greenApiKeys: admin.firestore.FieldValue.delete(),
        whatsappIntegration: {
          status: 'PENDING_SCAN', // Force them to scan QR next
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });

      // Remove from pool
      t.delete(instanceDoc.ref);
    });

    return { success: true, message: 'Instance allocated securely.' };
  } catch (err: any) {
    console.error('Failed to allocate instance:', err);
    throw new HttpsError(err.code || 'internal', err.message || 'Failed to allocate instance');
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

  const keys = await getGreenApiCredentials(agencyId, masterKey.value());

  if (!keys?.idInstance || !keys?.apiTokenInstance) {
    throw new HttpsError('not-found', 'No encrypted instance allocated to this agency.');
  }

  // 1. Send LogOut to Green API to clear the current WhatsApp session
  try {
    await axios.get(`https://api.green-api.com/waInstance${keys.idInstance}/LogOut/${keys.apiTokenInstance}`);
    console.log(`[WhatsApp] Logged out instance ${keys.idInstance}`);
  } catch (err: any) {
    console.warn(`[WhatsApp] Failed to cleanly logout instance ${keys.idInstance}:`, err?.message);
    // Continue anyway to recycle it
  }

  // 2. Transaction: Return to pool, remove from private subcollection and agency doc
  try {
    await db.runTransaction(async (t) => {
      // Put plain-text back in pool
      const poolRef = db.collection('available_instances').doc();
      t.set(poolRef, {
        idInstance: keys.idInstance,
        apiTokenInstance: keys.apiTokenInstance,
        returnedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Delete from private subcollection
      t.delete(credsRef);

      // Wipe status from agency doc
      t.set(agencyRef, {
        isWhatsappConnected: false,
        whatsappIntegration: null
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
  secrets: [masterKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in.');

  const agencyId = await getAgencyId(request.auth.uid);
  const keys = await getGreenApiCredentials(agencyId, masterKey.value());

  if (!keys?.idInstance || !keys?.apiTokenInstance) {
    throw new HttpsError('failed-precondition', 'No WhatsApp instance allocated. Call connectAgencyWhatsApp first.');
  }

  const qrUrl = `https://api.green-api.com/waInstance${keys.idInstance}/qr/${keys.apiTokenInstance}`;

  let qrCode: string;
  try {
    const resp = await axios.get(qrUrl, { timeout: 15_000 });

    if (resp.data?.type === 'alreadyLogged') {
      throw new HttpsError('already-exists', 'WhatsApp is already connected. Disconnect first.');
    }
    if (resp.data?.type !== 'qrCode' || !resp.data?.message) {
      throw new HttpsError('internal', `Green API unexpected response: ${JSON.stringify(resp.data)}`);
    }
    qrCode = resp.data.message as string;
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', `Failed to fetch QR: ${err?.message ?? err}`);
  }

  // Ensure status reflects pending scan
  await db.collection('agencies').doc(agencyId).set({
    whatsappIntegration: {
      status: 'PENDING_SCAN',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });

  return { qrCode };
});

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

  const { phone, message } = request.data as { phone: string; message: string };
  if (!phone || !message) throw new HttpsError('invalid-argument', 'phone and message are required.');

  const agencyId = await getAgencyId(request.auth.uid);
  const wa = await getAgencyWhatsApp(agencyId);

  if (!wa || wa.status !== 'connected') {
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

// ─── 4. disconnectWhatsApp ───────────────────────────────────────────────────

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
      console.log('Webhook: No agency found for this instance/session. Ignored.');
      return;
    }

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

    if (!rawSender || !textMessage) return;

    // ── Normalise phone ─────────────────────────────────────────────────────
    let cleanPhone = rawSender.replace('@c.us', '');
    if (cleanPhone.startsWith('972')) cleanPhone = '0' + cleanPhone.substring(3);

    // ============================================================================
    // 1. B2B GROUP MESSAGES (Property Hunting)
    // ============================================================================
    if (isGroup) {
      const propertyKeywords = ['למכירה', 'להשכרה', 'נכס', 'דירה', 'מ"ר', 'חדרים', 'מחיר'];
      const textLower = textMessage.toLowerCase();

      // Basic heuristic: must contain at least two property-related words
      const matches = propertyKeywords.filter(kw => textLower.includes(kw));

      if (matches.length >= 2) {
        // Create draft property
        await db.collection('properties').add({
          agencyId,
          source: 'whatsapp_group',
          groupId: chatId,
          externalAgentPhone: cleanPhone,
          rawDescription: textMessage,
          status: 'draft', // Waiting for manual approval
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Webhook: Parsed draft property from group ${chatId} by ${cleanPhone}`);
      }
      return; // Done with group message
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
