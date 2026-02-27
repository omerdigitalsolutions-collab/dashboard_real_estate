import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'dashboard-6f9d1'
    });
}

const db = admin.firestore();

async function restore() {
    try {
        const users = [
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

        for (const user of users) {
            // Recreate Agency
            await db.collection('agencies').doc(user.agencyId).set({
                agencyId: user.agencyId,
                agencyName: user.agencyId === "FD1zzacN9WFeSmENqY5G" ? "אנגלו" : "Agency " + user.agencyId,
                whatsappIntegration: user.agencyId === "FD1zzacN9WFeSmENqY5G" ? {
                    idInstance: "7105261595",
                    apiTokenInstance: "2d3153735b0c422c9c44e64c299fb66c861cbaacd68a4395af",
                    status: "connected",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                } : null,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // Recreate User doc
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                email: user.email,
                name: user.name,
                agencyId: user.agencyId,
                role: user.role,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Restored user ${user.email} and agency ${user.agencyId}`);
        }

        console.log('SUCCESS: Core structure restored.');
    } catch (error) {
        console.error('RESTORE ERROR:', error);
    }
}

restore();
