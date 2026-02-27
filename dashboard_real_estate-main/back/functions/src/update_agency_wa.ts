import * as admin from 'firebase-admin';

// Check if already initialized to prevent errors
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'dashboard-6f9d1'
    });
}

const db = admin.firestore();

async function updateAgency() {
    try {
        const agenciesSnap = await db.collection('agencies').get();
        let found = false;

        for (const doc of agenciesSnap.docs) {
            const data = doc.data();
            const name = data.agencyName || data.name;
            if (name === 'אנגלו' || name?.includes('אנגלו')) {
                found = true;
                const newIntegration = {
                    idInstance: '7105261595',
                    apiTokenInstance: '2d3153735b0c422c9c44e64c299fb66c861cbaacd68a4395af',
                    status: 'connected', // Assuming user just got them and they are valid
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                await doc.ref.update({
                    whatsappIntegration: newIntegration
                });

                console.log('SUCCESS: Updated agency', name, 'with ID', doc.id);
                console.log('New details:', JSON.stringify(newIntegration, null, 2));
            }
        }

        if (!found) {
            console.log('ERROR: Agency "אנגלו" not found.');
        }
    } catch (error) {
        console.error('DATABASE ERROR:', error);
    }
}

updateAgency();
