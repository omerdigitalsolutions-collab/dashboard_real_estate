"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("firebase-admin/app");
/**
 * Initialize the Firebase Admin SDK once for all functions.
 * When deployed to Cloud Functions, credentials are picked up automatically
 * from the runtime environment — no service account key needed.
 */
(0, app_1.initializeApp)();
//# sourceMappingURL=admin.js.map