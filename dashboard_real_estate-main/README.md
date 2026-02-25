# 🏠 hOMER - Real Estate Agency OS

ברוכים הבאים למערכת ניהול סוכנות נדל"ן המתקדמת מבית Omer Digital.
מערכת זו משלבת ניהול לקוחות (CRM), פייפליין עסקאות דינאמי (Kanban), בניית קטלוגים דיגיטליים חכמים, חיבור ל-AI (Gemini), ואינטגרציות WhatsApp ו-Stripe.

## 🏗 ארכיטקטורה וטכנולוגיות

המערכת בנויה בארכיטקטורת Serverless חדישה, בגישת Frontend-First:

*   **Frontend (צד לקוח):** React.js + TypeScript מסביבת Vite.
*   **עיצוב ו-UI:** Tailwind CSS, רכיבי Lucide-react לאייקונים. ספריות متקדמות כמו `react-grid-layout` ו-`@dnd-kit` לממשק הקנבן הייחודי.
*   **Backend (צד שרת):** Firebase צד שרת מלא (Firestore לדאטה-בייס, Firebase Auth, Firebase Storage לתמונות כבדות).
*   **Cloud Functions (פונקציות הליבה v2):** מיקרו-שירותים מבוססי Node.js/TypeScript (למשל: תזמון, גיאו-קוד, Stripe Webhooks, AI, WAHA).

---

## 🚀 הפיצ'רים המרכזיים במערכת

1.  **Dashboard חכם ומותאם אישית:** מיני-יישומים (ווידג'טים) ניתנים לגרירה וסידור אישי, עם סטטיסטיקות פיננסיות, יחס המרה ומשימות פתוחות.
2.  **עמוד נחיתה (Landing Page) מובנה:** חלון ראווה ציבורי עם אנימציות גלילה, מחשבון החזר השקעה (ROI) ותרחישי תמחור המחוברים ישירות ל-Stripe.
3.  **אוטומציית רישום וסליקה (Stripe):** רשיונות ומנויים לסוכנויות נדל"ן מנוהלים אוטומטית. תשלום ב-Stripe Checkout מפעיל Webhook שפותח את סביבת הסוכנות ושולח אימייל ברוכים הבאים.
4.  **מנוע יבוא נתונים מרובה ישויות:** העלאת קבצי אקסל של נכסים, לידים ועסקאות בלחיצה. מנגנון Geocoding אוטומטי במערכת ה-Backend מוצא את הקואורדינטות המדויקות להצגה על המפה.
5.  **יבוא חכם מבוסס AI (Gemini):** הזנת טקסט חופשי או קישור למודעה, והבינה המלאכותית מחלצת את נתוני הנכס (מחיר, חדרים, כתובת, תיאור) לטופס יצירת הנכס.
6.  **WhatsApp Integration (Green API / WAHA):** שליחה וקבלת הודעות ישירות מפרופיל הליד, כולל מערכת בוטים לקליטת לידים נכנסים למערכת באופן אוטומטי מהווטסאפ.
7.  **Webot (קטלוגים שיווקיים ומיני-סייט):** 
    * אלגוריתם שמתאים אוטומטית נכסים קיימים לדרישות הליד.
    * יצירת מיני-סייט פרטי (Catalog) עם תמונות, מחירים וכפתורי **לייק (❤️)** שומר אל מסד הנתונים את הנכסים המועדפים על הקונה.
    * השליחה נעשית בלחיצה אחת מול הווטסאפ של הקונה.
8.  **לוח Super Admin:** דאשבורד נפרד לבעלי המערכת, מציג את כלל הסוכנויות (Agencies) הרשומות, נתוני הכנסות, וניהול נתוני המנויים.

---

## 🔒 מודל אבטחה (Firestore Rules)

*   **Tenant Isolation (הפרדת סביבות):** המודל בנוי כך שכל סוכן יכול בשום אופן לא לגשת לנתונים של סוכנות (Agency) אחרת. 
*   **הרשאות Admin / Agent:** בתוך המשרד, מנהלים יכולים לנהל סוכנים, לייצא נתונים ולשנות הגדרות מערכת, בעוד סוכנים מורשים רק לעבודה השוטפת עם הלידים והעסקאות.
*   **גישה אנונימית לקטלוגים:** המיני-סייטים של הלקוחות (קטלוג) מאובטחים כך שלקוח יכול לקרוא את הקטלוג (עד תפוגת התוקף) ולעדכן בלבד (!) את ה"לייקים" ואת מונה הצפיות ללא צורך בהזדהות.

---

## 💻 פיתוח ופריסה (Deployment)

**הפעלת סביבת פיתוח (Frontend):**
```bash
cd front
npm install
npm run dev
```

**קימפול ופריסת פונקציות שרת (Backend):**
```bash
cd back/functions
npm install
npm run build
firebase deploy --only functions
```

**עדכון חוקי מסד הנתונים או אחסון דגמים:**
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```
