const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'firebase-key.json'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const AGENCY_ID = 'xOKF9E2dxyGCuLlSKE0S';
const AGENCY_NAME = 'אנגלו סכסון מודיעין';
const OWNER_PHONE = '0544706024';

async function run() {
    const agencyRef = db.collection('agencies').doc(AGENCY_ID);
    const existing = await agencyRef.get();

    const trialEndsDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const payload = {
        name: AGENCY_NAME,
        subscriptionTier: 'free',
        status: 'pending_approval',
        monthlyGoals: { commissions: 100000, deals: 5, leads: 20 },
        settings: {},
        billing: {
            planId: 'free_trial',
            status: 'trialing',
            trialEndsAt: trialEndsDate,
            ownerPhone: OWNER_PHONE,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (existing.exists) {
        console.log(`[createAngloModiin] Agency ${AGENCY_ID} already exists. Aborting to avoid overwrite.`);
        console.log('Existing data:', JSON.stringify(existing.data(), null, 2));
        process.exit(1);
    }

    await agencyRef.set(payload);
    console.log(`[createAngloModiin] Created agency ${AGENCY_ID} (${AGENCY_NAME})`);

    const written = await agencyRef.get();
    console.log('Written data:', JSON.stringify(written.data(), null, 2));
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[createAngloModiin] FAILED:', err);
        process.exit(1);
    });
