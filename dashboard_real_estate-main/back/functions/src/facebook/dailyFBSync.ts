import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { ApifyClient } from 'apify-client';
import { scrapeGroupAndWrite, FBGroupConfig } from './fbScrapeUtils';

const apifyToken = defineSecret('APIFY_TOKEN');
const fbCookies = defineSecret('FB_COOKIES');
const db = admin.firestore();

export const dailyFBSync = onSchedule(
    {
        schedule: '30 23 * * *',
        timeZone: 'Asia/Jerusalem',
        memory: '512MiB',
        timeoutSeconds: 540,
        secrets: [apifyToken, fbCookies],
    },
    async () => {
        logger.info('[dailyFBSync] starting');

        // Only sync cities that have been bootstrapped
        const citiesSnap = await db.collection('cities')
            .where('fbBootstrapped', '==', true)
            .get();

        if (citiesSnap.empty) {
            logger.info('[dailyFBSync] no bootstrapped cities');
            return;
        }

        const bootstrappedCities = new Set(citiesSnap.docs.map(d => d.id));

        // Build city → groups map, deduplicating the same URL across agencies
        const agenciesSnap = await db.collection('agencies')
            .where('facebookScraper.enabled', '==', true)
            .get();

        const cityGroups = new Map<string, FBGroupConfig[]>();
        for (const agencyDoc of agenciesSnap.docs) {
            const groups: FBGroupConfig[] = agencyDoc.data()?.facebookScraper?.groups || [];
            for (const g of groups) {
                if (!g?.url || !g?.defaultCity) continue;
                if (!bootstrappedCities.has(g.defaultCity)) continue;
                const existing = cityGroups.get(g.defaultCity) || [];
                if (!existing.some(e => e.url === g.url)) existing.push(g);
                cityGroups.set(g.defaultCity, existing);
            }
        }

        // today 00:00 Israel time — locale string avoids UTC/IL offset bugs on the server
        const since = new Date(
            new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Jerusalem' })
        );

        let cookies: any[] = [];
        try { cookies = JSON.parse(fbCookies.value()); } catch { /* use empty array */ }
        const apify = new ApifyClient({ token: apifyToken.value() });

        for (const [city, groups] of cityGroups.entries()) {
            for (const group of groups) {
                try {
                    const { imported } = await scrapeGroupAndWrite(apify, cookies, group, since, 50);
                    logger.info(`[dailyFBSync] city=${city} group=${group.url} imported=${imported}`);
                } catch (err) {
                    logger.error(`[dailyFBSync] city=${city} group=${group.url} failed`, err);
                }
            }
            await db.collection('cities').doc(city).set(
                { fbLastDailySync: admin.firestore.FieldValue.serverTimestamp() },
                { merge: true }
            );
        }

        logger.info('[dailyFBSync] done');
    }
);
