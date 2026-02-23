# 🏠 Omer Digital - Real Estate Agency OS (Webot Engine)

ברוכים הבאים למערכת ניהול סוכנות נדל"ן המתקדמת מבית Omer Digital. 
מערכת זו משלבת ניהול לקוחות (CRM), ניהול מלאי נכסים מקיף, צנרת עסקאות, ויצירת קטלוגים משותפים (Webot) עבור הלקוחות.

## 🏗 ארכיטקטורה וטכנולוגיות

המערכת בנויה בארכיטקטורת Serverless חדישה, בגישת Frontend-First:

*   **Frontend (צד לקוח):** React.js + TypeScript, מתארח ב-Vite.
*   **עיצוב ו-UI:** Tailwind CSS, רכיבי Lucide-react לאייקונים, אנימציות עדינות לעיצוב יוקרתי ונקי. 
*   **Backend (צד שרת):** Firebase (Firestore לדאטה-בייס, Firebase Auth לאימות משתמשים).
*   **Cloud Functions (פונקציות ענן):** פונקציות Node.js/TypeScript המהוות את הלוגיקה והאבטחה הכבדה של המערכת (Server Authority).

---

## 📂 מבנה תיקיות (Структура)

*   `/front` - מכיל את קוד צד הלקוח (React App).
    *   `/src/components` - רכיבי UI קטנים (חלונות קופצים, מתגים, מפות, טבלאות).
    *   `/src/pages` - עמודי המערכת הראשיים (Dashboard, Leads, Properties, Transactions, Agents, Settings, וכו').
    *   `/src/services` - שכבת ה-Data Access מול Firestore (למשל `leadService.ts`, `propertyService.ts`).
    *   `/src/hooks` - לוגיקות מותאמות אישית (Real-time Listeners).
    *   `/src/types` - הגדרות TypeScript.
*   `/back/functions` - קוד צד השרת (Firebase Cloud Functions).
    *   `/src/agencies` - יצירה והנפקת סוכנויות חדשות (Onboarding).
    *   `/src/users` - ניהול סוכנים והרשאות בתוך המשרד.
    *   `/src/properties` - ניהול נכסים, יבוא מ-URL, ושירותי מפות (Geocoding).
    *   `/src/leads` - ניהול לידים, קבלת לידים מ-Webhooks, ואלגוריתם התאמת נכסים.
    *   `/src/catalogs` - פונקציות הקשורות לקטלוגים משותפים (Webot).
    *   `/src/whatsapp` - אינטגרציה עם WhatsApp, הפקת קוד QR ו-Webhooks.
    *   `/src/tasks` & `/src/alerts` - ניהול משימות והתראות מערכת.

---

## ⚡️ Cloud Functions (פונקציות שרת מרכזיות)

הלוגיקה הרגישה לא מבוצעת בקוד הלקוח, אלא מנוהלת בפונקציות ענן מאובטחות (Gen 2):

1.  **Catalogs (`catalogs-generateCatalog`)**: יצירת קטלוג שיווקי משותף ללקוח (Webot) שפג תוקף בעוד 7 ימים.
2.  **Users (`users-inviteAgent`, `users-getInviteInfo`)**: מנגנון חכם להזמנת סוכנים חדשים לסוכנות באמצעות קישור קסם (Magic Link) ומיילים.
3.  **Properties & Leads**: פונקציות לטעינת נתונים בזמן אמת, שמירה מאובטחת תחת ה-`agencyId`, התאמה אוטומטית בין לידים לנכסים (`leads-matchPropertiesForLead`), קבלת לידים מבחוץ וייבוא נכסים מקישורים.
4.  **WhatsApp**: אוטומציות וחיבור לווטסאפ באמצעות סריקת ברקוד QR ו-Webhooks להודעות נכנסות/יוצאות.
5.  **Tasks & Alerts**: אוטומציות לניקוי משימות והקפצת התראות לסוכנים ברחבי הסוכנות לאחר שינויים.

---

## 🔒 מודל אבטחה (Firestore Rules)

קובץ ה-`firestore.rules` מגן על הנתונים ברמת המסד.
המודל בנוי על עיקרון ה-**Tenant Isolation** – כל סוכן שייך ל-`agencyId` ויכול לגשת **אך ורק** לנתונים של הסוכנות שלו.
*   **Catalogs (`shared_catalogs`):** קריאה ציבורית מתאפשרת *רק* אם שדה `expiresAt` גדול מהזמן הנוכחי. (מניעת גישה ללינקים פגי תוקף). כתיבה מתאפשרת רק דרך Cloud Functions.

---

## 🚀 פיתוח ופריסה (Deployment)

**הפעלת סביבת פיתוח (Frontend):**
\`\`\`bash
cd front
npm install
npm run dev
\`\`\`

**קימפול פונקציות שרת (Backend):**
\`\`\`bash
cd back/functions
npm install
npm run build:watch
\`\`\`

*הערה: פריסה לפרודקשן מבוצעת באמצעות `firebase deploy`.*
