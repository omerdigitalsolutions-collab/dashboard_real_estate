import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { ApifyClient } from 'apify-client';
import {
    scrapeAndWrite,
    normalizeYad2Item,
} from './propertyScrapeUtils';

const apifyToken = defineSecret('APIFY_TOKEN');
const db = admin.firestore();

const DAILY_MAX_RESULTS = 100;

export const dailyCityPropertiesSync = onSchedule(
    {
        schedule:        '30 23 * * *',
        timeZone:        'Asia/Jerusalem',
        region:          'europe-west1',
        secrets:         [apifyToken],
        timeoutSeconds:  540,
        memory:          '512MiB',
    },
    async () => {
        const bootstrappedSnap = await db.collection('cities')
            .where('propertiesBootstrapped', '==', true)
            .get();

        if (bootstrappedSnap.empty) {
            logger.info('[dailyCityPropertiesSync] no bootstrapped cities, exiting');
            return;
        }

        const apify = new ApifyClient({ token: apifyToken.value() });

        // Today's midnight in Israel timezone (safe for both UTC+2 winter and UTC+3 summer)
        const ilDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jerusalem',
        }).format(new Date());
        const since = new Date(`${ilDateStr}T00:00:00.000Z`);
        since.setTime(since.getTime() - 3 * 3_600_000);

        const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );

        const actorInput = {
            fromDate:           since.toISOString(),
            maxResults:         DAILY_MAX_RESULTS,
            proxyConfiguration: { useApifyProxy: true, countryCode: 'IL' },
        };

        for (const cityDoc of bootstrappedSnap.docs) {
            const city = cityDoc.id;

            // Skip cities with no agency active in the last 7 days (fail-open: sync anyway if query fails)
            try {
                const activeSnap = await db.collection('agencies')
                    .where('settings.activeGlobalCities', 'array-contains', city)
                    .where('lastActiveAt', '>', sevenDaysAgo)
                    .limit(1)
                    .get();

                if (activeSnap.empty) {
                    logger.info(`[dailyCityPropertiesSync] city=${city} skipped — no active agency`);
                    continue;
                }
            } catch (filterErr) {
                logger.warn(`[dailyCityPropertiesSync] city=${city} activity filter failed, proceeding anyway`, filterErr);
            }

            try {
                const yad2 = await scrapeAndWrite(
                    apify, 'voyager/yad2-scraper', { city, ...actorInput }, city, normalizeYad2Item
                );

                logger.info(
                    `[dailyCityPropertiesSync] ${city} — yad2: ${yad2.imported} new / ${yad2.updated} updated`
                );
            } catch (err) {
                logger.error(`[dailyCityPropertiesSync] city=${city} failed`, err);
            }

            await db.collection('cities').doc(city).set({
                propertiesLastDailySync: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
    }
);
