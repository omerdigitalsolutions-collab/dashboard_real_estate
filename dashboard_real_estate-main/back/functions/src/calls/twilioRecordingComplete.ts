import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { twilioAccountSid, twilioAuthToken } from '../notifications/smsService';
import { validateTwilioSignature } from './utils/validateTwilio';
import { extractLeadDataFromAudio } from '../ai/textToAction';
import { processCallRecording } from './processCallRecording';

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const BASE_URL = 'https://europe-west1-homer-crm.cloudfunctions.net';

/**
 * Twilio Recording Status Callback — fires after a recording is ready.
 * Full pipeline:
 *  1. Download MP3 from Twilio (Basic Auth, no SDK)
 *  2. Upload to Firebase Storage (agencies/{id}/recordings/{callSid}.mp3)
 *  3. Send to Gemini for transcription + lead data extraction
 *  4. Create/update lead via processCallRecording
 *  5. Delete recording from Twilio (privacy + cost)
 *
 * The Storage file is auto-deleted after 30 days via a GCS Lifecycle Rule.
 * The transcription and summary remain in Firestore permanently.
 */
export const twilioRecordingComplete = onRequest(
    {
        secrets: [twilioAccountSid, twilioAuthToken, geminiApiKey],
        timeoutSeconds: 180,
        memory: '512MiB',
    },
    async (req, res) => {
        const sid = twilioAccountSid.value();
        const token = twilioAuthToken.value();
        const apiKey = geminiApiKey.value();
        const auth = Buffer.from(`${sid}:${token}`).toString('base64');

        const url = `${BASE_URL}/calls-twilioRecordingComplete`;
        const params = req.body as Record<string, string>;
        const signature = (req.headers['x-twilio-signature'] as string) ?? '';

        if (!validateTwilioSignature(token, url, params, signature)) {
            res.status(401).send('Unauthorized');
            return;
        }

        const { RecordingUrl, RecordingSid, CallSid } = req.body;

        if (!RecordingUrl || !RecordingSid || !CallSid) {
            res.status(200).send('OK');
            return;
        }

        const db = admin.firestore();

        // Resolve agencyId + agentId + callerPhone from the existing callLog
        const callLogSnap = await db.collection('callLogs').doc(CallSid).get();
        if (!callLogSnap.exists) {
            console.error(`[RecordingComplete] callLog not found for CallSid=${CallSid}`);
            res.status(200).send('OK');
            return;
        }

        const { agencyId, agentId, from: callerPhone } = callLogSnap.data()!;

        try {
            // 1. Download MP3 from Twilio
            const audioRes = await fetch(`${RecordingUrl}.mp3`, {
                headers: { Authorization: `Basic ${auth}` },
            });

            if (!audioRes.ok) {
                throw new Error(
                    `Twilio MP3 download failed: ${audioRes.status} ${await audioRes.text()}`
                );
            }

            const audioArrayBuffer = await audioRes.arrayBuffer();
            const audioBuffer = Buffer.from(audioArrayBuffer);

            // 2. Upload to Firebase Storage (Lifecycle Rule auto-deletes after 30 days)
            const storagePath = `agencies/${agencyId}/recordings/${CallSid}.mp3`;
            const bucket = admin.storage().bucket();
            await bucket.file(storagePath).save(audioBuffer, {
                metadata: {
                    contentType: 'audio/mpeg',
                    metadata: { agencyId, agentId, callSid: CallSid },
                },
            });

            await db.collection('callLogs').doc(CallSid).update({ storagePath });

            // 3. Gemini: transcribe + extract lead data (one pass)
            const audioBase64 = audioBuffer.toString('base64');
            const aiResult = await extractLeadDataFromAudio(audioBase64, 'audio/mpeg', apiKey);

            // 4. Create/update lead
            await processCallRecording({
                agencyId,
                agentId,
                callSid: CallSid,
                aiResult,
                callerPhone,
            });

            // 5. Delete from Twilio (privacy + storage cost)
            const deleteRes = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${RecordingSid}.json`,
                {
                    method: 'DELETE',
                    headers: { Authorization: `Basic ${auth}` },
                }
            );
            if (!deleteRes.ok && deleteRes.status !== 404) {
                console.warn(
                    `[RecordingComplete] Twilio delete warning: ${deleteRes.status}`
                );
            }

            console.log(`[RecordingComplete] CallSid=${CallSid} processed successfully.`);
        } catch (err) {
            console.error('[RecordingComplete] Pipeline error:', err);
            await db.collection('callLogs').doc(CallSid).update({ status: 'failed' }).catch(() => {});
        }

        res.status(200).send('OK');
    }
);
