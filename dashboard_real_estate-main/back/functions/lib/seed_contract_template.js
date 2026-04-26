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
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
if (!admin.apps.length) {
    const serviceAccount = require('/Users/omerasis/Desktop/dashboard/dashboard_real_estate-main/firebase-key.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'dashboard-6f9d1',
    });
}
const RAW_TEXT = `הסכם למתן שירותי תיווך בלעדיים במקרקעין

תאריך: _______________

1. הצדדים להסכם

מצד אחד, המתווך/הסוכנות (להלן: "המתווך"):

שם הסוכנות: _______________
שם הסוכן: _______________ | מספר רישיון: _______________
כתובת: _______________

ומצד שני, בעל הזכויות בנכס (להלן: "הלקוח"):

שם מלא: _______________ | ת.ז: _______________
טלפון: _______________ | דוא"ל: _______________

2. תיאור הנכס

כתובת: _______________
גוש: _______________ | חלקה: _______________ | תת-חלקה: _______________
תיאור הנכס: _______________ (חדרים, קומה, חניה וכו')
מחיר מבוקש (בערך): _______________

3. תקופת הבלעדיות

א. תקופת הבלעדיות תחל ביום _______________ ותסתיים ביום _______________ (להלן: "תקופת הבלעדיות").
ב. במידה ומדובר בדירת מגורים, תקופת הבלעדיות לא תעלה על 6 חודשים מיום החתימה.

4. דמי התיווך

א. הלקוח מתחייב לשלם למתווך דמי תיווך בשיעור של ___% + מע"מ ממחיר המכירה/השכרה הכולל של הנכס.
ב. דמי התיווך ישולמו מיד עם חתימת הסכם מחייב למכירת/השכרת הנכס.

5. התחייבויות המתווך (פעולות שיווק)

המתווך מתחייב לבצע לפחות שתי פעולות שיווק מתוך הרשימה הבאה (לפי סעיף 9 לחוק המתווכים):
הצבת שלט על הנכס.
פרסום במאגר נכסים ממוחשב.
פרסום בעיתון או באתר אינטרנט רלוונטי.
שיווק באמצעות קטלוג נכסים דיגיטלי (hOMER Catalog).

6. בלעדיות והתחייבויות הלקוח

א. בתקופת הבלעדיות, הלקוח לא יבקש שירותי תיווך ממתווכים אחרים.
ב. הלקוח מתחייב להפנות כל פונה אליו ישירות לשירות למתווך.
ג. דמי התיווך ישולמו גם אם הנכס ייימכר/יושכר בתקופת הבלעדיות שלא באמצעות המתווך.

7. שונות

כל שינוי בהסכם זה ייעשה בלבד בכתב ובחתימת שני הצדדים.

חתימות

חתימת המתווך: _______________

חתימת הלקוח: _______________`;
const TAGGED_TEXT = `הסכם למתן שירותי תיווך בלעדיים במקרקעין

תאריך: {{field_001}}

1. הצדדים להסכם

מצד אחד, המתווך/הסוכנות (להלן: "המתווך"):

שם הסוכנות: {{field_002}}
שם הסוכן: {{field_003}} | מספר רישיון: {{field_004}}
כתובת: {{field_005}}

ומצד שני, בעל הזכויות בנכס (להלן: "הלקוח"):

שם מלא: {{field_006}} | ת.ז: {{field_007}}
טלפון: {{field_008}} | דוא"ל: {{field_009}}

2. תיאור הנכס

כתובת: {{field_010}}
גוש: {{field_011}} | חלקה: {{field_012}} | תת-חלקה: {{field_013}}
תיאור הנכס: {{field_014}} (חדרים, קומה, חניה וכו')
מחיר מבוקש (בערך): {{field_015}}

3. תקופת הבלעדיות

א. תקופת הבלעדיות תחל ביום {{field_016}} ותסתיים ביום {{field_017}} (להלן: "תקופת הבלעדיות").
ב. במידה ומדובר בדירת מגורים, תקופת הבלעדיות לא תעלה על 6 חודשים מיום החתימה.

4. דמי התיווך

א. הלקוח מתחייב לשלם למתווך דמי תיווך בשיעור של {{field_018}}% + מע"מ ממחיר המכירה/השכרה הכולל של הנכס.
ב. דמי התיווך ישולמו מיד עם חתימת הסכם מחייב למכירת/השכרת הנכס.

5. התחייבויות המתווך (פעולות שיווק)

המתווך מתחייב לבצע לפחות שתי פעולות שיווק מתוך הרשימה הבאה (לפי סעיף 9 לחוק המתווכים):
הצבת שלט על הנכס.
פרסום במאגר נכסים ממוחשב.
פרסום בעיתון או באתר אינטרנט רלוונטי.
שיווק באמצעות קטלוג נכסים דיגיטלי (hOMER Catalog).

6. בלעדיות והתחייבויות הלקוח

א. בתקופת הבלעדיות, הלקוח לא יבקש שירותי תיווך ממתווכים אחרים.
ב. הלקוח מתחייב להפנות כל פונה אליו ישירות לשירות למתווך.
ג. דמי התיווך ישולמו גם אם הנכס ייימכר/יושכר בתקופת הבלעדיות שלא באמצעות המתווך.

7. שונות

כל שינוי בהסכם זה ייעשה בלבד בכתב ובחתימת שני הצדדים.

חתימות

חתימת המתווך: {{field_019}}

חתימת הלקוח: {{field_020}}`;
const FIELDS_METADATA = [
    { id: 'field_001', label: 'תאריך החוזה', type: 'date', role: 'agent', required: true },
    { id: 'field_002', label: 'שם הסוכנות', type: 'text', role: 'agent', required: true },
    { id: 'field_003', label: 'שם הסוכן', type: 'text', role: 'agent', required: true },
    { id: 'field_004', label: 'מספר רישיון', type: 'text', role: 'agent', required: true },
    { id: 'field_005', label: 'כתובת הסוכנות', type: 'text', role: 'agent', required: false },
    { id: 'field_006', label: 'שם מלא של הלקוח', type: 'text', role: 'client', required: true, mappingTarget: 'lead.name' },
    { id: 'field_007', label: 'תעודת זהות', type: 'text', role: 'client', required: true },
    { id: 'field_008', label: 'טלפון', type: 'text', role: 'client', required: true, mappingTarget: 'lead.phone' },
    { id: 'field_009', label: 'דוא"ל', type: 'text', role: 'client', required: false },
    { id: 'field_010', label: 'כתובת הנכס', type: 'text', role: 'agent', required: true, mappingTarget: 'property.address.fullAddress' },
    { id: 'field_011', label: 'גוש', type: 'text', role: 'agent', required: false },
    { id: 'field_012', label: 'חלקה', type: 'text', role: 'agent', required: false },
    { id: 'field_013', label: 'תת-חלקה', type: 'text', role: 'agent', required: false },
    { id: 'field_014', label: 'תיאור הנכס', type: 'text', role: 'agent', required: false },
    { id: 'field_015', label: 'מחיר מבוקש', type: 'text', role: 'agent', required: true, mappingTarget: 'property.financials.price' },
    { id: 'field_016', label: 'תחילת בלעדיות', type: 'date', role: 'agent', required: true },
    { id: 'field_017', label: 'סיום בלעדיות', type: 'date', role: 'agent', required: true },
    { id: 'field_018', label: 'אחוז עמלה', type: 'text', role: 'agent', required: true, mappingTarget: 'deal.projectedCommission' },
    { id: 'field_019', label: 'חתימת המתווך', type: 'signature', role: 'agent', required: true },
    { id: 'field_020', label: 'חתימת הלקוח', type: 'signature', role: 'client', required: true },
];
async function seed() {
    const db = admin.firestore();
    // Find the first agency
    const agenciesSnap = await db.collection('agencies').limit(1).get();
    if (agenciesSnap.empty) {
        console.error('No agencies found. Aborting.');
        process.exit(1);
    }
    const agencyId = agenciesSnap.docs[0].id;
    console.log(`Using agencyId: ${agencyId}`);
    // Find the admin user for this agency
    const usersSnap = await db.collection('users')
        .where('agencyId', '==', agencyId)
        .where('role', '==', 'admin')
        .limit(1)
        .get();
    const createdBy = usersSnap.empty ? 'system' : usersSnap.docs[0].id;
    console.log(`Created by: ${createdBy}`);
    // Check if template already exists
    const existing = await db
        .collection(`agencies/${agencyId}/contractTemplates`)
        .where('title', '==', 'הסכם בלעדיות למכירה')
        .limit(1)
        .get();
    if (!existing.empty) {
        console.log('Template already exists. Skipping.');
        process.exit(0);
    }
    const now = firestore_1.Timestamp.now();
    const ref = await db.collection(`agencies/${agencyId}/contractTemplates`).add({
        agencyId,
        title: 'הסכם בלעדיות למכירה',
        rawText: RAW_TEXT,
        taggedText: TAGGED_TEXT,
        fieldsMetadata: FIELDS_METADATA,
        createdBy,
        createdAt: now,
        updatedAt: now,
    });
    console.log(`✅ Template created: ${ref.id}`);
    console.log(`   Fields: ${FIELDS_METADATA.length}`);
    console.log(`   Agency: ${agencyId}`);
}
seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
//# sourceMappingURL=seed_contract_template.js.map