"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.twilioVoiceInbound = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const smsService_1 = require("../notifications/smsService");
const validateTwilio_1 = require("./utils/validateTwilio");
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
exports.twilioVoiceInbound = (0, https_1.onRequest)({ secrets: [smsService_1.twilioAuthToken] }, async (req, res) => {
    var _a, _b, _c;
    const authToken = smsService_1.twilioAuthToken.value();
    // Build the full URL for signature validation
    const url = `${BASE_URL}/calls-twilioVoiceInbound`;
    const params = req.body;
    const signature = (_a = req.headers['x-twilio-signature']) !== null && _a !== void 0 ? _a : '';
    if (!(0, validateTwilio_1.validateTwilioSignature)(authToken, url, params, signature)) {
        res.status(401).send('Unauthorized');
        return;
    }
    const toPhone = req.body.To;
    const fromPhone = req.body.From;
    const callSid = req.body.CallSid;
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
    const { agencyId, agentId } = phoneSnap.data();
    // Fetch agent's real mobile number for Dial
    const agentSnap = await db
        .collection(`agencies/${agencyId}/agents`)
        .doc(agentId)
        .get();
    const realPhone = (_c = (_b = agentSnap.data()) === null || _b === void 0 ? void 0 : _b.realPhone) !== null && _c !== void 0 ? _c : null;
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
});
//# sourceMappingURL=twilioVoiceInbound.js.map