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
exports.processCallRecording = processCallRecording;
const admin = __importStar(require("firebase-admin"));
/**
 * Creates or updates a lead based on AI-extracted data from a phone call.
 * Uses phone number deduplication: if a lead with the same phone already exists
 * in this agency, it is updated rather than duplicated.
 */
async function processCallRecording(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const { agencyId, agentId, callSid, aiResult, callerPhone } = params;
    const db = admin.firestore();
    // Phone dedup
    const existingSnap = await db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .where('phone', '==', callerPhone)
        .limit(1)
        .get();
    let leadId;
    let leadCreated = false;
    if (!existingSnap.empty) {
        // Update existing lead with call data
        const existingLead = existingSnap.docs[0];
        leadId = existingLead.id;
        const existingData = existingLead.data();
        const updatedReqs = Object.assign({}, existingData.requirements);
        if (aiResult.budget_max !== null)
            updatedReqs.maxBudget = aiResult.budget_max;
        if (aiResult.rooms !== null) {
            updatedReqs.minRooms = aiResult.rooms;
            updatedReqs.maxRooms = aiResult.rooms;
        }
        if (aiResult.preferred_location) {
            const existing = (_b = (_a = existingData.requirements) === null || _a === void 0 ? void 0 : _a.desiredCity) !== null && _b !== void 0 ? _b : [];
            if (!existing.includes(aiResult.preferred_location)) {
                updatedReqs.desiredCity = [...existing, aiResult.preferred_location];
            }
        }
        if (aiResult.transaction_type) {
            updatedReqs.transactionType = aiResult.transaction_type;
        }
        if (aiResult.property_type) {
            const existing = (_d = (_c = existingData.requirements) === null || _c === void 0 ? void 0 : _c.propertyType) !== null && _d !== void 0 ? _d : [];
            if (!existing.includes(aiResult.property_type)) {
                updatedReqs.propertyType = [...existing, aiResult.property_type];
            }
        }
        await db.collection('leads').doc(leadId).update(Object.assign(Object.assign({}, (aiResult.clientName && existingData.name === callerPhone
            ? { name: aiResult.clientName }
            : {})), { requirements: updatedReqs, lastCallId: callSid, lastCallAt: admin.firestore.FieldValue.serverTimestamp(), callCount: admin.firestore.FieldValue.increment(1) }));
    }
    else {
        // Create new lead
        const newLead = await db.collection('leads').add({
            agencyId,
            name: (_e = aiResult.clientName) !== null && _e !== void 0 ? _e : callerPhone,
            phone: callerPhone,
            email: null,
            source: 'inbound_call',
            assignedAgentId: agentId,
            status: 'new',
            requirements: {
                desiredCity: aiResult.preferred_location ? [aiResult.preferred_location] : [],
                maxBudget: (_f = aiResult.budget_max) !== null && _f !== void 0 ? _f : null,
                minRooms: (_g = aiResult.rooms) !== null && _g !== void 0 ? _g : null,
                maxRooms: (_h = aiResult.rooms) !== null && _h !== void 0 ? _h : null,
                minSizeSqf: null,
                floorMin: null,
                floorMax: null,
                propertyType: aiResult.property_type ? [aiResult.property_type] : [],
                mustHaveElevator: false,
                mustHaveParking: false,
                mustHaveBalcony: false,
                mustHaveSafeRoom: false,
                condition: 'any',
                urgency: 'flexible',
                transactionType: (_j = aiResult.transaction_type) !== null && _j !== void 0 ? _j : undefined,
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
    // Link callLog to lead
    await db.collection('callLogs').doc(callSid).update({
        leadId,
        leadCreated,
        clientName: aiResult.clientName,
        transcription: aiResult.transcription,
        summary: aiResult.summary,
    });
    console.log(`[processCallRecording] callSid=${callSid} leadId=${leadId} created=${leadCreated}`);
    return { leadId, leadCreated };
}
//# sourceMappingURL=processCallRecording.js.map