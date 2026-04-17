/**
 * ─── AI WhatsApp Chatbot & Catalog Generator ─────────────────────────────────
 *
 * Webhook: webhookWhatsAppAI
 *
 * This HTTP Cloud Function is a dedicated AI real estate chatbot endpoint.
 * It is designed to be registered as the webhook URL in Green API for instances
 * that are meant to serve as an automated buyer-facing assistant.
 *
 * flow:
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
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { handleWeBotReply } from './handleWeBotReply';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Firebase Secrets ─────────────────────────────────────────────────────────
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const masterKey = defineSecret('ENCRYPTION_MASTER_KEY');
const webhookSecret = defineSecret('WAHA_WEBHOOK_SECRET');

const db = admin.firestore();
const REGION = 'europe-west1';

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

function normalisePhone(rawSender: string): { localPhone: string; waChatId: string } {
    let digits = rawSender.replace(/\D/g, '');
    const waChatId = `${digits}@c.us`;
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

// ─── Helper: Send Green API Message ──────────────────────────────────────────

async function sendGreenApiMessage(
    creds: GreenApiCreds,
    waChatId: string,
    message: string
): Promise<void> {
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
    phone: string,
    rawName?: string
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
            leadName: data.name || rawName || 'לקוח',
            isNew: false,
            isBotActive: data.isBotActive !== false,
        };
    }

    const leadRef = db.collection('leads').doc();
    const leadName = rawName || 'ליד מוואטסאפ (לא ידוע)';

    await leadRef.set({
        agencyId,
        phone,
        name: leadName,
        type: 'buyer',
        status: 'new',
        source: 'WhatsApp Bot',
        isBotActive: true, 
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[AI Bot] New lead created: ${leadRef.id} for phone ${phone}`);
    return { leadId: leadRef.id, leadName, isNew: true, isBotActive: true };
}

// ─── Main Cloud Function ──────────────────────────────────────────────────────

export const webhookWhatsAppAI = onRequest(
    {
        region: REGION,
        secrets: [geminiApiKey, masterKey, webhookSecret],
        timeoutSeconds: 300,
        memory: '1GiB'
    },
    async (req, res) => {
        // 1. ACK immediately
        res.status(200).send('OK');

        try {
            const body = req.body;
            const typeWebhook: string = body?.typeWebhook || body?.event || '';
            const idInstance: string | undefined = body?.idInstance?.toString() || body?.instanceData?.idInstance?.toString();

            console.log(`[Webhook] 📥 type=${typeWebhook} instance=${idInstance ?? 'undefined'}`);

            if (!idInstance) {
                console.error(`[Webhook] ❌ Missing idInstance. Body keys: ${Object.keys(body || {}).join(',')}`);
                return;
            }

            const isRelevant = ['incomingMessageReceived', 'outgoingMessageReceived', 'message'].includes(typeWebhook);
            if (!isRelevant) {
                console.log(`[Webhook] ⏭️ Skipping irrelevant type: ${typeWebhook}`);
                return;
            }

            // Resolve Agency
            const agencyId = await resolveAgencyByInstance(idInstance);
            if (!agencyId) {
                console.error(`[Webhook] ❌ Could not resolve agency for instance ${idInstance}. Check Firestore indexes and private_credentials docs.`);
                return;
            }
            console.log(`[Webhook] ✅ Resolved agency=${agencyId} for instance=${idInstance}`);

            const agencyDoc = await db.collection('agencies').doc(agencyId).get();
            if (!agencyDoc.exists) return;
            const agencyData = agencyDoc.data()!;
            const newLeadPolicy = agencyData.weBotConfig?.newLeadPolicy || 'auto';

            // Extract data
            const senderData = body?.senderData || {};
            const messageData = body?.messageData || {};
            const chatId: string = senderData.chatId || '';
            const senderName: string = senderData.senderName || '';
            // Exclude groups, broadcast lists, status updates, and WhatsApp channels
            const isGroup = chatId.endsWith('@g.us') || chatId.includes('@broadcast') || chatId.includes('@newsletter');
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
            const { localPhone } = normalisePhone(rawSender);

            // Scenario A: Groups
            if (isGroup) {
                const monitoredGroupsRaw: any[] = agencyData.whatsappIntegration?.monitoredGroups || [];
                const monitoredGroupIds = monitoredGroupsRaw.map(g => typeof g === 'string' ? g : g.id);

                if (monitoredGroupIds.includes(chatId) && geminiApiKey.value()) {
                    try {
                        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
                        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                        const prompt = `You are a real estate listing parser for Israeli B2B WhatsApp agent groups. Extract structured data from the following Hebrew/English message.

Message: "${textMessage}"

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "isProperty": boolean,         // true only if this is a real estate listing
  "type": "sale" | "rent",       // transaction type
  "city": string,                // city name in Hebrew, e.g. "תל אביב"
  "neighborhood": string | null, // neighborhood/area if mentioned
  "street": string | null,       // street name and number if mentioned, e.g. "רחוב הרצל 12"
  "price": number | null,        // numeric price (remove commas/symbols)
  "rooms": number | null,        // number of rooms (can be 2.5, 3, 4 etc.)
  "floor": number | null,        // floor number if mentioned
  "sqm": number | null,          // square meters if mentioned
  "description": string | null   // short summary of notable features (elevator, parking, balcony, condition etc.) in Hebrew
}`;
                        const result = await model.generateContent(prompt);
                        const cleanJson = result.response.text().replace(/```json|```/g, '').trim();
                        const parsed = JSON.parse(cleanJson);

                        if (parsed.isProperty) {
                            const address = [parsed.street, parsed.city].filter(Boolean).join(', ') || parsed.city || null;
                            await db.collection('agencies').doc(agencyId).collection('whatsappProperties').add({
                                agencyId,
                                source: 'whatsapp_group',
                                groupId: chatId,
                                // Agent contact info (sender of the WhatsApp message)
                                externalAgentPhone: localPhone,
                                externalAgentName: senderName || null,
                                rawDescription: textMessage,
                                // Parsed fields
                                address,
                                city: parsed.city || null,
                                neighborhood: parsed.neighborhood || null,
                                street: parsed.street || null,
                                price: parsed.price || 0,
                                rooms: parsed.rooms || null,
                                floor: parsed.floor ?? null,
                                sqm: parsed.sqm ?? null,
                                description: parsed.description || null,
                                type: parsed.type || 'sale',
                                listingType: 'external',
                                isExclusive: false,
                                status: 'draft',
                                createdAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    } catch (e) { console.error('B2B Error:', e); }
                }
                return;
            }

            // Scenario B: Outbound
            if (isOutbound) {
                const leadSnap = await db.collection('leads').where('agencyId', '==', agencyId).where('phone', '==', localPhone).limit(1).get();
                if (!leadSnap.empty) {
                    const leadId = leadSnap.docs[0].id;

                    // Check if this message was already logged by the bot — if so, skip entirely
                    // (Green API fires outgoingMessageReceived for bot-sent messages too)
                    if (idMessage) {
                        const botMsgSnap = await db.collection(`leads/${leadId}/messages`)
                            .where('idMessage', '==', idMessage)
                            .limit(1).get();
                        if (!botMsgSnap.empty) return; // already logged by handleWeBotReply
                    }

                    // This is a human agent sending manually — mute the bot via firewall
                    await leadSnap.docs[0].ref.update({
                        lastHumanReplyAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    await db.collection(`leads/${leadId}/messages`).add({
                        idMessage: idMessage || null,
                        text: textMessage,
                        direction: 'outbound',
                        senderPhone: 'human_outbound',
                        source: 'whatsapp_human',
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        isRead: true,
                    });
                }
                return;
            }

            // Scenario C: Inbound DM
            if (idMessage) {
                const dup = await db.collectionGroup('messages').where('idMessage', '==', idMessage).limit(1).get();
                if (!dup.empty) return;
            }

            const leadSnapCheck = await db.collection('leads').where('agencyId', '==', agencyId).where('phone', '==', localPhone).limit(1).get();

            let leadId: string;
            let isBotActive: boolean;

            if (!leadSnapCheck.empty) {
                leadId = leadSnapCheck.docs[0].id;
                isBotActive = leadSnapCheck.docs[0].data().isBotActive !== false;
            } else {
                // Always create a lead for anyone who messages — never initiate outbound
                const res = await upsertLead(agencyId, localPhone, senderName);
                leadId = res.leadId;
                isBotActive = res.isBotActive;
                // Bot only responds — no syncChatHistory to avoid Green API side effects
            }

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

            if (isBotActive) {
                const creds = await getGreenApiCredentials(agencyId, masterKey.value());
                if (creds) await handleWeBotReply(agencyId, leadId, localPhone, textMessage, geminiApiKey.value(), creds, idMessage);
            }
        } catch (err) { console.error('[Webhook] ❌ Fatal error:', err); }
    }
);
