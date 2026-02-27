import * as admin from 'firebase-admin';
import './config/admin'; // Use existing config

const db = admin.firestore();

async function inspect() {
    try {
        const agenciesSnap = await db.collection('agencies').get();
        console.log(`Found ${agenciesSnap.size} agencies.`);

        for (const doc of agenciesSnap.docs) {
            const data = doc.data();
            console.log('--- AGENCY ---');
            console.log('ID:', doc.id);
            console.log('Name:', data.agencyName || data.name);
            console.log('WhatsApp Integration:', JSON.stringify(data.whatsappIntegration, null, 2));
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

inspect();
