import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { validateUserAuth } from '../config/authGuard';

// ─── Shared Field Type ────────────────────────────────────────────────────────
// Must mirror /front/src/shared/types.ts
interface Field {
    id: string;
    type: 'signature' | 'text' | 'date';
    role: 'agent' | 'client';
    value?: string; // base64 PNG for signature, plain string for text/date
    position: {
        x: number;      // normalized 0–1 (left edge, relative to page width)
        y: number;      // normalized 0–1 (top edge, relative to page height — HTML convention)
        width: number;  // normalized 0–1
        height: number; // normalized 0–1
        page: number;   // 1-indexed
    };
}

interface ContractData {
    pdfUrl: string;
    fields: Field[];
    status: string;
    dealId?: string;
}

const db = getFirestore();

export const signDeal = onCall({ cors: true }, async (request) => {
    // ── 1. Auth (supports both authenticated agents and anonymous clients) ────
    const { dealId, agencyId: requestAgencyId } = request.data as { dealId: string; agencyId?: string };

    // Determine if user is authenticated (agent) or anonymous (client)
    const isAnonymous = request.auth?.token?.firebase?.sign_in_provider === 'anonymous';
    let agencyId: string;
    let uid = '';
    let userEmail = '';

    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    if (isAnonymous) {
        // ── Anonymous client signing path ──────────────────────────────────────
        if (!requestAgencyId) {
            throw new HttpsError('invalid-argument', 'agencyId is required for anonymous signing.');
        }
        agencyId = requestAgencyId;
        uid = request.auth.uid;
        userEmail = 'anonymous@client.local'; // Placeholder for audit log
    } else {
        // ── Authenticated agent signing path ───────────────────────────────────
        const authData = await validateUserAuth(request);
        agencyId = authData.agencyId;
        uid = authData.uid;
        userEmail = authData.email;
    }

    if (!dealId) {
        throw new HttpsError('invalid-argument', 'dealId is required.');
    }

    // ── 2. Load deal ──────────────────────────────────────────────────────────
    const dealRef = db.collection('deals').doc(dealId);
    const dealSnap = await dealRef.get();

    if (!dealSnap.exists) {
        throw new HttpsError('not-found', 'Deal not found.');
    }

    const dealData = dealSnap.data() as {
        agencyId: string;
        contract?: { contractId: string; pdfUrl?: string; signedPdfUrl?: string; status?: string };
        [key: string]: any;
    };

    if (dealData.agencyId !== agencyId) {
        throw new HttpsError('permission-denied', 'You do not belong to this deal\'s agency.');
    }

    if (!dealData.contract?.contractId) {
        throw new HttpsError('failed-precondition', 'No contract is linked to this deal.');
    }

    if (dealData.contract.status === 'completed') {
        throw new HttpsError('already-exists', 'This contract has already been signed.');
    }

    // ── 3. Load contract + fields from Firestore ──────────────────────────────
    const contractRef = db
        .collection('agencies').doc(agencyId)
        .collection('contracts').doc(dealData.contract.contractId);

    const contractSnap = await contractRef.get();

    if (!contractSnap.exists) {
        throw new HttpsError('not-found', 'Contract document not found.');
    }

    const contractData = contractSnap.data() as ContractData;

    if (!contractData.pdfUrl) {
        throw new HttpsError('failed-precondition', 'Contract has no PDF attached.');
    }

    const fields: Field[] = contractData.fields || [];
    const filledFields = fields.filter(f => f.value && f.value.trim().length > 0);

    if (filledFields.length === 0) {
        throw new HttpsError(
            'failed-precondition',
            'No field values found. Client must submit field values before signing.'
        );
    }

    // ── 4. Fetch original PDF bytes ───────────────────────────────────────────
    // Node 20 has native fetch — no node-fetch import needed.
    let pdfBytes: ArrayBuffer;
    try {
        const res = await fetch(contractData.pdfUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        pdfBytes = await res.arrayBuffer();
    } catch (err: any) {
        throw new HttpsError('internal', `Failed to fetch PDF: ${err.message}`);
    }

    // ── 5. Load PDF and embed font ────────────────────────────────────────────
    let pdfDoc: PDFDocument;
    try {
        pdfDoc = await PDFDocument.load(pdfBytes);
    } catch (err: any) {
        throw new HttpsError('internal', `Failed to parse PDF: ${err.message}`);
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    // ── 6. Burn each field onto the PDF ───────────────────────────────────────
    for (const field of filledFields) {
        const pageIndex = (field.position.page || 1) - 1;
        const page = pages[pageIndex];

        if (!page) {
            console.warn(`[signDeal] Field "${field.id}" targets page ${field.position.page} but PDF only has ${pages.length} page(s). Skipping.`);
            continue;
        }

        const { width: pdfW, height: pdfH } = page.getSize();

        // Convert normalized 0-1 coordinates → PDF points.
        // HTML origin is top-left; pdf-lib origin is bottom-left → invert Y.
        const x      = field.position.x      * pdfW;
        const w      = field.position.width   * pdfW;
        const h      = field.position.height  * pdfH;
        // finalY positions the bottom-left corner of the field box in PDF space.
        const finalY = pdfH - (field.position.y * pdfH) - h;

        if (field.type === 'signature') {
            // ── Signature: embed PNG image ────────────────────────────────────
            try {
                const base64 = field.value!.replace(/^data:image\/\w+;base64,/, '');
                const imgBytes = Buffer.from(base64, 'base64');

                // Detect PNG vs JPEG by magic bytes
                const isPng = imgBytes[0] === 0x89 && imgBytes[1] === 0x50;
                const embeddedImg = isPng
                    ? await pdfDoc.embedPng(imgBytes)
                    : await pdfDoc.embedJpg(imgBytes);

                page.drawImage(embeddedImg, {
                    x,
                    y: finalY,
                    width: w,
                    height: h,
                    opacity: 1,
                });
            } catch (err: any) {
                console.error(`[signDeal] Failed to embed signature image for field "${field.id}":`, err.message);
                throw new HttpsError('internal', `Signature image embedding failed: ${err.message}`);
            }

        } else {
            // ── Text / Date: draw text string ─────────────────────────────────
            // Font size is derived from the field height so it scales naturally.
            // Cap between 8–18pt so tiny/huge boxes don't produce unreadable text.
            const fontSize = Math.min(18, Math.max(8, Math.round(h * 0.55)));

            // Baseline sits at ~20% up from the bottom of the field box,
            // giving a natural text-within-box appearance.
            const baselineY = finalY + h * 0.2;

            page.drawText(String(field.value), {
                x,
                y: baselineY,
                size: fontSize,
                font,
                color: rgb(0, 0, 0),
                maxWidth: w,
            });
        }
    }

    // ── 7. Save signed PDF to Firebase Storage ────────────────────────────────
    const signedPdfBytes = await pdfDoc.save();
    const storagePath = `agencies/${agencyId}/signed_contracts/${dealId}/signed_${Date.now()}.pdf`;
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    await file.save(Buffer.from(signedPdfBytes), {
        contentType: 'application/pdf',
        metadata: {
            metadata: {
                signedBy: uid,
                dealId,
                agencyId: agencyId,
            },
        },
    });

    await file.makePublic();
    const signedPdfUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    // ── 8. Capture IP for audit ───────────────────────────────────────────────
    const ip =
        (request.rawRequest?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        request.rawRequest?.headers?.['x-real-ip'] ||
        'unknown';

    // ── 9. Update Firestore: contract + deal (batched) ────────────────────────
    const batch = db.batch();

    batch.update(contractRef, {
        status: 'completed',
        signedPdfUrl,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    batch.update(dealRef, {
        'contract.signedPdfUrl': signedPdfUrl,
        'contract.status': 'completed',
        updatedAt: FieldValue.serverTimestamp(),
    });

    // ── 10. AuditLog entry ────────────────────────────────────────────────────
    const auditRef = db
        .collection('agencies').doc(agencyId)
        .collection('auditLogs').doc();

    batch.set(auditRef, {
        type: 'contract_signed',
        contractId: dealData.contract.contractId,
        dealId,
        agencyId: agencyId,
        signedBy: uid,
        signedByEmail: userEmail,
        ipAddress: ip,
        signedPdfUrl,
        fieldCount: filledFields.length,
        createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return { success: true, signedPdfUrl };
});
