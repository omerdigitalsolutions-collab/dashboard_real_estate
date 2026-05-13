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
exports.twilioStatusCallback = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const smsService_1 = require("../notifications/smsService");
const validateTwilio_1 = require("./utils/validateTwilio");
const handleMissedCall_1 = require("./handleMissedCall");
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
exports.twilioStatusCallback = (0, https_1.onRequest)({ secrets: [smsService_1.twilioAuthToken] }, async (req, res) => {
    var _a, _b, _c, _d;
    const authToken = smsService_1.twilioAuthToken.value();
    const url = `${BASE_URL}/calls-twilioStatusCallback`;
    const params = req.body;
    const signature = (_a = req.headers['x-twilio-signature']) !== null && _a !== void 0 ? _a : '';
    if (!(0, validateTwilio_1.validateTwilioSignature)(authToken, url, params, signature)) {
        res.status(401).send('Unauthorized');
        return;
    }
    const callSid = req.body.CallSid;
    const callStatus = req.body.CallStatus;
    const callDuration = (_b = req.body.CallDuration) !== null && _b !== void 0 ? _b : '0';
    const toPhone = req.body.To;
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
    const { agencyId, agentId } = phoneSnap.data();
    const agentRef = db.collection('users').doc(agentId);
    if (MISSED_STATUSES.has(callStatus)) {
        await db.collection('callLogs').doc(callSid).update({
            status: 'missed',
            endedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await agentRef.update({
            'stats.callsMissed': admin.firestore.FieldValue.increment(1),
        });
        const fromPhone = (_d = (_c = req.body.From) !== null && _c !== void 0 ? _c : req.body.Called) !== null && _d !== void 0 ? _d : '';
        if (fromPhone) {
            await (0, handleMissedCall_1.handleMissedCall)({ agencyId, agentId, callerPhone: fromPhone, callSid });
        }
    }
    else if (callStatus === 'completed') {
        const duration = parseInt(callDuration, 10) || 0;
        await db.collection('callLogs').doc(callSid).update({
            status: 'completed',
            duration,
            endedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await agentRef.update({
            'stats.callsAnswered': admin.firestore.FieldValue.increment(1),
            'stats.totalCallMinutes': admin.firestore.FieldValue.increment(Math.ceil(duration / 60)),
        });
    }
    res.status(200).send('OK');
});
//# sourceMappingURL=twilioStatusCallback.js.map