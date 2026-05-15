/**
 * Scheduled function that automatically refreshes Facebook session cookies
 * every 10 days. Uses Apify to log in to Facebook, extracts the session
 * cookies, then writes a new version of the FB_COOKIES secret to
 * Google Cloud Secret Manager.
 *
 * Prerequisites:
 *   firebase functions:secrets:set FB_EMAIL     (Facebook account email)
 *   firebase functions:secrets:set FB_PASSWORD  (Facebook account password)
 *   firebase functions:secrets:set FB_COOKIES   (initial value: [])
 *
 * The Cloud Function service account needs:
 *   roles/secretmanager.secretVersionAdder   on the FB_COOKIES secret
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { ApifyClient } from 'apify-client';
import * as logger from 'firebase-functions/logger';

const apifyToken = defineSecret('APIFY_TOKEN');
const fbEmail = defineSecret('FB_EMAIL');
const fbPassword = defineSecret('FB_PASSWORD');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

export const refreshFBCookies = onSchedule(
    {
        // Every 10 days at 07:00 Israel time (1 hour before the daily scanner)
        schedule: '0 7 */10 * *',
        timeZone: 'Asia/Jerusalem',
        memory: '512MiB',
        timeoutSeconds: 300,
        secrets: [apifyToken, fbEmail, fbPassword],
    },
    async () => {
        logger.info('[refreshFBCookies] starting cookie refresh');

        const apify = new ApifyClient({ token: apifyToken.value() });

        // ── 1. Login to Facebook via headless browser ───────────────────────────
        const run = await apify.actor('apify/web-scraper').call({
            startUrls: [{ url: 'https://www.facebook.com/login' }],
            proxyConfiguration: {
                useApifyProxy: true,
                groups: ['RESIDENTIAL'],
                countryCode: 'IL',
            },
            // Credentials passed via customData — accessible in pageFunction
            // without appearing in Apify run logs
            customData: {
                email: fbEmail.value(),
                password: fbPassword.value(),
            },
            preNavigationHooks: [
                `async ({ page }) => {
                    await page.setRequestInterception(true);
                    page.on('request', (req) => {
                        if (['image', 'font', 'media'].includes(req.resourceType())) {
                            req.abort();
                        } else {
                            req.continue();
                        }
                    });
                }`
            ],
            pageFunction: `
                async function pageFunction(context) {
                    const { page, log, customData } = context;
                    const { email, password } = customData;

                    // Fill login form
                    await page.waitForSelector('#email', { timeout: 15000 });
                    await page.type('#email', email, { delay: 60 });
                    await page.type('#pass', password, { delay: 60 });
                    await page.click('[name="login"]');

                    // Wait for navigation after submit
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
                        .catch(() => log.warning('Navigation timeout — continuing anyway'));

                    const url = page.url();
                    log.info('Post-login URL: ' + url);

                    if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/two_step')) {
                        throw new Error('Login failed or checkpoint triggered — manual cookie refresh required');
                    }

                    // Extract all facebook.com cookies
                    const cookies = await page.cookies();
                    const fbCookies = cookies.filter(c =>
                        c.domain.includes('facebook.com') || c.domain.includes('.facebook.com')
                    );

                    log.info('Extracted ' + fbCookies.length + ' Facebook cookies');
                    return fbCookies;
                }
            `,
            maxPagesPerCrawl: 1,
        });

        const { items } = await apify.dataset(run.defaultDatasetId).listItems();
        const cookies = (items as any[]).flat().filter((c: any) => c.name && c.value);

        if (cookies.length === 0) {
            throw new Error('[refreshFBCookies] No cookies extracted — login may have failed');
        }

        logger.info(`[refreshFBCookies] extracted ${cookies.length} cookies`);

        // ── 2. Update FB_COOKIES secret in Secret Manager ───────────────────────
        const client = new SecretManagerServiceClient();
        const secretName = `projects/${PROJECT_ID}/secrets/FB_COOKIES`;

        await client.addSecretVersion({
            parent: secretName,
            payload: {
                data: Buffer.from(JSON.stringify(cookies), 'utf8'),
            },
        });

        logger.info('[refreshFBCookies] FB_COOKIES secret updated successfully');

        // ── 3. Disable all previous versions (keep only the latest) ────────────
        const [versionList] = await client.listSecretVersions({
            parent: secretName,
            filter: 'state:ENABLED',
        });

        const toDisable = versionList
            .filter(v => !v.name?.endsWith('/versions/latest'))
            .slice(0, -1); // keep the one we just added

        await Promise.all(
            toDisable.map(v =>
                client.disableSecretVersion({ name: v.name! }).catch(e =>
                    logger.warn(`[refreshFBCookies] could not disable version ${v.name}: ${e.message}`)
                )
            )
        );

        logger.info('[refreshFBCookies] old secret versions disabled');
    }
);
