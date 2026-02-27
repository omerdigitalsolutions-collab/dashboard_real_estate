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
    }
    catch (err) {
        console.error('Restoration failed:', err);
        process.exit(1);
    }
}
restore();
//# sourceMappingURL=restore_database.js.map