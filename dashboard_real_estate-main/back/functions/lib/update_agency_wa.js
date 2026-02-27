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
            if (name === 'אנגלו' || (name === null || name === void 0 ? void 0 : name.includes('אנגלו'))) {
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
    }
    catch (error) {
        console.error('DATABASE ERROR:', error);
    }
}
updateAgency();
//# sourceMappingURL=update_agency_wa.js.map