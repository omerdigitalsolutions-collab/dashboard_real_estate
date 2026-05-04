import * as crypto from 'crypto';

/**
 * Validates the X-Twilio-Signature header to ensure the request came from Twilio.
 * Uses HMAC-SHA1 over the full URL + alphabetically-sorted POST params.
 * Must be called on every inbound Twilio webhook to prevent spoofing.
 */
export function validateTwilioSignature(
    authToken: string,
    url: string,
    params: Record<string, string>,
    signature: string
): boolean {
    if (!signature || !authToken) return false;

    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
        data += key + (params[key] ?? '');
    }

    const hash = crypto.createHmac('sha1', authToken).update(data).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}
