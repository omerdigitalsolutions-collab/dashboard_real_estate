import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { validateUserAuth, AuthGuardResult } from "./authGuard";

const db = getFirestore();

// 1. הגדרת כל הפיצ'רים במערכת (תואם בדיוק לכרטיסיות התמחור)
export type SystemFeature =
    | 'CRM_CORE'          // לידים, משימות, קנבן, אקסלים, מפה
    | 'WEBOT_CATALOG'     // קטלוגים דיגיטליים ומיני-סייט
    | 'PNL_DASHBOARD'     // מסך דוח רווח והפסד
    | 'WHATSAPP_AI_BOT'   // בוט AI וסינון
    | 'WHATSAPP_BROADCAST'// הודעות תפוצה
    | 'AI_IMPORT_TEXT'    // יבוא נכסים חכם מטקסט
    | 'B2B_SCANNER'       // סריקת קבוצות B2B
    | 'UNLIMITED_USERS'   // משתמשים ללא הגבלה
    | 'MULTIPLE_WA_NUMS'  // ריבוי מספרי ווטסאפ
    | 'ADVANCED_API';     // אינטגרציות API אישיות

// 2. מיפוי הפיצ'רים למסלולים
const PLAN_FEATURES: Record<string, SystemFeature[]> = {
    starter: [
        'CRM_CORE',
        'WEBOT_CATALOG',
        'PNL_DASHBOARD'
    ],
    boutique: [ // using boutique for Pro tier internally as seen on frontend
        'CRM_CORE',
        'WEBOT_CATALOG',
        'PNL_DASHBOARD',
        'WHATSAPP_AI_BOT',
        'WHATSAPP_BROADCAST',
        'AI_IMPORT_TEXT'
    ],
    pro: [ // fallback in case plan is named pro
        'CRM_CORE',
        'WEBOT_CATALOG',
        'PNL_DASHBOARD',
        'WHATSAPP_AI_BOT',
        'WHATSAPP_BROADCAST',
        'AI_IMPORT_TEXT'
    ],
    enterprise: [
        'CRM_CORE',
        'WEBOT_CATALOG',
        'PNL_DASHBOARD',
        'WHATSAPP_AI_BOT',
        'WHATSAPP_BROADCAST',
        'AI_IMPORT_TEXT',
        'B2B_SCANNER',
        'UNLIMITED_USERS',
        'MULTIPLE_WA_NUMS',
        'ADVANCED_API'
    ]
};

/**
 * פונקציית אימות ובדיקת זכאות לפיצ'רים.
 * משמשת לעטיפת כל קריאה לפונקציות השרת.
 */
export async function requireFeatureAccess(request: CallableRequest<any>, requiredFeature: SystemFeature): Promise<AuthGuardResult> {
    // קודם כל, מוודאים שהמשתמש מחובר ובטוח (שימוש ב-authGuard שיצרנו)
    const user = await validateUserAuth(request);

    // שליפת נתוני הסוכנות והמנוי
    const agencyDoc = await db.collection("agencies").doc(user.agencyId).get();

    if (!agencyDoc.exists) {
        throw new HttpsError("not-found", "Agency record not found.");
    }

    const agencyData = agencyDoc.data();
    const currentPlan = agencyData?.planId || 'starter'; // ברירת מחדל
    const status = agencyData?.status || 'active';

    // טיפול בחסימות מערכת (תשלום נכשל או מנוי מבוטל)
    if (status === 'locked' || status === 'past_due') {
        throw new HttpsError("permission-denied", "Agency account is locked due to billing issues.");
    }

    // ⭐️ בונוס: טריאל של 7 ימים נותן גישה פתוחה להכל (כדי שיתמכרו ל-AI)
    if (status === 'trialing') {
        return user;
    }

    // בדיקה האם המסלול הנוכחי מכיל את הפיצ'ר המבוקש
    const allowedFeatures = PLAN_FEATURES[currentPlan];
    if (!allowedFeatures?.includes(requiredFeature)) {
        throw new HttpsError(
            "failed-precondition",
            `Upgrade required. The feature '${requiredFeature}' is not available on the '${currentPlan}' plan.`
        );
    }

    return user;
}
