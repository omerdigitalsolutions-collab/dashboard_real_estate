import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { twilioAccountSid, twilioAuthToken } from '../notifications/smsService';
import { validateUserAuth } from '../config/authGuard';

const BASE_URL = 'https://europe-west1-dashboard-6f9d1.cloudfunctions.net';

/**
 * Admin-only callable function to purchase a Twilio phone number and assign
 * it to an agent. Requires Israeli Regulatory Bundle to be pre-approved in
 * the Twilio console before Israeli (+972) numbers can be purchased.
 *
 * Input: { agentId: string; isoCountry?: string; areaCode?: string }
 * Returns: { virtualPhone: string }
 */
export const purchaseVirtualNumber = onCall(
    { secrets: [twilioAccountSid, twilioAuthToken] },
    async (request) => {
        const { agencyId, uid } = await validateUserAuth(request);

        // Enforce admin-only
        const userSnap = await admin.firestore().collection('users').doc(uid).get();
        if (userSnap.data()?.role !== 'admin') {
            throw new HttpsError('permission-denied', 'רק מנהלי סוכנות יכולים לרכוש מספרים.');
        }

        const { agentId, isoCountry = 'IL', areaCode } = request.data as {
            agentId: string;
            isoCountry?: string;
            areaCode?: string;
        };

        if (!agentId) throw new HttpsError('invalid-argument', 'agentId נדרש.');

        const sid = twilioAccountSid.value();
        const token = twilioAuthToken.value();
        const auth = Buffer.from(`${sid}:${token}`).toString('base64');

        // 1. Search available numbers
        const searchParams = new URLSearchParams({ VoiceEnabled: 'true' });
        if (areaCode) searchParams.set('AreaCode', areaCode);

        const searchRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/${isoCountry}/Local.json?${searchParams}`,
            { headers: { Authorization: `Basic ${auth}` } }
        );

        if (!searchRes.ok) {
            const err = await searchRes.text();
            console.error('[purchaseVirtualNumber] Search failed:', err);
            throw new HttpsError('internal', 'לא נמצאו מספרים זמינים. ייתכן שה-Regulatory Bundle עדיין לא אושר.');
        }

        const searchData = await searchRes.json() as { available_phone_numbers: { phone_number: string }[] };
        const available = searchData.available_phone_numbers;

        if (!available || available.length === 0) {
            throw new HttpsError('not-found', 'אין מספרים זמינים באזור זה כרגע.');
        }

        const chosenNumber = available[0].phone_number;

        // 2. Purchase the number and configure webhooks
        const purchaseBody = new URLSearchParams({
            PhoneNumber: chosenNumber,
            VoiceUrl: `${BASE_URL}/calls-twilioVoiceInbound`,
            VoiceMethod: 'POST',
            StatusCallback: `${BASE_URL}/calls-twilioStatusCallback`,
            StatusCallbackMethod: 'POST',
        });

        const purchaseRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: purchaseBody.toString(),
            }
        );

        if (!purchaseRes.ok) {
            const err = await purchaseRes.text();
            console.error('[purchaseVirtualNumber] Purchase failed:', err);
            throw new HttpsError('internal', `רכישת המספר נכשלה: ${purchaseRes.status}`);
        }

        // 3. Get agent name for routing table
        const agentSnap = await admin.firestore()
            .collection('users')
            .doc(agentId)
            .get();
        const agentName: string = agentSnap.data()?.name ?? 'סוכן';

        // 4. Write routing table + update agent doc
        const db = admin.firestore();
        const batch = db.batch();

        batch.set(db.collection('phones').doc(chosenNumber), {
            agencyId,
            agentId,
            agentName,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        batch.update(db.collection('users').doc(agentId), {
            virtualPhone: chosenNumber,
        });

        await batch.commit();

        console.log(`[purchaseVirtualNumber] ${chosenNumber} assigned to agent ${agentId}`);
        return { virtualPhone: chosenNumber };
    }
);
