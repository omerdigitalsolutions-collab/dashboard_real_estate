import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    const sa = require('/Users/omerasis/Desktop/dashboard/dashboard_real_estate-main/firebase-key.json');
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: 'dashboard-6f9d1' });
}

const db = admin.firestore();

async function run() {
    // Fetch the template seeded into the agency
    const snap = await db
        .collection('agencies/5QfL1fcRZ4CsZ8ZZmsUK/contractTemplates')
        .where('title', '==', 'הסכם בלעדיות למכירה')
        .limit(1)
        .get();

    if (snap.empty) {
        console.error('Source template not found in agency. Run seed_contract_template.ts first.');
        process.exit(1);
    }

    const data = snap.docs[0].data();

    // Idempotent — skip if already exists
    const existing = await db.collection('systemTemplates')
        .where('title', '==', 'הסכם בלעדיות למכירה')
        .limit(1)
        .get();

    if (!existing.empty) {
        console.log('Already in systemTemplates — skipping.');
        process.exit(0);
    }

    const ref = await db.collection('systemTemplates').add({
        title: data.title,
        description: 'הסכם בלעדיות סטנדרטי למכירת נכס — כולל שדות גוש/חלקה, עמלה ותקופת בלעדיות',
        category: 'מכירה',
        rawText: data.rawText,
        taggedText: data.taggedText,
        fieldsMetadata: data.fieldsMetadata,
        createdAt: admin.firestore.Timestamp.now(),
    });

    console.log('✅ Created systemTemplates doc:', ref.id);
}

run().catch(err => { console.error(err); process.exit(1); });
