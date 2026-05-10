"use strict";
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
exports.distributeLead = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const distributionEngine_1 = require("./distributionEngine");
const whatsappService_1 = require("../whatsappService");
const db = admin.firestore();
/**
 * Triggered when a new lead document is created.
 * If the lead is unassigned and the agency has distribution enabled,
 * finds the best matching available agent and assigns the lead atomically.
 */
exports.distributeLead = (0, firestore_1.onDocumentCreated)({ document: 'leads/{leadId}' }, async (event) => {
    var _a, _b, _c;
    const leadSnap = event.data;
    if (!leadSnap)
        return;
    const lead = leadSnap.data();
    const leadId = event.params.leadId;
    const agencyId = lead.agencyId;
    // Exit early: already assigned (e.g., created via missed call handler)
    if (lead.assignedAgentId)
        return;
    if (!agencyId)
        return;
    const agencyDoc = await db.doc(`agencies/${agencyId}`).get();
    if (!agencyDoc.exists)
        return;
    const agencyData = agencyDoc.data();
    const config = agencyData.distributionConfig;
    // Exit early: distribution not enabled for leads
    if (!(config === null || config === void 0 ? void 0 : config.leadsEnabled))
        return;
    const strictness = config.strictness === 'strict' ? 'strict' : 'flexible';
    const context = {
        transactionType: (_a = lead.requirements) === null || _a === void 0 ? void 0 : _a.transactionType,
        desiredCities: ((_b = lead.requirements) === null || _b === void 0 ? void 0 : _b.desiredCity) || [],
    };
    const leadRef = db.doc(`leads/${leadId}`);
    const result = await (0, distributionEngine_1.distributeToAgent)(agencyId, leadRef, context, 'lead', strictness);
    if (!result) {
        // No eligible agent found → notify admin
        await (0, distributionEngine_1.createAdminAlert)(agencyId, 'unassigned_lead', 'ליד לא שויך אוטומטית', `ליד חדש (${lead.name || 'לא ידוע'}) לא נמצא לו סוכן מתאים — נא לשייך ידנית`, `/dashboard/leads/${leadId}`);
        console.log(`[distributeLead] No eligible agent for lead ${leadId} — admin alert created`);
        return;
    }
    // Create in-app alert for the assigned agent
    await db.collection('alerts').add({
        agencyId,
        targetAgentId: result.assignedAgentId,
        type: 'lead_assigned',
        title: 'ליד חדש שויך אליך',
        message: `ליד חדש (${lead.name || 'לא ידוע'}) שויך אליך אוטומטית`,
        link: `/dashboard/leads/${leadId}`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // WhatsApp notification to assigned agent
    const integration = ((_c = agencyData.whatsappIntegration) === null || _c === void 0 ? void 0 : _c.isConnected)
        ? agencyData.whatsappIntegration
        : undefined;
    if (integration && result.assignedAgentPhone) {
        const cities = context.desiredCities.filter(Boolean).join(', ');
        const locationPart = cities ? `ב${cities}` : '';
        const msg = `🔥 ליד חדש! ${lead.name || 'לקוח'} ${locationPart ? `מחפש ${locationPart}` : ''}. ` +
            `הוא מחכה לשיחה ממך. https://app.homer-crm.co.il/dashboard/leads/${leadId}`;
        await (0, whatsappService_1.sendWhatsAppMessage)(integration, result.assignedAgentPhone, msg)
            .catch(err => console.error('[distributeLead] WhatsApp notification failed:', err));
    }
    console.log(`[distributeLead] Lead ${leadId} → agent ${result.assignedAgentId} (${result.assignedAgentName})`);
});
//# sourceMappingURL=distributeLead.js.map