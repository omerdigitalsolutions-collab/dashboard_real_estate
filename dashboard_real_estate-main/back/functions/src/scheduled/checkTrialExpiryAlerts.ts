import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from 'firebase-admin';
import { sendSystemWhatsappMessage } from "../whatsapp";
import { defineString } from 'firebase-functions/params';

const GREEN_API_MASTER_KEY = defineString('GREEN_API_MASTER_KEY');

export const checkTrialExpiryAlerts = onSchedule({
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

        const expiringAgencies: string[] = [];

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

                await sendSystemWhatsappMessage(adminPhoneForWhatsapp, message, greenApiKey);
                console.log(`[checkTrialExpiryAlerts] Sent alert for ${expiringAgencies.length} agencies.`);
            } else {
                console.warn("[checkTrialExpiryAlerts] GREEN_API_MASTER_KEY is not set.");
            }
        } else {
            console.log("[checkTrialExpiryAlerts] No agencies expiring tomorrow.");
        }
    } catch (error) {
        console.error("[checkTrialExpiryAlerts] Error running expiration scan:", error);
    }
});
