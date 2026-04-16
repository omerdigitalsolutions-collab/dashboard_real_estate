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
if (!admin.apps.length) {
    admin.initializeApp();
}
async function inspect() {
    const db = admin.firestore();
    const dealsSnap = await db.collection('deals').limit(1).get();
    if (dealsSnap.empty) {
        console.log('No deals found');
    }
    else {
        console.log('Deal Sample:', JSON.stringify(dealsSnap.docs[0].data(), null, 2));
    }
    const agentsSnap = await db.collection('users').limit(1).get();
    if (agentsSnap.empty) {
        console.log('No agents found');
    }
    else {
        console.log('Agent Sample:', JSON.stringify(agentsSnap.docs[0].data(), null, 2));
    }
    const agenciesSnap = await db.collection('agencies').limit(1).get();
    if (agenciesSnap.empty) {
        console.log('No agencies found');
    }
    else {
        console.log('Agency Sample:', JSON.stringify(agenciesSnap.docs[0].data(), null, 2));
    }
}
inspect().catch(console.error);
//# sourceMappingURL=inspect_data.js.map