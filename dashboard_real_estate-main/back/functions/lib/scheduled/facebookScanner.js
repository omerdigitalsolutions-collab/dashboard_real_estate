"use strict";
/**
 * Daily Facebook group scanner.
 *
 * For each agency that has the Facebook scraper enabled, runs the Apify
 * "facebook-groups-scraper" actor against up to 3 configured group URLs,
 * classifies each post as PRIVATE (direct seller) or BROKER, and:
 *   - PRIVATE → creates a draft Property (with cleaned description) +
 *               a seller Lead, both linked back to the fb_leads doc.
 *   - BROKER  → just stores the raw fb_leads record for visibility.
 *
 * Document ID in fb_leads is the Facebook post id, so the function is
 * idempotent — re-runs skip posts already saved.
 */
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
exports.facebookScanner = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const params_1 = require("firebase-functions/params");
const apify_client_1 = require("apify-client");
const fbClassifier_1 = require("../utils/fbClassifier");
const descriptionCleaner_1 = require("../utils/descriptionCleaner");
const db = admin.firestore();
const apifyToken = (0, params_1.defineSecret)('APIFY_TOKEN');
const APIFY_ACTOR = 'apify/facebook-groups-scraper';
const MAX_POSTS_PER_GROUP = 20;
exports.facebookScanner = (0, scheduler_1.onSchedule)({
    schedule: '0 8 * * *',
    timeZone: 'Asia/Jerusalem',
    memory: '512MiB',
    timeoutSeconds: 540,
    secrets: [apifyToken],
}, async () => {
    logger.info('[facebookScanner] starting daily run');
    const agenciesSnap = await db
        .collection('agencies')
        .where('facebookScraper.enabled', '==', true)
        .get();
    if (agenciesSnap.empty) {
        logger.info('[facebookScanner] no agencies with scraper enabled');
        return;
    }
    const apify = new apify_client_1.ApifyClient({ token: apifyToken.value() });
    for (const agencyDoc of agenciesSnap.docs) {
        const agencyId = agencyDoc.id;
        const config = agencyDoc.data().facebookScraper;
        if (!config || !Array.isArray(config.groups))
            continue;
        for (const group of config.groups) {
            if (!(group === null || group === void 0 ? void 0 : group.url))
                continue;
            try {
                await scanGroup(apify, agencyId, group);
            }
            catch (err) {
                logger.error(`[facebookScanner] agency=${agencyId} group=${group.url} failed`, err);
            }
        }
    }
    logger.info('[facebookScanner] finished');
});
async function scanGroup(apify, agencyId, group) {
    var _a;
    logger.info(`[facebookScanner] scanning agency=${agencyId} group=${group.url}`);
    const run = await apify.actor(APIFY_ACTOR).call({
        startUrls: [{ url: group.url }],
        resultsLimit: MAX_POSTS_PER_GROUP,
    });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    logger.info(`[facebookScanner] agency=${agencyId} group=${group.url} fetched ${items.length} posts`);
    for (const raw of items) {
        const postId = (raw === null || raw === void 0 ? void 0 : raw.id) || (raw === null || raw === void 0 ? void 0 : raw.legacyId);
        if (!postId)
            continue;
        const fbLeadRef = db.collection('fb_leads').doc(postId);
        const existing = await fbLeadRef.get();
        if (existing.exists)
            continue;
        const text = raw.text || '';
        const type = (0, fbClassifier_1.classifyFBPost)(text);
        const phone = (0, fbClassifier_1.extractPhone)(text);
        const thumbnail = (0, fbClassifier_1.extractThumbnail)(raw.attachments);
        const publisherName = ((_a = raw === null || raw === void 0 ? void 0 : raw.user) === null || _a === void 0 ? void 0 : _a.name) || 'לא ידוע';
        const postUrl = (raw === null || raw === void 0 ? void 0 : raw.url) || group.url;
        const publishedAt = (raw === null || raw === void 0 ? void 0 : raw.time) || new Date().toISOString();
        let leadId = null;
        let propertyId = null;
        if (type === 'PRIVATE') {
            try {
                const cleanedDescription = (0, descriptionCleaner_1.cleanDescription)(text);
                const propertyRef = await db
                    .collection('agencies')
                    .doc(agencyId)
                    .collection('properties')
                    .add({
                    agencyId,
                    transactionType: 'forsale',
                    propertyType: 'apartment',
                    status: 'draft',
                    source: 'facebook_group',
                    isExclusive: false,
                    rooms: null,
                    floor: null,
                    totalFloors: null,
                    squareMeters: null,
                    address: {
                        city: group.defaultCity,
                        street: '',
                        number: '',
                        neighborhood: '',
                        fullAddress: group.defaultCity,
                    },
                    features: {
                        hasElevator: null,
                        hasParking: null,
                        parkingSpots: null,
                        hasBalcony: null,
                        hasMamad: null,
                        hasStorage: null,
                        isRenovated: null,
                        isFurnished: null,
                        hasAirConditioning: null,
                    },
                    financials: {
                        price: 0,
                        originalPrice: null,
                    },
                    media: {
                        mainImage: thumbnail || null,
                        images: thumbnail ? [thumbnail] : [],
                        videoTourUrl: null,
                    },
                    management: {
                        assignedAgentId: null,
                        descriptions: cleanedDescription,
                    },
                    visibility: 'draft',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                propertyId = propertyRef.id;
                const leadRef = await db.collection('leads').add({
                    agencyId,
                    type: 'seller',
                    name: publisherName,
                    phone: phone || '',
                    source: 'facebook_group',
                    assignedAgentId: null,
                    status: 'new',
                    requirements: {
                        desiredCity: [group.defaultCity],
                        maxBudget: null,
                        minRooms: null,
                        maxRooms: null,
                        minSizeSqf: null,
                        floorMin: null,
                        floorMax: null,
                        propertyType: [],
                        mustHaveElevator: false,
                        mustHaveParking: false,
                        mustHaveBalcony: false,
                        mustHaveSafeRoom: false,
                        condition: 'any',
                        urgency: 'flexible',
                    },
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                leadId = leadRef.id;
            }
            catch (err) {
                logger.error(`[facebookScanner] failed creating lead/property for post=${postId}`, err);
            }
        }
        await fbLeadRef.set({
            agencyId,
            sourceGroup: group.url,
            city: group.defaultCity,
            publisherName,
            text,
            postUrl,
            publishedAt,
            phone,
            thumbnail,
            type,
            leadId,
            propertyId,
            status: 'new',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
}
//# sourceMappingURL=facebookScanner.js.map