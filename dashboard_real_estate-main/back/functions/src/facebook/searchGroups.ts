import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { ApifyClient } from 'apify-client';
import { validateUserAuth } from '../config/authGuard';
import * as logger from 'firebase-functions/logger';

const apifyToken = defineSecret('APIFY_TOKEN');
const fbCookies = defineSecret('FB_COOKIES');
const db = admin.firestore();

const ISRAEL_CITIES = [
    'תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד',
    'נתניה', 'באר שבע', 'בני ברק', 'חולון', 'רמת גן', 'אשקלון', 'רחובות',
    'בת ים', 'הרצליה', 'כפר סבא', 'מודיעין', 'חדרה', 'לוד', 'מזכרת בתיה',
    'נס ציונה', 'קרית גת', 'אילת', 'נהריה', 'ראש העין', 'גבעתיים',
    'קרית שמונה', 'עפולה', 'טבריה', 'רעננה', 'הוד השרון', 'יבנה', 'רמלה',
    'אור יהודה', 'קרית אונו', 'אלעד', 'מבשרת ציון', 'ביתר עילית',
];

function detectCity(text: string): string {
    const lower = text.toLowerCase();
    return ISRAEL_CITIES.find(c => lower.includes(c.toLowerCase())) || '';
}

function extractGroupId(url: string): string {
    return url.split('/groups/')[1]?.split('/')[0]?.split('?')[0] || '';
}

function parseMemberCount(text: string | null): number | null {
    if (!text) return null;
    const match = text.match(/([\d,\.]+)\s*([KMk]|אלף)?/);
    if (!match) return null;
    const num = parseFloat(match[1].replace(/,/g, ''));
    const suffix = match[2]?.toLowerCase();
    const mult = (suffix === 'k' || suffix === 'אלף') ? 1000 : suffix === 'm' ? 1000000 : 1;
    return Math.round(num * mult);
}

export const searchFBGroups = onCall(
    { secrets: [apifyToken, fbCookies], cors: true, timeoutSeconds: 60, memory: '512MiB' },
    async (request) => {
        await validateUserAuth(request);
        const { query } = request.data as { query: string };
        if (!query?.trim()) throw new HttpsError('invalid-argument', 'query required');

        // ── 1. Internal cache check ─────────────────────────────────────────────
        const detectedCity = detectCity(query);
        if (detectedCity) {
            const cacheSnap = await db.collection('shared_groups')
                .where('city', '==', detectedCity)
                .orderBy('memberCount', 'desc')
                .limit(12)
                .get();
            if (cacheSnap.size >= 5) {
                logger.info(`[searchFBGroups] cache hit city="${detectedCity}" (${cacheSnap.size} groups)`);
                return { groups: cacheSnap.docs.map(d => d.data()), fromCache: true };
            }
        }

        // ── 2. Apify call ───────────────────────────────────────────────────────
        const apify = new ApifyClient({ token: apifyToken.value() });
        const encodedQuery = encodeURIComponent(query.trim());
        const searchUrl = `https://www.facebook.com/search/groups/?q=${encodedQuery}`;

        let cookiesArray: any[] = [];
        try { cookiesArray = JSON.parse(fbCookies.value()); } catch (e) {
            logger.warn('[searchFBGroups] FB_COOKIES not set or invalid — proceeding without auth');
        }

        const run = await apify.actor('apify/web-scraper').call({
            startUrls: [{ url: searchUrl }],
            proxyConfiguration: { useApifyProxy: true, groups: ['RESIDENTIAL'], countryCode: 'IL' },
            initialCookies: cookiesArray,
            preNavigationHooks: [
                `async ({ page, log }) => {
                    await page.setRequestInterception(true);
                    page.on('request', (request) => {
                        if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                            request.abort();
                        } else {
                            request.continue();
                        }
                    });
                }`
            ],
            pageFunction: `
                async function pageFunction(context) {
                    const { $, log } = context;
                    await context.infiniteScroll({ timeoutSecs: 5 });
                    const results = [];
                    $('[role="feed"] > div, div[data-testid="results_list"] > div').each((_, el) => {
                        const linkEl = $(el).find('a[href*="/groups/"]').first();
                        const name = linkEl.text().trim();
                        const href = linkEl.attr('href') || '';
                        const url = href.split('?')[0];
                        const statsText = $(el).text();
                        const followerMatch = statsText.match(/([\\d,\\.]+[KMk]?)\\s*(עוקבים|חברים|followers|members|אלף)/i);
                        const followerText = followerMatch ? followerMatch[0] : null;
                        const isPrivate = /פרטית|private/i.test(statsText);
                        const description = $(el).find('div[dir]').last().text().trim().slice(0, 200);
                        if (name && url.includes('/groups/')) {
                            results.push({ name, url, followerText, isPrivate, description });
                        }
                    });
                    return results;
                }
            `,
            maxPagesPerCrawl: 1,
            maxResultsPerCrawl: 15,
        });

        const { items } = await apify.dataset(run.defaultDatasetId).listItems();
        const groups = (items as any[]).flat().filter((g: any) => g.name && g.url).slice(0, 12);

        // ── 3. Background: enrich shared_groups cache ───────────────────────────
        if (groups.length > 0) {
            const batch = db.batch();
            groups.forEach((g: any) => {
                const gid = extractGroupId(g.url);
                if (!gid) return;
                const ref = db.collection('shared_groups').doc(gid);
                batch.set(ref, {
                    id: gid,
                    name: g.name,
                    url: g.url,
                    city: detectCity(g.name + ' ' + (g.description || '')),
                    memberCount: parseMemberCount(g.followerText),
                    isPrivate: g.isPrivate,
                    lastScanned: admin.firestore.FieldValue.serverTimestamp(),
                    category: 'real_estate',
                }, { merge: true });
            });
            batch.commit().catch(err => logger.error('[searchFBGroups] cache write failed', err));
        }

        logger.info(`[searchFBGroups] query="${query}" Apify returned ${groups.length} groups`);
        return { groups, fromCache: false };
    }
);
