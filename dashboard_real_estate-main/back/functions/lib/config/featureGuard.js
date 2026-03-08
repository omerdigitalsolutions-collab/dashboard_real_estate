"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFeatureAccess = requireFeatureAccess;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("./authGuard");
const db = (0, firestore_1.getFirestore)();
// 2. מיפוי הפיצ'רים למסלולים
const PLAN_FEATURES = {
    starter: [
        'CRM_CORE',
        'WEBOT_CATALOG',
        'PNL_DASHBOARD'
    ],
    boutique: [
        'CRM_CORE',
        'WEBOT_CATALOG',
        'PNL_DASHBOARD',
        'WHATSAPP_AI_BOT',
        'WHATSAPP_BROADCAST',
        'AI_IMPORT_TEXT'
    ],
    pro: [
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
async function requireFeatureAccess(request, requiredFeature) {
    // קודם כל, מוודאים שהמשתמש מחובר ובטוח (שימוש ב-authGuard שיצרנו)
    const user = await (0, authGuard_1.validateUserAuth)(request);
    // שליפת נתוני הסוכנות והמנוי
    const agencyDoc = await db.collection("agencies").doc(user.agencyId).get();
    if (!agencyDoc.exists) {
        throw new https_1.HttpsError("not-found", "Agency record not found.");
    }
    const agencyData = agencyDoc.data();
    const currentPlan = (agencyData === null || agencyData === void 0 ? void 0 : agencyData.planId) || 'starter'; // ברירת מחדל
    const status = (agencyData === null || agencyData === void 0 ? void 0 : agencyData.status) || 'active';
    // טיפול בחסימות מערכת (תשלום נכשל או מנוי מבוטל)
    if (status === 'locked' || status === 'past_due') {
        throw new https_1.HttpsError("permission-denied", "Agency account is locked due to billing issues.");
    }
    // ⭐️ בונוס: טריאל של 7 ימים נותן גישה פתוחה להכל (כדי שיתמכרו ל-AI)
    if (status === 'trialing') {
        return user;
    }
    // בדיקה האם המסלול הנוכחי מכיל את הפיצ'ר המבוקש
    const allowedFeatures = PLAN_FEATURES[currentPlan];
    if (!(allowedFeatures === null || allowedFeatures === void 0 ? void 0 : allowedFeatures.includes(requiredFeature))) {
        throw new https_1.HttpsError("failed-precondition", `Upgrade required. The feature '${requiredFeature}' is not available on the '${currentPlan}' plan.`);
    }
    return user;
}
//# sourceMappingURL=featureGuard.js.map