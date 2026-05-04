import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { twilioAuthToken } from '../notifications/smsService';
import { validateTwilioSignature } from './utils/validateTwilio';

const BASE_URL = 'https://europe-west1-homer-crm.cloudfunctions.net';

/**
 * TwiML webhook — called synchronously by Twilio when an inbound call arrives.
 * Must respond with XML within 8 seconds.
 *
 * Routing: looks up the called number (req.body.To) in the phones/{number}
 * collection to find the agent and agency — no agencyId in the URL.
 *
 * TwiML strategy:
 *  - <Dial record="record-from-answer-dual"> — stereo recording starts only when
 *    the agent picks up, preventing voicemail recordings from being processed.
 *  - timeout="20" — critical: ensures Twilio hangs up before the carrier voicemail
 *    activates (typically at 25-30s), which would appear as "answered" to Twilio.
 */
export const twilioVoiceInbound = onRequest(
    { secrets: [twilioAuthToken] },
    async (req, res) => {
        const authToken = twilioAuthToken.value();

        // Build the full URL for signature validation
        const url = `${BASE_URL}/calls-twilioVoiceInbound`;
        const params = req.body as Record<string, string>;
        const signature = (req.headers['x-twilio-signature'] as string) ?? '';

        if (!validateTwilioSignature(authToken, url, params, signature)) {
            res.status(401).send('Unauthorized');
            return;
        }

        const toPhone: string = req.body.To;
        const fromPhone: string = req.body.From;
        const callSid: string = req.body.CallSid;

        if (!toPhone || !fromPhone || !callSid) {
            res.set('Content-Type', 'text/xml');
            res.send('<Response><Reject/></Response>');
            return;
        }

        // Route: look up virtual number → agent + agency
        const db = admin.firestore();
        const phoneSnap = await db.collection('phones').doc(toPhone).get();

        if (!phoneSnap.exists) {
            console.warn(`[VoiceInbound] Unknown virtual number: ${toPhone}`);
            res.set('Content-Type', 'text/xml');
            res.send('<Response><Reject/></Response>');
            return;
        }

        const { agencyId, agentId } = phoneSnap.data()!;

        // Fetch agent's real mobile number for Dial
        const agentSnap = await db
            .collection(`agencies/${agencyId}/agents`)
            .doc(agentId)
            .get();
        const realPhone: string | null = agentSnap.data()?.realPhone ?? null;

        // Create initial call log
        await db.collection('callLogs').doc(callSid).set({
            agencyId,
            agentId,
            callSid,
            from: fromPhone,
            to: toPhone,
            status: 'ringing',
            direction: 'inbound',
            duration: null,
            storagePath: null,
            transcription: null,
            summary: null,
            clientName: null,
            leadId: null,
            leadCreated: false,
            missedCallHandled: false,
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            endedAt: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (!realPhone) {
            // No real phone configured — play message and hang up
            const noAgentTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="he-IL">מצטערים, הסוכן אינו זמין כרגע. אנא נסה שנית מאוחר יותר.</Say>
  <Hangup/>
</Response>`;
            res.set('Content-Type', 'text/xml');
            res.send(noAgentTwiml);
            return;
        }

        const recordingCb = `${BASE_URL}/calls-twilioRecordingComplete`;
        const statusCb = `${BASE_URL}/calls-twilioStatusCallback`;

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="record-from-answer-dual"
        timeout="20"
        recordingStatusCallback="${recordingCb}"
        recordingStatusCallbackMethod="POST"
        action="${statusCb}"
        method="POST">
    <Number statusCallbackEvent="initiated ringing answered completed"
            statusCallback="${statusCb}"
            statusCallbackMethod="POST">
      ${realPhone}
    </Number>
  </Dial>
</Response>`;

        res.set('Content-Type', 'text/xml');
        res.send(twiml.trim());
    }
);
