"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signDeal = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const pdf_lib_1 = require("pdf-lib");
const authGuard_1 = require("../config/authGuard");
const notifyContractSigned_1 = require("./notifyContractSigned");
const db = (0, firestore_1.getFirestore)();
exports.signDeal = (0, https_1.onCall)({ cors: true, secrets: [notifyContractSigned_1.resendApiKeyForContracts] }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    // ── 1. Auth (supports both authenticated agents and anonymous clients) ────
    const { dealId, agencyId: requestAgencyId } = request.data;
    // Determine if user is authenticated (agent) or anonymous (client)
    const isAnonymous = ((_c = (_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.firebase) === null || _c === void 0 ? void 0 : _c.sign_in_provider) === 'anonymous';
    let agencyId;
    let uid = '';
    let userEmail = '';
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    if (isAnonymous) {
        // ── Anonymous client signing path ──────────────────────────────────────
        if (!requestAgencyId) {
            throw new https_1.HttpsError('invalid-argument', 'agencyId is required for anonymous signing.');
        }
        agencyId = requestAgencyId;
        uid = request.auth.uid;
        userEmail = 'anonymous@client.local'; // Placeholder for audit log
    }
    else {
        // ── Authenticated agent signing path ───────────────────────────────────
        const authData = await (0, authGuard_1.validateUserAuth)(request);
        agencyId = authData.agencyId;
        uid = authData.uid;
        userEmail = authData.email;
    }
    if (!dealId) {
        throw new https_1.HttpsError('invalid-argument', 'dealId is required.');
    }
    // ── 2. Load deal ──────────────────────────────────────────────────────────
    const dealRef = db.collection('deals').doc(dealId);
    const dealSnap = await dealRef.get();
    if (!dealSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Deal not found.');
    }
    const dealData = dealSnap.data();
    if (dealData.agencyId !== agencyId) {
        throw new https_1.HttpsError('permission-denied', 'You do not belong to this deal\'s agency.');
    }
    if (!((_d = dealData.contract) === null || _d === void 0 ? void 0 : _d.contractId)) {
        throw new https_1.HttpsError('failed-precondition', 'No contract is linked to this deal.');
    }
    if (dealData.contract.status === 'completed') {
        throw new https_1.HttpsError('already-exists', 'This contract has already been signed.');
    }
    // ── 3. Load contract + fields from Firestore ──────────────────────────────
    const contractRef = db
        .collection('agencies').doc(agencyId)
        .collection('contracts').doc(dealData.contract.contractId);
    const contractSnap = await contractRef.get();
    if (!contractSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Contract document not found.');
    }
    const contractData = contractSnap.data();
    if (!contractData.pdfUrl) {
        throw new https_1.HttpsError('failed-precondition', 'Contract has no PDF attached.');
    }
    const fields = contractData.fields || [];
    const filledFields = fields.filter(f => f.value && f.value.trim().length > 0);
    if (filledFields.length === 0) {
        throw new https_1.HttpsError('failed-precondition', 'No field values found. Client must submit field values before signing.');
    }
    // ── 4. Fetch original PDF bytes ───────────────────────────────────────────
    // Node 20 has native fetch — no node-fetch import needed.
    let pdfBytes;
    try {
        const res = await fetch(contractData.pdfUrl);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        pdfBytes = await res.arrayBuffer();
    }
    catch (err) {
        throw new https_1.HttpsError('internal', `Failed to fetch PDF: ${err.message}`);
    }
    // ── 5. Load PDF and embed font ────────────────────────────────────────────
    let pdfDoc;
    try {
        pdfDoc = await pdf_lib_1.PDFDocument.load(pdfBytes);
    }
    catch (err) {
        throw new https_1.HttpsError('internal', `Failed to parse PDF: ${err.message}`);
    }
    const font = await pdfDoc.embedFont(pdf_lib_1.StandardFonts.Helvetica);
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
        const x = field.position.x * pdfW;
        const w = field.position.width * pdfW;
        const h = field.position.height * pdfH;
        // finalY positions the bottom-left corner of the field box in PDF space.
        const finalY = pdfH - (field.position.y * pdfH) - h;
        if (field.type === 'signature') {
            // ── Signature: embed PNG image ────────────────────────────────────
            try {
                const base64 = field.value.replace(/^data:image\/\w+;base64,/, '');
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
            }
            catch (err) {
                console.error(`[signDeal] Failed to embed signature image for field "${field.id}":`, err.message);
                throw new https_1.HttpsError('internal', `Signature image embedding failed: ${err.message}`);
            }
        }
        else {
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
                color: (0, pdf_lib_1.rgb)(0, 0, 0),
                maxWidth: w,
            });
        }
    }
    // ── 7. Save signed PDF to Firebase Storage ────────────────────────────────
    const signedPdfBytes = await pdfDoc.save();
    const storagePath = `agencies/${agencyId}/signed_contracts/${dealId}/signed_${Date.now()}.pdf`;
    const bucket = (0, storage_1.getStorage)().bucket();
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
    const ip = ((_h = (_g = (_f = (_e = request.rawRequest) === null || _e === void 0 ? void 0 : _e.headers) === null || _f === void 0 ? void 0 : _f['x-forwarded-for']) === null || _g === void 0 ? void 0 : _g.split(',')[0]) === null || _h === void 0 ? void 0 : _h.trim()) ||
        ((_k = (_j = request.rawRequest) === null || _j === void 0 ? void 0 : _j.headers) === null || _k === void 0 ? void 0 : _k['x-real-ip']) ||
        'unknown';
    // ── 9. Update Firestore: contract + deal (batched) ────────────────────────
    const batch = db.batch();
    batch.update(contractRef, {
        status: 'completed',
        signedPdfUrl,
        completedAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    batch.update(dealRef, {
        'contract.signedPdfUrl': signedPdfUrl,
        'contract.status': 'completed',
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    // ── 11. Send notifications (email to client/agent/admin + system alert) ──
    // Must be awaited: Cloud Functions v2 terminates on return, so fire-and-forget
    // would silently drop emails before they complete.
    try {
        await (0, notifyContractSigned_1.notifyContractSigned)({
            agencyId,
            dealId,
            signedPdfUrl,
        });
    }
    catch (err) {
        console.error('[signDeal] notifyContractSigned failed (non-fatal):', err);
    }
    return { success: true, signedPdfUrl };
});
//# sourceMappingURL=signDeal.js.map