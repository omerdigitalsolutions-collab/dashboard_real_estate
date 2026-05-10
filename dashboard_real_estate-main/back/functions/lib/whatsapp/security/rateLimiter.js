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
exports.checkRateLimit = checkRateLimit;
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const MAX_MSGS_PER_MINUTE_PER_PHONE = 10;
const WINDOW_MS = 60000;
// Global agency-level cap: prevents phone-rotation attacks from flooding Gemini.
// Counts all inbound messages to the agency regardless of phone number.
const MAX_MSGS_PER_HOUR_PER_AGENCY = 500;
const AGENCY_WINDOW_MS = 60 * 60000;
async function checkPhoneLimit(phone) {
    const docRef = db.collection('_rate_limits').doc(`wa_${phone}`);
    const now = Date.now();
    return db.runTransaction(async (tx) => {
        const doc = await tx.get(docRef);
        if (!doc.exists) {
            tx.set(docRef, { count: 1, windowStart: now });
            return true;
        }
        const data = doc.data();
        if (now - data.windowStart > WINDOW_MS) {
            tx.set(docRef, { count: 1, windowStart: now });
            return true;
        }
        if (data.count >= MAX_MSGS_PER_MINUTE_PER_PHONE)
            return false;
        tx.update(docRef, { count: admin.firestore.FieldValue.increment(1) });
        return true;
    });
}
async function checkAgencyLimit(agencyId) {
    const docRef = db.collection('_rate_limits').doc(`agency_${agencyId}`);
    const now = Date.now();
    return db.runTransaction(async (tx) => {
        const doc = await tx.get(docRef);
        if (!doc.exists) {
            tx.set(docRef, { count: 1, windowStart: now });
            return true;
        }
        const data = doc.data();
        if (now - data.windowStart > AGENCY_WINDOW_MS) {
            tx.set(docRef, { count: 1, windowStart: now });
            return true;
        }
        if (data.count >= MAX_MSGS_PER_HOUR_PER_AGENCY)
            return false;
        tx.update(docRef, { count: admin.firestore.FieldValue.increment(1) });
        return true;
    });
}
async function checkRateLimit(phone, agencyId) {
    const checks = [checkPhoneLimit(phone)];
    if (agencyId)
        checks.push(checkAgencyLimit(agencyId));
    const results = await Promise.all(checks);
    return results.every(Boolean);
}
//# sourceMappingURL=rateLimiter.js.map