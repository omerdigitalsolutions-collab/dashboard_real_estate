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
exports.distributeProperty = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const distributionEngine_1 = require("./distributionEngine");
const whatsappService_1 = require("../whatsappService");
const db = admin.firestore();
/**
 * Triggered when a new property document is created under an agency.
 * If the property is unassigned and the agency has distribution enabled,
 * finds the best matching available agent and assigns the property atomically.
 */
exports.distributeProperty = (0, firestore_1.onDocumentCreated)({ document: 'agencies/{agencyId}/properties/{propertyId}' }, async (event) => {
    var _a, _b, _c;
    const propertySnap = event.data;
    if (!propertySnap)
        return;
    const property = propertySnap.data();
    const propertyId = event.params.propertyId;
    const agencyId = event.params.agencyId;
    // Exit early: already assigned
    if ((_a = property.management) === null || _a === void 0 ? void 0 : _a.assignedAgentId)
        return;
    const agencyDoc = await db.doc(`agencies/${agencyId}`).get();
    if (!agencyDoc.exists)
        return;
    const agencyData = agencyDoc.data();
    const config = agencyData.distributionConfig;
    // Exit early: distribution not enabled for properties
    if (!(config === null || config === void 0 ? void 0 : config.propertiesEnabled))
        return;
    const strictness = config.strictness === 'strict' ? 'strict' : 'flexible';
    const city = ((_b = property.address) === null || _b === void 0 ? void 0 : _b.city) || '';
    const context = {
        transactionType: property.transactionType,
        city,
    };
    const propertyRef = db.doc(`agencies/${agencyId}/properties/${propertyId}`);
    const result = await (0, distributionEngine_1.distributeToAgent)(agencyId, propertyRef, context, 'property', strictness);
    if (!result) {
        await (0, distributionEngine_1.createAdminAlert)(agencyId, 'unassigned_property', 'נכס לא שויך אוטומטית', `נכס חדש ב${city || 'מיקום לא ידוע'} לא נמצא לו סוכן מתאים — נא לשייך ידנית`, `/dashboard/properties/${propertyId}`);
        console.log(`[distributeProperty] No eligible agent for property ${propertyId} — admin alert created`);
        return;
    }
    // In-app alert for assigned agent
    await db.collection('alerts').add({
        agencyId,
        targetAgentId: result.assignedAgentId,
        type: 'property_assigned',
        title: 'נכס חדש שויך אליך',
        message: `נכס חדש ב${city || 'מיקום לא ידוע'} שויך אליך אוטומטית`,
        link: `/dashboard/properties/${propertyId}`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // WhatsApp notification to assigned agent
    const integration = ((_c = agencyData.whatsappIntegration) === null || _c === void 0 ? void 0 : _c.isConnected)
        ? agencyData.whatsappIntegration
        : undefined;
    if (integration && result.assignedAgentPhone) {
        const txLabel = property.transactionType === 'rent' ? 'להשכרה' : 'למכירה';
        const rooms = property.rooms ? `${property.rooms} חדרים ` : '';
        const msg = `🏠 נכס חדש שויך אליך! ${rooms}${txLabel} ב${city || 'מיקום לא ידוע'}. ` +
            `https://app.homer-crm.co.il/dashboard/properties/${propertyId}`;
        await (0, whatsappService_1.sendWhatsAppMessage)(integration, result.assignedAgentPhone, msg)
            .catch(err => console.error('[distributeProperty] WhatsApp notification failed:', err));
    }
    console.log(`[distributeProperty] Property ${propertyId} → agent ${result.assignedAgentId} (${result.assignedAgentName})`);
});
//# sourceMappingURL=distributeProperty.js.map