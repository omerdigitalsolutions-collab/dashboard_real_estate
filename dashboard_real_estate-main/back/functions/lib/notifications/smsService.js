"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.twilioFromNumber = exports.twilioAuthToken = exports.twilioAccountSid = void 0;
exports.sendSms = sendSms;
const params_1 = require("firebase-functions/params");
exports.twilioAccountSid = (0, params_1.defineSecret)('TWILIO_ACCOUNT_SID');
exports.twilioAuthToken = (0, params_1.defineSecret)('TWILIO_AUTH_TOKEN');
exports.twilioFromNumber = (0, params_1.defineSecret)('TWILIO_FROM_NUMBER');
function toE164Israel(phone) {
    const digits = phone.replace(/\D/g, '');
    if (!digits)
        return null;
    if (digits.startsWith('972'))
        return `+${digits}`;
    if (digits.startsWith('0'))
        return `+972${digits.substring(1)}`;
    if (phone.trim().startsWith('+'))
        return `+${digits}`;
    return `+${digits}`;
}
async function sendSms(toPhone, body) {
    const sid = exports.twilioAccountSid.value();
    const token = exports.twilioAuthToken.value();
    const from = exports.twilioFromNumber.value();
    if (!sid || !token || !from) {
        console.warn('[SMS] Twilio secrets not configured — skipping SMS to', toPhone);
        return false;
    }
    const to = toE164Israel(toPhone);
    if (!to) {
        console.warn('[SMS] Invalid destination phone:', toPhone);
        return false;
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const params = new URLSearchParams({ To: to, From: from, Body: body });
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        if (!res.ok) {
            const err = await res.text();
            console.error(`[SMS] Twilio send failed (${res.status}):`, err);
            return false;
        }
        return true;
    }
    catch (err) {
        console.error('[SMS] Twilio network error:', err);
        return false;
    }
}
//# sourceMappingURL=smsService.js.map