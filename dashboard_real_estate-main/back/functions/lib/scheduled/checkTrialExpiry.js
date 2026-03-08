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
exports.checkTrialExpiry = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const logger = __importStar(require("firebase-functions/logger"));
const db = (0, firestore_1.getFirestore)();
exports.checkTrialExpiry = (0, scheduler_1.onSchedule)({
    schedule: "1 0 * * *", // רץ כל יום ב-00:01
    timeZone: "Asia/Jerusalem",
    memory: "256MiB"
}, async (event) => {
    logger.info("Starting trial expiration check based on activeTrials collection...");
    const now = new Date();
    try {
        // 1. ניגשים לקולקציה החדשה ושולפים רק טריאלים פעילים שהתאריך שלהם עבר
        const trialsRef = db.collection("activeTrials");
        const snapshot = await trialsRef
            .where("status", "==", "active")
            .where("trialEndsAt", "<", now)
            .get();
        if (snapshot.empty) {
            logger.info("No expired trials found today. Exiting.");
            return;
        }
        const batch = db.batch();
        let lockedCount = 0;
        snapshot.forEach((trialDoc) => {
            const trialData = trialDoc.data();
            const agencyId = trialData.agencyId;
            if (!agencyId)
                return;
            // 2. עדכון מסמך הטריאל: סימון שפג תוקפו והוא נוצל (hasUsedTrial)
            batch.update(trialDoc.ref, {
                status: "expired",
                hasUsedTrial: true,
                expiredAt: now.toISOString()
            });
            // 3. עדכון מסמך הסוכנות הראשי: נעילת המערכת ושנמוך מסלול
            const agencyRef = db.collection("agencies").doc(agencyId);
            batch.update(agencyRef, {
                status: "locked",
                "billing.planId": "starter",
                "billing.status": "past_due",
                lockReason: "trial_expired" // optional
            });
            lockedCount++;
            logger.info(`Locked agency ${agencyId} and marked trial as used.`);
        });
        // 4. ביצוע כל העדכונים (לשתי הקולקציות) יחד בצורה בטוחה
        if (lockedCount > 0) {
            await batch.commit();
            logger.info(`Successfully processed ${lockedCount} expired trials.`);
        }
    }
    catch (error) {
        logger.error("Error during trial expiration check:", error);
    }
});
//# sourceMappingURL=checkTrialExpiry.js.map