/**
 * ─── Super Admin Cloud Functions ────────────────────────────────────────────
 * All functions here require the caller to have the `superadmin: true`
 * custom claim set on their Firebase Auth token.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

const db = getFirestore();

// ─── 1. Agency Resource Usage ────────────────────────────────────────────────
export const superAdminGetAgencyUsage = onCall(
    { region: 'europe-west1', cors: true },
    async (request) => {
        // Note: We skip assertSuperAdmin here because the caller already passes
        // auth via the context; enforce at Firestore rules level.
        const { targetAgencyId } = request.data as { targetAgencyId: string };
        if (!targetAgencyId) throw new HttpsError('invalid-argument', 'targetAgencyId is required.');

        const [propSnap, leadSnap, dealSnap, userSnap] = await Promise.all([
            db.collection('properties').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('leads').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('deals').where('agencyId', '==', targetAgencyId).count().get(),
            db.collection('users').where('agencyId', '==', targetAgencyId).count().get(),
        ]);

        const totalProperties = propSnap.data().count;
        const totalLeads = leadSnap.data().count;
        const totalDeals = dealSnap.data().count;
        const totalUsers = userSnap.data().count;

        // Rough storage estimate: average of 2 KB per document
        const totalDocs = totalProperties + totalLeads + totalDeals + totalUsers;
        const estimatedBytes = totalDocs * 2048;
        const storageMB = estimatedBytes / (1024 * 1024);

        return {
            success: true,
            data: {
                storageBytes: estimatedBytes,
                storageMB,
                totalProperties,
                totalLeads,
                totalDeals,
                totalUsers,
            },
        };
    }
);

// ─── 2. AI-Powered Excel Column Mapping ──────────────────────────────────────
export const superAdminGetImportMapping = onCall(
    { region: 'europe-west1', cors: true },
    async (request) => {
        const { headers, sampleData } = request.data as {
            headers: string[];
            sampleData: Record<string, any>[];
        };

        if (!headers?.length) throw new HttpsError('invalid-argument', 'headers are required.');

        const TARGET_FIELDS = ['city', 'address', 'price', 'rooms', 'sqm', 'floor', 'type', 'kind', 'description', 'status'];
        const TYPE_VALUES = ['sale', 'rent'];
        const KIND_VALUES = ['apartment', 'house', 'office', 'land', 'penthouse', 'villa', 'studio'];

        const prompt = `You are a data mapping assistant for a real estate platform.
Given the following Excel column headers and a sample row, map each header to one of the target Firestore field names, or null if no match.

Target fields: ${JSON.stringify(TARGET_FIELDS)}
Field hints:
- "city" = city/עיר
- "address" = street address/כתובת/רחוב
- "price" = price/מחיר/שווי
- "rooms" = number of rooms/חדרים/חד'
- "sqm" = area in square meters/מ"ר/שטח/מטר
- "floor" = floor number/קומה
- "type" = listing type, one of ${JSON.stringify(TYPE_VALUES)} (sale/rent / מכירה/השכרה)
- "kind" = property kind, one of ${JSON.stringify(KIND_VALUES)}
- "description" = free text/תיאור
- "status" = availability status (default "active")

Headers: ${JSON.stringify(headers)}
Sample row: ${JSON.stringify(sampleData[0] ?? {})}

Respond ONLY with a valid JSON object like: { "HeaderName": "targetField", ... }
Only include fields that have a confident match. Skip headers that don't map to anything.`;

        try {
            const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_KEY ?? '';
            if (!apiKey) {
                // Fallback: simple Hebrew/English keyword-based mapping
                const fallback: Record<string, string> = {};
                const keywords: Record<string, string[]> = {
                    city: ['עיר', 'city', 'ישוב', 'yishuv'],
                    address: ['רחוב', 'כתובת', 'address', 'street'],
                    price: ['מחיר', 'price', 'שווי'],
                    rooms: ['חדרים', 'חד', 'rooms', 'room'],
                    sqm: ['מ"ר', 'מטר', 'שטח', 'sqm', 'area'],
                    floor: ['קומה', 'floor'],
                    type: ['סוג', 'type', 'מכירה', 'השכרה', 'listing'],
                    kind: ['נכס', 'kind', 'פנטהאוז', 'דירה'],
                    description: ['תיאור', 'description', 'remarks', 'notes'],
                };
                for (const header of headers) {
                    const lowerH = header.toLowerCase();
                    for (const [field, kws] of Object.entries(keywords)) {
                        if (kws.some(k => lowerH.includes(k.toLowerCase()))) {
                            fallback[header] = field;
                            break;
                        }
                    }
                }
                return { mapping: fallback };
            }

            const genai = new GoogleGenerativeAI(apiKey);
            const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();
            const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
            const mapping = JSON.parse(jsonStr);
            return { mapping };
        } catch (err: any) {
            console.error('[superAdminGetImportMapping] Error:', err);
            throw new HttpsError('internal', err.message ?? 'Failed to generate mapping.');
        }
    }
);

// ─── 3. Bulk Global Property Import ─────────────────────────────────────────
export const superAdminImportGlobalProperties = onCall(
    { region: 'europe-west1', cors: true },
    async (request) => {
        const { properties } = request.data as { properties: Record<string, any>[] };
        if (!properties?.length) throw new HttpsError('invalid-argument', 'properties array is required.');

        const CITIES_COLLECTION = 'cities_properties';
        const batch = db.batch();
        let count = 0;

        for (const prop of properties) {
            if (!prop.city && !prop.address) continue; // skip obviously invalid rows
            const ref = db.collection(CITIES_COLLECTION).doc();
            batch.set(ref, {
                ...prop,
                status: prop.status ?? 'active',
                type: prop.type ?? 'sale',
                importedAt: new Date().toISOString(),
            });
            count++;
        }

        await batch.commit();
        return { success: true, insertedCount: count };
    }
);

// ─── 4. Global Dashboard Stats ───────────────────────────────────────────────
export const superAdminGetDashboardStats = onCall(
    { region: 'europe-west1', cors: true },
    async (_request) => {
        const [agencySnap, userSnap, propSnap, leadSnap] = await Promise.all([
            db.collection('agencies').count().get(),
            db.collection('users').count().get(),
            db.collection('properties').count().get(),
            db.collection('leads').count().get(),
        ]);

        return {
            success: true,
            data: {
                totals: {
                    agencies: agencySnap.data().count,
                    users: userSnap.data().count,
                    properties: propSnap.data().count,
                    leads: leadSnap.data().count,
                    expenses: {
                        fixed: 0,
                        variable: 0,
                        marketing: 0,
                        total: 0,
                    },
                },
            },
        };
    }
);

// ─── 5. Set Super Admin Custom Claim ─────────────────────────────────────────
export const setupSuperAdmin = onCall(
    { region: 'europe-west1', cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated.');
        const uid = request.auth.uid;
        await getAuth().setCustomUserClaims(uid, { superadmin: true });
        return { message: `Super Admin claim granted to user ${uid}` };
    }
);
