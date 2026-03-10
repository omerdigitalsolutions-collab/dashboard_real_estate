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
exports.checkTrialExpiryAlerts = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const whatsapp_1 = require("../whatsapp");
const params_1 = require("firebase-functions/params");
const GREEN_API_MASTER_KEY = (0, params_1.defineString)('GREEN_API_MASTER_KEY');
exports.checkTrialExpiryAlerts = (0, scheduler_1.onSchedule)({
    schedule: "0 9 * * *", // Runs every day at 9:00 AM UTC
    timeZone: "Asia/Jerusalem"
}, async (event) => {
    try {
        const db = admin.firestore();
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // exactly 24 hours from now
        // Let's create a range for "tomorrow" to catch anything expiring in the next calendar day
        const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);
        const agenciesRef = db.collection("agencies");
        const trialingAgenciesSnapshot = await agenciesRef
            .where("billing.status", "==", "trialing")
            .get();
        if (trialingAgenciesSnapshot.empty) {
            console.log("[checkTrialExpiryAlerts] No trialing agencies found.");
            return;
        }
        const expiringAgencies = [];
        trialingAgenciesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.billing && data.billing.trialEndsAt) {
                const expirationDate = data.billing.trialEndsAt.toDate();
                if (expirationDate >= startOfTomorrow && expirationDate <= endOfTomorrow) {
                    const phone = data.billing.ownerPhone || "לא ידוע";
                    expiringAgencies.push(`- ${data.name || "סוכנות ללא שם"} (טל: ${phone})`);
                }
            }
        });
        if (expiringAgencies.length > 0) {
            const adminPhoneForWhatsapp = "972507706024";
            const greenApiKey = GREEN_API_MASTER_KEY.value();
            if (greenApiKey) {
                let message = `⚠️ *התראת סיום ניסיון חינם מחר!*\n\nהסוכנויות הבאות מסיימות בעוד כ-24 שעות את תקופת הניסיון (7 ימים):\n\n`;
                message += expiringAgencies.join("\n");
                message += `\n\n*זה הזמן להתקשר ולסגור עסקה!* 📞`;
                await (0, whatsapp_1.sendSystemWhatsappMessage)(adminPhoneForWhatsapp, message, greenApiKey);
                console.log(`[checkTrialExpiryAlerts] Sent alert for ${expiringAgencies.length} agencies.`);
            }
            else {
                console.warn("[checkTrialExpiryAlerts] GREEN_API_MASTER_KEY is not set.");
            }
        }
        else {
            console.log("[checkTrialExpiryAlerts] No agencies expiring tomorrow.");
        }
    }
    catch (error) {
        console.error("[checkTrialExpiryAlerts] Error running expiration scan:", error);
    }
});
//# sourceMappingURL=checkTrialExpiryAlerts.js.map