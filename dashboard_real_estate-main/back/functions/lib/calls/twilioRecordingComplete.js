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
exports.twilioRecordingComplete = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const smsService_1 = require("../notifications/smsService");
const validateTwilio_1 = require("./utils/validateTwilio");
const textToAction_1 = require("../ai/textToAction");
const processCallRecording_1 = require("./processCallRecording");
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
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
exports.twilioRecordingComplete = (0, https_1.onRequest)({
    secrets: [smsService_1.twilioAccountSid, smsService_1.twilioAuthToken, geminiApiKey],
    timeoutSeconds: 180,
    memory: '512MiB',
}, async (req, res) => {
    var _a;
    const sid = smsService_1.twilioAccountSid.value();
    const token = smsService_1.twilioAuthToken.value();
    const apiKey = geminiApiKey.value();
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const url = `${BASE_URL}/calls-twilioRecordingComplete`;
    const params = req.body;
    const signature = (_a = req.headers['x-twilio-signature']) !== null && _a !== void 0 ? _a : '';
    if (!(0, validateTwilio_1.validateTwilioSignature)(token, url, params, signature)) {
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
    const { agencyId, agentId, from: callerPhone } = callLogSnap.data();
    try {
        // 1. Download MP3 from Twilio
        const audioRes = await fetch(`${RecordingUrl}.mp3`, {
            headers: { Authorization: `Basic ${auth}` },
        });
        if (!audioRes.ok) {
            throw new Error(`Twilio MP3 download failed: ${audioRes.status} ${await audioRes.text()}`);
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
        const aiResult = await (0, textToAction_1.extractLeadDataFromAudio)(audioBase64, 'audio/mpeg', apiKey);
        // 4. Create/update lead
        await (0, processCallRecording_1.processCallRecording)({
            agencyId,
            agentId,
            callSid: CallSid,
            aiResult,
            callerPhone,
        });
        // 5. Delete from Twilio (privacy + storage cost)
        const deleteRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${RecordingSid}.json`, {
            method: 'DELETE',
            headers: { Authorization: `Basic ${auth}` },
        });
        if (!deleteRes.ok && deleteRes.status !== 404) {
            console.warn(`[RecordingComplete] Twilio delete warning: ${deleteRes.status}`);
        }
        console.log(`[RecordingComplete] CallSid=${CallSid} processed successfully.`);
    }
    catch (err) {
        console.error('[RecordingComplete] Pipeline error:', err);
        await db.collection('callLogs').doc(CallSid).update({ status: 'failed' }).catch(() => { });
    }
    res.status(200).send('OK');
});
//# sourceMappingURL=twilioRecordingComplete.js.map