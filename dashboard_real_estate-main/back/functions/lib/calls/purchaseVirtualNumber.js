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
exports.purchaseVirtualNumber = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const smsService_1 = require("../notifications/smsService");
const authGuard_1 = require("../config/authGuard");
const BASE_URL = 'https://europe-west1-homer-crm.cloudfunctions.net';
/**
 * Admin-only callable function to purchase a Twilio phone number and assign
 * it to an agent. Requires Israeli Regulatory Bundle to be pre-approved in
 * the Twilio console before Israeli (+972) numbers can be purchased.
 *
 * Input: { agentId: string; isoCountry?: string; areaCode?: string }
 * Returns: { virtualPhone: string }
 */
exports.purchaseVirtualNumber = (0, https_1.onCall)({ secrets: [smsService_1.twilioAccountSid, smsService_1.twilioAuthToken] }, async (request) => {
    var _a, _b, _c;
    const { agencyId, uid } = await (0, authGuard_1.validateUserAuth)(request);
    // Enforce admin-only
    const userSnap = await admin.firestore().collection('users').doc(uid).get();
    if (((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'רק מנהלי סוכנות יכולים לרכוש מספרים.');
    }
    const { agentId, isoCountry = 'IL', areaCode } = request.data;
    if (!agentId)
        throw new https_1.HttpsError('invalid-argument', 'agentId נדרש.');
    const sid = smsService_1.twilioAccountSid.value();
    const token = smsService_1.twilioAuthToken.value();
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    // 1. Search available numbers
    const searchParams = new URLSearchParams({ VoiceEnabled: 'true' });
    if (areaCode)
        searchParams.set('AreaCode', areaCode);
    const searchRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/${isoCountry}/Local.json?${searchParams}`, { headers: { Authorization: `Basic ${auth}` } });
    if (!searchRes.ok) {
        const err = await searchRes.text();
        console.error('[purchaseVirtualNumber] Search failed:', err);
        throw new https_1.HttpsError('internal', 'לא נמצאו מספרים זמינים. ייתכן שה-Regulatory Bundle עדיין לא אושר.');
    }
    const searchData = await searchRes.json();
    const available = searchData.available_phone_numbers;
    if (!available || available.length === 0) {
        throw new https_1.HttpsError('not-found', 'אין מספרים זמינים באזור זה כרגע.');
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
    const purchaseRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: purchaseBody.toString(),
    });
    if (!purchaseRes.ok) {
        const err = await purchaseRes.text();
        console.error('[purchaseVirtualNumber] Purchase failed:', err);
        throw new https_1.HttpsError('internal', `רכישת המספר נכשלה: ${purchaseRes.status}`);
    }
    // 3. Get agent name for routing table
    const agentSnap = await admin.firestore()
        .collection('users')
        .doc(agentId)
        .get();
    const agentName = (_c = (_b = agentSnap.data()) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : 'סוכן';
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
});
//# sourceMappingURL=purchaseVirtualNumber.js.map