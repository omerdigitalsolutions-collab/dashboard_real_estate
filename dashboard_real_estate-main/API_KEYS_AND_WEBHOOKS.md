# הגדרות מפתחות API, Webhooks ומשתני סביבה (Environment Variables)
מסמך זה מרכז את כל מפתחות ה-API, קישורי ה-Webhooks ומשתני הסביבה שנדרש להגדיר במערכת כדי שכל שירותי צד ג' יעבדו כראוי.

---

## 1. Stripe (סליקה, מנויים והקמת סוכנויות)
מערכת Stripe משמשת לסליקה ולהקמה אוטומטית של משרדים ומשתמשי תשתית כשהם רוכשים מנוי.
* **`STRIPE_SECRET_KEY`**: המפתח הסודי של Stripe (מתחיל ב-`sk_test_` או `sk_live_`). מאפשר לשרת לבצע פעולות מול Stripe.
* **`STRIPE_WEBHOOK_SECRET`**: סוד החתימה של ה-Webhook של Stripe (מתחיל ב-`whsec_`). משמש לאימות שהקריאה אכן הגיעה מ-Stripe.
* **כתובת ה-Webhook להזנה ב-Stripe**:
  ```text
  https://us-central1-dashboard-6f9d1.cloudfunctions.net/stripeWebhook
  ```
  *(יש להאזין לאירוע: `checkout.session.completed`)*

---

## 2. Resend (שליחת אימיילים מתקדמת)
מערכת הרשמה מקבלת את האימייל הזה. משמש בעיקר לשליחת אימייל ברוכים הבאים ואיפוס סיסמה לאחר רכישת מנוי ב-Stripe.
* **`RESEND_API_KEY`**: מפתח ה-API מתוך מערכת Resend (מתחיל ב-`re_`).

---

## 3. Google Gemini (בינה מלאכותית ויבוא נכסים)
משמש להפעלת מנגנון ייבוא נכסים מתקדם, המסוגל לקרוא טקסט חופשי או קישורים ולהפוך אותם לנתוני נכס מובנים.
* **`GEMINI_API_KEY`**: מפתח ה-API מ-Google AI Studio.

---

## 4. Green API / WAHA (חיבור לווטסאפ)
לשליחת וקבלת הודעות ווטסאפ מהלידים. המערכת תומכת ב-Green API או בשרת WAHA בהפעלה עצמית.
* **`WAHA_BASE_URL`**: כתובת השרת (למשל: `https://api.greenapi.com` במקרה של Green API).
* **`WAHA_MASTER_KEY`**: מפתח מאסטר (רלוונטי רק אם השרת בגיבוי עצמי, להשאיר ריק ב-Green API).
* **`WAHA_WEBHOOK_SECRET`**: סוד לבחירתכם (Token) שתוודא שהודעות נכנסות אכן הגיעו ממערכת הווטסאפ שלכם.
* **כתובת ה-Webhook להזנה ב-Green API / WAHA**:
  ```text
  https://europe-west1-dashboard-6f9d1.cloudfunctions.net/whatsapp-whatsappWebhook
  ```

---

## 5. Gmail (הזמנת סוכנים למערכת)
המערכת משתמשת ב-Nodemailer ובחשבון ה-Gmail הראשי כדי לשלוח הזמנות (Invites) לסוכנים חדשים שמנהלי המשרד מוסיפים.
* **`GMAIL_APP_PASSWORD`**: "סיסמת אפליקציה" (App Password) שנוצרה בחשבון ה-Google (omerdigitalsolutions@gmail.com). לא סיסמת החשבון הרגילה! החשבון חייב להיות עם אימות דו-שלבי פעיל.

---

## 6. קליטת לידים מחיצוני (Zapier / Make / Landing Pages)
המערכת מכילה נקודת קצה (Endpoint) ייעודית לקליטת לידים ממקורות חיצוניים אל תוך המערכת.
* **`WEBHOOK_SECRET`**: מחרוזת סודית (Token) **שאתם בוחרים**. חובה לכלול אותה בבקשות נכנסות כדי למנוע יצירת לידים זבל מאנשים לא מורשים.
* **כתובת ה-Webhook להזנה ב-Zapier / Make**:
  ```text
  https://us-central1-dashboard-6f9d1.cloudfunctions.net/leads-webhookReceiveLead
  ```

---

### איך מעדכנים משתני סביבה ב-Firebase?
כל משתנה חסר יגרום לפונקציות לא לעבוד כראוי. כדי להגדיר אותם בצורה בטוחה יש להשתמש ב-CLI של Firebase עם הפקודה הבאה מהטרמינל עבור כל מפתח:

```bash
firebase functions:secrets:set NAME_OF_VARIABLE
```
לדוגמה:
```bash
firebase functions:secrets:set GEMINI_API_KEY
```
