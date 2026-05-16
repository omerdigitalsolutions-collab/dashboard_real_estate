import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { ApifyClient } from 'apify-client';
import { validateUserAuth } from '../config/authGuard';
import {
    scrapeAndWrite,
    normalizeYad2Item,
    normalizeMadlanItem,
} from './propertyScrapeUtils';

const apifyToken = defineSecret('APIFY_TOKEN');
const db = admin.firestore();

const BOOTSTRAP_WINDOW_DAYS = 30;
const BOOTSTRAP_MAX_RESULTS = 300;

interface BootstrapResult {
    city:      string;
    status:    'imported' | 'cached';
    imported?: number;
    updated?:  number;
}

export const bootstrapCityProperties = onCall(
    {
        secrets:         [apifyToken],
        timeoutSeconds:  300,
        memory:          '512MiB',
        cors:            true,
    },
    async (request): Promise<{ results: BootstrapResult[] }> => {
        const { agencyId } = await validateUserAuth(request);

        const agencySnap = await db.collection('agencies').doc(agencyId).get();
        const cities: string[] = agencySnap.data()?.settings?.activeGlobalCities ?? [];

        if (cities.length === 0) {
            throw new HttpsError('failed-precondition', 'No cities configured for this agency');
        }

        const since = new Date();
        since.setDate(since.getDate() - BOOTSTRAP_WINDOW_DAYS);

        const apify = new ApifyClient({ token: apifyToken.value() });
        const results: BootstrapResult[] = [];

        for (const city of cities) {
            const cityRef = db.collection('cities').doc(city);

            // Atomic claim: prevent duplicate Apify runs from simultaneous clicks
            const alreadyBootstrapped = await db.runTransaction(async (tx) => {
                const citySnap = await tx.get(cityRef);
                if (citySnap.data()?.propertiesBootstrapped === true) return true;

                tx.set(cityRef, {
                    propertiesBootstrapped:   true,
                    propertiesBootstrappedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                return false;
            });

            if (alreadyBootstrapped) {
                logger.info(`[bootstrapCityProperties] city=${city} already bootstrapped, returning cache`);
                results.push({ city, status: 'cached' });
                continue;
            }

            const actorInput = {
                fromDate:           since.toISOString(),
                maxResults:         BOOTSTRAP_MAX_RESULTS,
                proxyConfiguration: { useApifyProxy: true, countryCode: 'IL' },
            };

            try {
                const [yad2, madlan] = await Promise.all([
                    scrapeAndWrite(apify, 'voyager/yad2-scraper',   { city, ...actorInput }, city, normalizeYad2Item),
                    scrapeAndWrite(apify, 'voyager/madlan-scraper',  { city, ...actorInput }, city, normalizeMadlanItem),
                ]);

                logger.info(`[bootstrapCityProperties] city=${city} yad2=${yad2.imported}+${yad2.updated} madlan=${madlan.imported}+${madlan.updated}`);

                results.push({
                    city,
                    status:   'imported',
                    imported: yad2.imported + madlan.imported,
                    updated:  yad2.updated  + madlan.updated,
                });

            } catch (err) {
                // Roll back so the admin can retry
                await cityRef.set({ propertiesBootstrapped: false }, { merge: true });
                logger.error(`[bootstrapCityProperties] city=${city} failed, rolled back`, err);
                throw new HttpsError('internal', `Failed to bootstrap city: ${city}`);
            }
        }

        return { results };
    }
);
