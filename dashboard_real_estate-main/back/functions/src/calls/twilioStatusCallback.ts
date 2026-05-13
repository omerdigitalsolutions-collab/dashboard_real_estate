import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { twilioAuthToken } from '../notifications/smsService';
import { validateTwilioSignature } from './utils/validateTwilio';
import { handleMissedCall } from './handleMissedCall';

const BASE_URL = 'https://europe-west1-homer-crm.cloudfunctions.net';

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);

/**
 * Twilio Status Callback — fires when a call's status changes (no-answer, completed, etc.)
 * Also acts as the <Dial> action URL, called after the dialled leg ends.
 *
 * Handles:
 *  - Missed calls → handleMissedCall + increment callsMissed stat
 *  - Completed calls → update duration + increment callsAnswered stat
 */
export const twilioStatusCallback = onRequest(
    { secrets: [twilioAuthToken] },
    async (req, res) => {
        const authToken = twilioAuthToken.value();
        const url = `${BASE_URL}/calls-twilioStatusCallback`;
        const params = req.body as Record<string, string>;
        const signature = (req.headers['x-twilio-signature'] as string) ?? '';

        if (!validateTwilioSignature(authToken, url, params, signature)) {
            res.status(401).send('Unauthorized');
            return;
        }

        const callSid: string = req.body.CallSid;
        const callStatus: string = req.body.CallStatus;
        const callDuration: string = req.body.CallDuration ?? '0';
        const toPhone: string = req.body.To;

        if (!callSid || !callStatus) {
            res.status(200).send('OK');
            return;
        }

        const db = admin.firestore();

        // Resolve routing from phones collection
        const phoneSnap = await db.collection('phones').doc(toPhone).get();
        if (!phoneSnap.exists) {
            res.status(200).send('OK');
            return;
        }

        const { agencyId, agentId } = phoneSnap.data()!;
        const agentRef = db.collection('users').doc(agentId);

        if (MISSED_STATUSES.has(callStatus)) {
            await db.collection('callLogs').doc(callSid).update({
                status: 'missed',
                endedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            await agentRef.update({
                'stats.callsMissed': admin.firestore.FieldValue.increment(1),
            });

            const fromPhone: string = req.body.From ?? req.body.Called ?? '';
            if (fromPhone) {
                await handleMissedCall({ agencyId, agentId, callerPhone: fromPhone, callSid });
            }
        } else if (callStatus === 'completed') {
            const duration = parseInt(callDuration, 10) || 0;

            await db.collection('callLogs').doc(callSid).update({
                status: 'completed',
                duration,
                endedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            await agentRef.update({
                'stats.callsAnswered': admin.firestore.FieldValue.increment(1),
                'stats.totalCallMinutes': admin.firestore.FieldValue.increment(
                    Math.ceil(duration / 60)
                ),
            });
        }

        res.status(200).send('OK');
    }
);
