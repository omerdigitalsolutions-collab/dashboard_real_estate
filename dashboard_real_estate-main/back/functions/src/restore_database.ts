import * as admin from 'firebase-admin';

// Initialize with project ID
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'dashboard-6f9d1'
    });
}

const db = admin.firestore();

async function restore() {
    try {
        console.log('Starting restoration...');

        // 1. Data extracted from users.json
        const usersToStore = [
            {
                uid: "58CcSTx29Egg1ZZYBNpbJAAwbaG2",
                email: "omerfm4444@gmail.com",
                name: "עומר עסיס",
                agencyId: "P7z9y24z2DBGiCPSgQRI",
                role: "admin"
            },
            {
                uid: "9L8yQb5frxX66M7p3qiEaPURkJF2",
                email: "omerdigitalsolutions@gmail.com",
                name: "OMER",
                agencyId: "FD1zzacN9WFeSmENqY5G",
                role: "admin"
            },
            {
                uid: "qZZqi5YXPPdjqsORV6CFnf4scYz2",
                email: "omerasis4@gmail.com",
                name: "OMER ASIS",
                agencyId: "5QfL1fcRZ4CsZ8ZZmsUK",
                role: "admin"
            }
        ];

        for (const user of usersToStore) {
            console.log(`Restoring user: ${user.email}`);

            // Recreate Agency doc
            const isAnglo = user.agencyId === "FD1zzacN9WFeSmENqY5G";

            // USE SET TO ENSURE IT EXISTS
            await db.collection('agencies').doc(user.agencyId).set({
                agencyId: user.agencyId,
                agencyName: isAnglo ? "אנגלו" : "סוכנות " + user.agencyId,
                whatsappIntegration: isAnglo ? {
                    idInstance: "7105261595",
                    apiTokenInstance: "2d3153735b0c422c9c44e64c299fb66c861cbaacd68a4395af",
                    status: "connected",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                } : null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Recreate User doc
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                name: user.name,
                agencyId: user.agencyId,
                role: user.role,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // UPDATE AUTH CLAIMS JUST IN CASE
            await admin.auth().setCustomUserClaims(user.uid, {
                agencyId: user.agencyId,
                role: user.role
            });

            console.log(`✅ Restored ${user.email} and updated claims`);
        }

        console.log('Restoration process finished successfully.');
    } catch (err) {
        console.error('Restoration failed:', err);
        process.exit(1);
    }
}

restore();
