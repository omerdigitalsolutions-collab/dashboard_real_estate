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
exports.validateTwilioSignature = validateTwilioSignature;
const crypto = __importStar(require("crypto"));
/**
 * Validates the X-Twilio-Signature header to ensure the request came from Twilio.
 * Uses HMAC-SHA1 over the full URL + alphabetically-sorted POST params.
 * Must be called on every inbound Twilio webhook to prevent spoofing.
 */
function validateTwilioSignature(authToken, url, params, signature) {
    var _a;
    if (!signature || !authToken)
        return false;
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
        data += key + ((_a = params[key]) !== null && _a !== void 0 ? _a : '');
    }
    const hash = crypto.createHmac('sha1', authToken).update(data).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}
//# sourceMappingURL=validateTwilio.js.map