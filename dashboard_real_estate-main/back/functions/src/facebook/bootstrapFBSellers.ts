import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { ApifyClient } from 'apify-client';
import { scrapeGroupAndWrite, FBGroupConfig } from './fbScrapeUtils';

const apifyToken = defineSecret('APIFY_TOKEN');
const fbCookies = defineSecret('FB_COOKIES');
const db = admin.firestore();

export const bootstrapFBSellers = onCall(
    {
        secrets: [apifyToken, fbCookies],
        timeoutSeconds: 540,
        memory: '512MiB',
        cors: true,
    },
    async (request) => {
        if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Login required');

        const uid = request.auth.uid;
        const userSnap = await db.collection('users').doc(uid).get();
        const agencyId = userSnap.data()?.agencyId;
        if (!agencyId) throw new HttpsError('failed-precondition', 'No agency found');

        const agencySnap = await db.collection('agencies').doc(agencyId).get();
        const groups: FBGroupConfig[] = agencySnap.data()?.facebookScraper?.groups || [];
        if (groups.length === 0)
            throw new HttpsError('failed-precondition', 'No Facebook groups configured');

        const since = new Date();
        since.setDate(since.getDate() - 14);

        let cookies: any[] = [];
        try { cookies = JSON.parse(fbCookies.value()); } catch { /* use empty array */ }
        const apify = new ApifyClient({ token: apifyToken.value() });

        const results: { city: string; status: 'imported' | 'cached' | 'error'; imported?: number }[] = [];

        for (const group of groups) {
            const city = group.defaultCity;
            if (!city || !group.url) continue;

            const cityRef = db.collection('cities').doc(city);

            // Atomic claim — prevents duplicate Apify runs from simultaneous clicks
            let claimed = false;
            await db.runTransaction(async tx => {
                const snap = await tx.get(cityRef);
                if (snap.data()?.fbBootstrapped === true) return;
                tx.set(cityRef, { fbBootstrapped: true }, { merge: true });
                claimed = true;
            });

            if (!claimed) {
                results.push({ city, status: 'cached' });
                continue;
            }

            try {
                const { imported } = await scrapeGroupAndWrite(apify, cookies, group, since, 300);
                results.push({ city, status: 'imported', imported });
                logger.info(`[bootstrapFBSellers] city=${city} imported=${imported}`);
            } catch (err) {
                // Rollback so the admin can retry — continue to next city
                await cityRef.set({ fbBootstrapped: false }, { merge: true });
                logger.error(`[bootstrapFBSellers] city=${city} failed`, err);
                results.push({ city, status: 'error' });
            }
        }

        return { results };
    }
);
