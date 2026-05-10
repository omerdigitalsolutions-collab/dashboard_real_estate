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
exports.handleMissedCall = handleMissedCall;
const admin = __importStar(require("firebase-admin"));
const whatsappService_1 = require("../whatsappService");
/**
 * Handles the full missed-call flow:
 *  1. Create/find lead for the caller's phone number
 *  2. Create a high-priority callback task assigned to the agent
 *  3. Create a personal alert for the agent
 *  4. Send a WhatsApp message to the caller (if WhatsApp is connected)
 */
async function handleMissedCall(params) {
    const { agencyId, agentId, callerPhone, callSid } = params;
    const db = admin.firestore();
    // 1. Phone dedup — find existing lead or create new one
    const existingSnap = await db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .where('phone', '==', callerPhone)
        .limit(1)
        .get();
    let leadId;
    let leadCreated = false;
    if (!existingSnap.empty) {
        leadId = existingSnap.docs[0].id;
        await db.collection('leads').doc(leadId).update({
            lastCallId: callSid,
            lastCallAt: admin.firestore.FieldValue.serverTimestamp(),
            callCount: admin.firestore.FieldValue.increment(1),
        });
    }
    else {
        const newLead = await db.collection('leads').add({
            agencyId,
            name: callerPhone,
            phone: callerPhone,
            email: null,
            source: 'missed_call',
            assignedAgentId: agentId,
            status: 'new',
            requirements: {
                desiredCity: [],
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
            lastCallId: callSid,
            lastCallAt: admin.firestore.FieldValue.serverTimestamp(),
            callCount: 1,
            isBotActive: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        leadId = newLead.id;
        leadCreated = true;
    }
    // Update callLogs with leadId
    await db.collection('callLogs').doc(callSid).update({
        leadId,
        leadCreated,
        missedCallHandled: true,
    });
    // 2. Create callback task (due in 2 hours)
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + 2);
    await db.collection('tasks').add({
        agencyId,
        title: `החזר שיחה ל-${callerPhone}`,
        description: `שיחה שלא נענתה מ-${callerPhone}`,
        priority: 'High',
        status: 'pending',
        dueDate: admin.firestore.Timestamp.fromDate(dueDate),
        assignedToAgentIds: [agentId],
        relatedTo: { type: 'lead', id: leadId },
        createdBy: 'system',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // 3. Personal alert for the agent
    await db.collection('alerts').add({
        agencyId,
        type: 'warning',
        targetAgentId: agentId,
        message: `שיחה שלא נענתה מ-${callerPhone}`,
        relatedId: leadId,
        relatedType: 'lead',
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // 4. WhatsApp auto-reply — only if the agency has an active integration
    try {
        const agencySnap = await db.collection('agencies').doc(agencyId).get();
        const agencyData = agencySnap.data();
        const integration = agencyData === null || agencyData === void 0 ? void 0 : agencyData.whatsappIntegration;
        if ((integration === null || integration === void 0 ? void 0 : integration.isConnected) && integration.idInstance && integration.apiTokenInstance) {
            await (0, whatsappService_1.sendWhatsAppMessage)(integration, callerPhone, 'היי! התקשרת אלינו ולא הצלחנו לענות. נחזור אליך בהקדם האפשרי 🏠');
        }
    }
    catch (err) {
        // WhatsApp failure is non-critical — log and continue
        console.error('[handleMissedCall] WhatsApp send failed:', err);
    }
    console.log(`[handleMissedCall] callSid=${callSid} callerPhone=REDACTED leadId=${leadId} leadCreated=${leadCreated}`);
}
//# sourceMappingURL=handleMissedCall.js.map