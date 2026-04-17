import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp();
}

async function inspect() {
    const db = admin.firestore();
    const dealsSnap = await db.collection('deals').limit(1).get();
    if (dealsSnap.empty) {
        console.log('No deals found');
    } else {
        console.log('Deal Sample:', JSON.stringify(dealsSnap.docs[0].data(), null, 2));
    }

    const agentsSnap = await db.collection('users').limit(1).get();
    if (agentsSnap.empty) {
        console.log('No agents found');
    } else {
        console.log('Agent Sample:', JSON.stringify(agentsSnap.docs[0].data(), null, 2));
    }

    const agenciesSnap = await db.collection('agencies').limit(1).get();
    if (agenciesSnap.empty) {
        console.log('No agencies found');
    } else {
        console.log('Agency Sample:', JSON.stringify(agenciesSnap.docs[0].data(), null, 2));
    }
}

inspect().catch(console.error);
