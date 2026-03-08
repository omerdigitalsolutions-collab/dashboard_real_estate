import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

export const checkTrialExpiry = onSchedule(
    {
        schedule: "1 0 * * *", // רץ כל יום ב-00:01
        timeZone: "Asia/Jerusalem",
        memory: "256MiB"
    },
    async (event) => {
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

                if (!agencyId) return;

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

        } catch (error) {
            logger.error("Error during trial expiration check:", error);
        }
    }
);
