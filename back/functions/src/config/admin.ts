import { initializeApp } from 'firebase-admin/app';

/**
 * Initialize the Firebase Admin SDK once for all functions.
 * When deployed to Cloud Functions, credentials are picked up automatically
 * from the runtime environment — no service account key needed.
 */
initializeApp();
