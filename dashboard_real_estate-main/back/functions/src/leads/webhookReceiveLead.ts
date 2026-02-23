/**
 * webhookReceiveLead — Public HTTPS endpoint for receiving leads from external
 * marketing platforms (e.g., Facebook Lead Ads via Make.com).
 *
 * Security Design:
 *  - Uses `crypto.timingSafeEqual()` to validate a shared secret key from request headers.
 *  - Returns HTTP 200 on ALL responses (including invalid secret) to prevent endpoint discovery.
 *  - Logs all invalid attempts internally without exposing any information to the caller.
 *
 * URL format: POST /webhookReceiveLead?agencyId=<id>
 * Headers:    x-webhook-secret: <WEBHOOK_SECRET env var>
 *
 * Body (JSON):
 *   {
 *     name?: string,
 *     phone?: string,
 *     email?: string,
 *     source?: string,
 *     requirements?: { desiredCity?: string[], maxBudget?: number, minRooms?: number, propertyType?: string[] }
 *   }
 */
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

const db = getFirestore();

export const webhookReceiveLead = onRequest(async (req, res) => {
    // ── Only accept POST ─────────────────────────────────────────────────────────
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    // ── Extract agencyId from query params ───────────────────────────────────────
    const agencyId = typeof req.query.agencyId === 'string' ? req.query.agencyId.trim() : '';

    if (!agencyId) {
        // Stealth: return 200 but log the problem internally
        console.error('[webhookReceiveLead] Missing agencyId in query params. Request ignored.');
        res.status(200).json({ success: true });
        return;
    }

    // ── Timing-safe secret validation ────────────────────────────────────────────
    const incomingSecret = req.headers['x-webhook-secret'];
    const expectedSecret = process.env.WEBHOOK_SECRET ?? '';

    let secretValid = false;
    try {
        if (
            typeof incomingSecret === 'string' &&
            expectedSecret.length > 0 &&
            incomingSecret.length === expectedSecret.length
        ) {
            secretValid = crypto.timingSafeEqual(
                Buffer.from(incomingSecret, 'utf8'),
                Buffer.from(expectedSecret, 'utf8')
            );
        }
    } catch {
        secretValid = false;
    }

    if (!secretValid) {
        // Stealth response — do NOT hint at auth failure
        console.warn(`[webhookReceiveLead] Invalid secret for agencyId="${agencyId}". IP: ${req.ip}`);
        res.status(200).json({ success: true });
        return;
    }

    // ── Parse incoming lead data ─────────────────────────────────────────────────
    let body: any;
    try {
        body = req.body || {};
    } catch {
        res.status(200).json({ success: true });
        return;
    }

    // ── Write to Firestore ───────────────────────────────────────────────────────
    try {
        await db.collection('leads').add({
            agencyId,
            name: body.name?.trim() ?? null,
            phone: body.phone?.trim() ?? null,
            email: body.email?.trim() ?? null,
            source: body.source?.trim() ?? 'webhook',
            requirements: {
                desiredCity: body.requirements?.desiredCity ?? [],
                maxBudget: body.requirements?.maxBudget ?? null,
                minRooms: body.requirements?.minRooms ?? null,
                propertyType: body.requirements?.propertyType ?? [],
            },
            assignedAgentId: null,
            notes: null,
            status: 'new',                              // Always injected server-side
            createdAt: FieldValue.serverTimestamp(),
        });

        console.info(`[webhookReceiveLead] Lead created for agencyId="${agencyId}".`);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('[webhookReceiveLead] Firestore write failed:', err);
        // We can either stealth error or 500 here. 
        // Returning 200 with success: true is strict stealth.
        res.status(200).json({ success: true });
    }
});
