import * as admin from 'firebase-admin';
import { CallLeadPayload } from '../ai/textToAction';

/**
 * Creates or updates a lead based on AI-extracted data from a phone call.
 * Uses phone number deduplication: if a lead with the same phone already exists
 * in this agency, it is updated rather than duplicated.
 */
export async function processCallRecording(params: {
    agencyId: string;
    agentId: string;
    callSid: string;
    aiResult: CallLeadPayload;
    callerPhone: string;
}): Promise<{ leadId: string; leadCreated: boolean }> {
    const { agencyId, agentId, callSid, aiResult, callerPhone } = params;
    const db = admin.firestore();

    // Phone dedup
    const existingSnap = await db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .where('phone', '==', callerPhone)
        .limit(1)
        .get();

    let leadId: string;
    let leadCreated = false;

    if (!existingSnap.empty) {
        // Update existing lead with call data
        const existingLead = existingSnap.docs[0];
        leadId = existingLead.id;
        const existingData = existingLead.data();

        const updatedReqs: Record<string, unknown> = { ...existingData.requirements };
        if (aiResult.budget_max !== null) updatedReqs.maxBudget = aiResult.budget_max;
        if (aiResult.rooms !== null) {
            updatedReqs.minRooms = aiResult.rooms;
            updatedReqs.maxRooms = aiResult.rooms;
        }
        if (aiResult.preferred_location) {
            const existing = (existingData.requirements?.desiredCity as string[]) ?? [];
            if (!existing.includes(aiResult.preferred_location)) {
                updatedReqs.desiredCity = [...existing, aiResult.preferred_location];
            }
        }
        if (aiResult.transaction_type) {
            updatedReqs.transactionType = aiResult.transaction_type;
        }
        if (aiResult.property_type) {
            const existing = (existingData.requirements?.propertyType as string[]) ?? [];
            if (!existing.includes(aiResult.property_type)) {
                updatedReqs.propertyType = [...existing, aiResult.property_type];
            }
        }

        await db.collection('leads').doc(leadId).update({
            ...(aiResult.clientName && existingData.name === callerPhone
                ? { name: aiResult.clientName }
                : {}),
            requirements: updatedReqs,
            lastCallId: callSid,
            lastCallAt: admin.firestore.FieldValue.serverTimestamp(),
            callCount: admin.firestore.FieldValue.increment(1),
        });
    } else {
        // Create new lead
        const newLead = await db.collection('leads').add({
            agencyId,
            name: aiResult.clientName ?? callerPhone,
            phone: callerPhone,
            email: null,
            source: 'inbound_call',
            assignedAgentId: agentId,
            status: 'new',
            requirements: {
                desiredCity: aiResult.preferred_location ? [aiResult.preferred_location] : [],
                maxBudget: aiResult.budget_max ?? null,
                minRooms: aiResult.rooms ?? null,
                maxRooms: aiResult.rooms ?? null,
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
                transactionType: aiResult.transaction_type ?? undefined,
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

    console.log(
        `[processCallRecording] callSid=${callSid} leadId=${leadId} created=${leadCreated}`
    );
    return { leadId, leadCreated };
}
