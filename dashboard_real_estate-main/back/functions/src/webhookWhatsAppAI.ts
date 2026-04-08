/**
 * ─── AI WhatsApp Chatbot & Catalog Generator ─────────────────────────────────
 *
 * Webhook: webhookWhatsAppAI
 *
 * This HTTP Cloud Function is a dedicated AI real estate chatbot endpoint.
 * It is designed to be registered as the webhook URL in Green API for instances
 * that are meant to serve as an automated buyer-facing assistant.
 *
 * Flow:
 *   1. Parse inbound Green API POST and ACK immediately.
 *   2. Resolve which agency owns the Green API instance.
 *   3. Upsert a lead (create if new, retrieve if existing).
 *   4. Use Gemini to extract search criteria from the buyer's message.
 *   5. Query matching active properties from Firestore.
 *   6. Create a shared catalog valid for 7 days.
 *   7. Send a polite Hebrew reply via Green API with the catalog URL.
 *   8. Log both the inbound message and the bot's reply to the lead thread.
 *
 * Required Firebase Secrets (already provisioned):
 *   - GEMINI_API_KEY       → for AI intent extraction
 *   - ENCRYPTION_MASTER_KEY → for decrypting Green API credentials
 *
 * Environment Variable (optional, set via firebase functions:config:set):
 *   - DEFAULT_AGENCY_ID    → fallback agency if resolution fails (set during development)
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { handleWeBotReply } from './handleWeBotReply';
import { syncChatHistory } from './whatsappService';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Firebase Secrets ─────────────────────────────────────────────────────────
// These secrets must be provisioned with:
//   firebase functions:secrets:set GEMINI_API_KEY
//   firebase functions:secrets:set ENCRYPTION_MASTER_KEY
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const masterKey = defineSecret('ENCRYPTION_MASTER_KEY');
const webhookSecret = defineSecret('WAHA_WEBHOOK_SECRET');

const db = admin.firestore();
const REGION = 'europe-west1';
const CATALOG_BASE_URL = 'https://homer.management/catalog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedCriteria {
    city: string | null;
    address: string | null;
    rooms: number | null;
    maxPrice: number | null;
    /** AI-generated Hebrew reply to send to the buyer (catalog URL injected afterwards) */
    replyMessage: string;
    /** True when the buyer asked a business/internal question — no catalog should be generated */
    isOffTopic: boolean;
    /** True when the buyer explicitly asks to speak to a human agent */
    needsHuman: boolean;
}

// ─── Crypto Helpers (mirrors whatsapp.ts — AES-256-CBC) ───────────────────────

const ALGORITHM = 'aes-256-cbc';

function decryptToken(encryptedData: string, ivText: string, secret: string): string {
    const key = crypto
        .createHash('sha256')
        .update(String(secret))
        .digest('base64')
        .substring(0, 32);
    const iv = Buffer.from(ivText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ─── Helper: Get & Decrypt Green API Credentials ─────────────────────────────

interface GreenApiCreds {
    idInstance: string;
    apiTokenInstance: string;
}

async function getGreenApiCredentials(
    agencyId: string,
    secretValue: string
): Promise<GreenApiCreds | null> {
    const doc = await db
        .collection('agencies')
        .doc(agencyId)
        .collection('private_credentials')
        .doc('whatsapp')
        .get();

    if (!doc.exists) return null;
    const data = doc.data()!;
    if (!data.idInstance || !data.encryptedToken || !data.iv) return null;

    try {
        const apiTokenInstance = decryptToken(data.encryptedToken, data.iv, secretValue);
        return { idInstance: data.idInstance, apiTokenInstance };
    } catch (err) {
        console.error(`[AI Bot] Failed to decrypt credentials for agency ${agencyId}`, err);
        return null;
    }
}

// ─── Helper: Normalise Israeli phone ─────────────────────────────────────────
// Converts "972501234567@c.us" → "0501234567" (local Israeli format)
// and back to WA chatId format for sending: "972501234567@c.us"

function normalisePhone(rawSender: string): { localPhone: string; waChatId: string } {
    // rawSender is typically "972XXXXXXXXX@c.us"
    let digits = rawSender.replace(/\D/g, '');
    const waChatId = `${digits}@c.us`;
    // Convert to local Israeli format for Firestore lookups
    if (digits.startsWith('972')) {
        digits = '0' + digits.substring(3);
    }
    return { localPhone: digits, waChatId };
}

// ─── Helper: Resolve agencyId from idInstance ─────────────────────────────────

async function resolveAgencyByInstance(idInstance: string): Promise<string | null> {
    const snap = await db
        .collectionGroup('private_credentials')
        .where('idInstance', '==', idInstance)
        .limit(1)
        .get();

    if (snap.empty) return null;
    return snap.docs[0].ref.parent.parent?.id ?? null;
}

// NOTE: fetchBotConfig, fetchActivePropertiesForRag, extractSearchCriteria
// were moved to handleWeBotReply.ts — this file now delegates the full
// AI pipeline to handleWeBotReply() after resolving credentials.



// ─── Helper: Query Matching Properties ───────────────────────────────────────

async function findMatchingProperties(
    agencyId: string,
    criteria: ExtractedCriteria
): Promise<string[]> {
    try {
        // Fetch all active properties for the agency (same pattern as matchPropertiesForLead)
        const snapshot = await db
            .collection('properties')
            .where('agencyId', '==', agencyId)
            .where('status', '==', 'active')
            .get();

        if (snapshot.empty) {
            return [];
        }

        const allActiveProperties = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Array<Record<string, any>>;

        // Helper to sort and slice results
        const finalizeMatches = (matches: any[]) => {
            matches.sort((a, b) => {
                const aTime = a.createdAt?.toMillis() || 0;
                const bTime = b.createdAt?.toMillis() || 0;
                return bTime - aTime;
            });
            return matches.slice(0, 10).map((m) => m.id);
        };

        // ── PASS 1: Strict Deterministic Matching ──────────────────────────────
        let strictMatches = allActiveProperties.filter((property) => {
            // 1. City Filter
            if (criteria.city) {
                const propCity = (property.city || '').trim().toLowerCase();
                if (propCity !== criteria.city.trim().toLowerCase()) return false;
            }

            // 2. Address/Neighborhood Filter (Substring match)
            if (criteria.address) {
                const searchStr = criteria.address.trim().toLowerCase();
                const matchedAddress = [
                    property.street || '',
                    property.neighborhood || '',
                    property.address || ''
                ].some(val => val.toLowerCase().includes(searchStr));

                if (!matchedAddress) return false;
            }

            // 3. Maximum Price (Strict)
            if (criteria.maxPrice !== null && criteria.maxPrice > 0) {
                if ((property.price ?? Infinity) > criteria.maxPrice) return false;
            }

            // 4. Exact Rooms (Strict)
            if (criteria.rooms !== null && criteria.rooms > 0) {
                if ((property.rooms ?? 0) !== criteria.rooms) return false;
            }

            return true;
        });

        if (strictMatches.length > 0) {
            console.log(`[AI Bot] Found ${strictMatches.length} properties via PASS 1 (Strict).`);
            return finalizeMatches(strictMatches);
        }

        // ── PASS 2: Relaxed "Smart" Matching ───────────────────────────────────
        // Triggered only if PASS 1 yields 0 results.
        // Relaxations: price +20%, rooms ±1, ignore city and address entirely.
        console.log('[AI Bot] PASS 1 failed. Attempting PASS 2 (Relaxed mode: +20% budget, ±1 room, unconstrained region).');

        let relaxedMatches = allActiveProperties.filter((property) => {
            // 1. Budget: up to +20% of the requested maxPrice
            if (criteria.maxPrice !== null && criteria.maxPrice > 0) {
                const expandedMaxPrice = criteria.maxPrice * 1.20;
                if ((property.price ?? Infinity) > expandedMaxPrice) return false;
            }

            // 2. Rooms: exact requested amount, or one less, or one more
            if (criteria.rooms !== null && criteria.rooms > 0) {
                const actualRooms = property.rooms ?? 0;
                const allowedRooms = [criteria.rooms - 1, criteria.rooms, criteria.rooms + 1];
                if (!allowedRooms.includes(actualRooms)) return false;
            }

            // Notice we do NOT check city or address in PASS 2.
            return true;
        });

        if (relaxedMatches.length > 0) {
            console.log(`[AI Bot] Found ${relaxedMatches.length} properties via PASS 2 (Relaxed).`);
            return finalizeMatches(relaxedMatches);
        }

        // ── PASS 3 (Fallback) ──────────────────────────────────────────────────
        console.log('[AI Bot] No matches found in Pass 1 or 2. Using PASS 3 fallback: latest 5 active properties.');
    } catch (err) {
        console.warn('[AI Bot] Property match execution failed, falling back:', err);
    }

    // ── Fallback ────────────────────────────────────────────────────────────
    const fallbackSnap = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();

    return fallbackSnap.docs.map((d) => d.id);
}


// ─── Helper: Send Green API Message ──────────────────────────────────────────

async function sendGreenApiMessage(
    creds: GreenApiCreds,
    waChatId: string,
    message: string
): Promise<void> {
    // ── INJECT YOUR GREEN API CREDENTIALS HERE (loaded from Firestore secrets) ─
    // idInstance and apiTokenInstance come from the agency's private_credentials
    // sub-collection and are decrypted server-side — never exposed to the client.
    // ───────────────────────────────────────────────────────────────────────────
    const sendUrl = `https://7105.api.greenapi.com/waInstance${creds.idInstance}/sendMessage/${creds.apiTokenInstance}`;

    await axios.post(
        sendUrl,
        { chatId: waChatId, message },
        { timeout: 15_000 }
    );
}

// ─── Helper: Upsert Lead ──────────────────────────────────────────────────────

async function upsertLead(
    agencyId: string,
    phone: string
): Promise<{ leadId: string; leadName: string; isNew: boolean; isBotActive: boolean }> {
    const snap = await db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .where('phone', '==', phone)
        .limit(1)
        .get();

    if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        return {
            leadId: docSnap.id,
            leadName: data.name || 'לקוח',
            isNew: false,
            // Default to true for existing leads that pre-date this feature
            isBotActive: data.isBotActive !== false,
        };
    }

    // ── Create a new lead ─────────────────────────────────────────────────────
    const leadRef = db.collection('leads').doc();
    const leadName = 'ליד מוואטסאפ (לא ידוע)';

    await leadRef.set({
        agencyId,
        phone,
        name: leadName,
        type: 'buyer',
        status: 'new',
        source: 'WhatsApp Bot',
        isBotActive: true, // ← Bot starts active for all new WhatsApp leads
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[AI Bot] New lead created: ${leadRef.id} for phone ${phone}`);
    return { leadId: leadRef.id, leadName, isNew: true, isBotActive: true };
}

// ─── Main Cloud Function ──────────────────────────────────────────────────────

/**
 * webhookWhatsAppAI
 *
 * HTTP endpoint — register this URL in your Green API instance settings under:
 *   "Notifications" → "Incoming Messages" webhook URL
 *
 * Deployed URL pattern:
 *   https://europe-west1-<project-id>.cloudfunctions.net/webhookWhatsAppAI
 *
 * This function is intentionally NOT namespaced under the `whatsapp` export group
 * so the URL stays clean and is easy to paste into Green API settings.
 */
export const webhookWhatsAppAI = onRequest(
    {
        region: REGION,
        secrets: [geminiApiKey, masterKey, webhookSecret],
        timeoutSeconds: 300,
        memory: '1GiB'
    },
    async (req, res) => {
        // 1. ACK immediately to prevent Green API retries
        res.status(200).send('OK');

        // 2. Security Validation (Now Optional if not provided by sender)
        const incomingSecret = req.headers['x-webhook-secret'] || req.headers['x-greenapi-webhook-secret'] || '';
        const expectedSecret = webhookSecret.value();

        if (expectedSecret && incomingSecret && incomingSecret !== expectedSecret) {
            console.error(`[Webhook] ❌ AUTH FAILED. Incoming secret doesn't match expected secret.`);
            return;
        }

        if (expectedSecret && !incomingSecret) {
            console.warn(`[Webhook] ⚠️ No secret provided in headers. Proceeding anyway for compatibility, but recommend setting x-webhook-secret in Green API.`);
        }

        try {
            const body = req.body;
            const typeWebhook: string = body?.typeWebhook || body?.event || '';
            const idInstance: string | undefined = body?.idInstance?.toString() || body?.instanceData?.idInstance?.toString();

            console.log(`[Webhook] 📥 Received ${typeWebhook} from instance ${idInstance}`);

            if (!idInstance) {
                console.error(`[Webhook] ❌ Missing idInstance in body. Full body: ${JSON.stringify(body)}`);
                return;
            }

            // 🚨 FILTER: Ignore 'outgoingAPIMessageReceived' to prevent duplicate CRM/Bot logs
            const isRelevant = ['incomingMessageReceived', 'outgoingMessageReceived', 'message'].includes(typeWebhook);
            if (!isRelevant) {
                console.log(`[Webhook] ℹ️ Ignoring irrelevant event type: ${typeWebhook}`);
                return;
            }

            const agencyId = await resolveAgencyByInstance(idInstance);
            if (!agencyId) {
                console.error(`[Webhook] ❌ Could not resolve agency for instance ${idInstance}`);
                return;
            }

            // Extract sender and message data
            const senderData = body?.senderData || {};
            const messageData = body?.messageData || {};
            const chatId: string = senderData.chatId || '';
            const isGroup = chatId.endsWith('@g.us');
            const isOutbound = typeWebhook === 'outgoingMessageReceived';
            const rawSender: string = isOutbound ? (body?.chatData?.chatId || senderData.chatId) : (senderData.sender || chatId);
            const idMessage: string | undefined = body?.idMessage;

            let textMessage: string = messageData.textMessageData?.textMessage || 
                                      messageData.extendedTextMessageData?.text || 
                                      messageData.imageMessageData?.caption || '';

            if (!textMessage) {
                if (messageData.typeMessage === 'imageMessage') textMessage = '[תמונה]';
                else if (messageData.typeMessage === 'videoMessage') textMessage = '[סרטון]';
                else if (messageData.typeMessage === 'audioMessage') textMessage = '[הודעה קולית]';
                else if (messageData.typeMessage === 'fileMessage') textMessage = '[קובץ]';
            }

            if (!rawSender || !textMessage) return;

            const { localPhone, waChatId } = normalisePhone(rawSender);

            // ============================================================================
            // Scenario A: B2B Group Messages (Property Extraction)
            // ============================================================================
            if (isGroup) {
                const agencyDoc = await db.collection('agencies').doc(agencyId).get();
                const monitoredGroupsRaw: any[] = agencyDoc.data()?.whatsappIntegration?.monitoredGroups || [];
                const monitoredGroupIds = monitoredGroupsRaw.map(g => typeof g === 'string' ? g : g.id);

                if (monitoredGroupIds.includes(chatId) && geminiApiKey.value()) {
                    console.log(`[Webhook] Group msg detected in monitored group: ${chatId}`);
                    try {
                        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
                        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
                                externalAgentPhone: localPhone,
                                rawDescription: textMessage,
                                city: parsed.city || null,
                                price: parsed.price || 0,
                                rooms: parsed.rooms || null,
                                type: parsed.type || 'sale',
                                listingType: 'external',
                                status: 'draft',
                                createdAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            console.log(`[Webhook] AI parsed external property from group ${chatId}`);
                        }
                    } catch (e) {
                        console.error('[Webhook] B2B Extraction error:', e);
                    }
                }
                return;
            }

            // ============================================================================
            // Scenario B: Human Reply (Firewall & Logging)
            // ============================================================================
            if (isOutbound) {
                const leadSnap = await db.collection('leads')
                    .where('agencyId', '==', agencyId)
                    .where('phone', '==', localPhone)
                    .limit(1).get();

                if (!leadSnap.empty) {
                    const leadId = leadSnap.docs[0].id;
                    // Auto-mute bot when human takes over
                    await leadSnap.docs[0].ref.update({ isBotActive: false });
                    
                    await db.collection(`leads/${leadId}/messages`).add({
                        idMessage: idMessage || null,
                        text: textMessage,
                        direction: 'outbound',
                        senderPhone: 'human_outbound',
                        source: 'whatsapp_human',
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        isRead: true,
                    });
                    console.log(`[Webhook] Human reply logged for lead ${leadId}. Bot muted.`);
                }
                return;
            }

            // ============================================================================
            // Scenario C: Inbound DM (AI Bot + Lead Processing)
            // ============================================================================
            
            // Idempotency: Skip if message already processed
            if (idMessage) {
                const dupCheck = await db.collectionGroup('messages').where('idMessage', '==', idMessage).limit(1).get();
                if (!dupCheck.empty) return;
            }

            // Upsert lead
            const { leadId, isNew, isBotActive } = await upsertLead(agencyId, localPhone);

            // 🚨 FIX: Mandatory AWAIT for history sync to ensure it completes before function freezes
            if (isNew) {
                const keys = await getGreenApiCredentials(agencyId, masterKey.value());
                if (keys) {
                    console.log(`[Webhook] New lead ${leadId}. Syncing last 10 messages...`);
                    await syncChatHistory(db, agencyId, leadId, localPhone, keys).catch(e => console.error('Sync failed:', e));
                }
            }

            // Log inbound message
            await db.collection(`leads/${leadId}/messages`).add({
                idMessage: idMessage || null,
                text: textMessage,
                direction: 'inbound',
                senderPhone: localPhone,
                source: 'whatsapp_web',
                botMuted: !isBotActive,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isRead: false,
            });

            // Trigger AI Bot reply if active
            if (isBotActive) {
                const greenApiCreds = await getGreenApiCredentials(agencyId, masterKey.value());
                if (greenApiCreds) {
                    await handleWeBotReply(agencyId, leadId, localPhone, textMessage, geminiApiKey.value(), greenApiCreds, idMessage);
                }
            }

        } catch (err) {
            console.error('[Webhook] Fatal error in pipeline:', err);
        }
    }
);
