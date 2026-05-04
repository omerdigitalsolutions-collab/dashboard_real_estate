import * as admin from 'firebase-admin';
import { sendWhatsAppMessage, WhatsappIntegration } from '../whatsappService';

/**
 * Handles the full missed-call flow:
 *  1. Create/find lead for the caller's phone number
 *  2. Create a high-priority callback task assigned to the agent
 *  3. Create a personal alert for the agent
 *  4. Send a WhatsApp message to the caller (if WhatsApp is connected)
 */
export async function handleMissedCall(params: {
    agencyId: string;
    agentId: string;
    callerPhone: string;
    callSid: string;
}): Promise<void> {
    const { agencyId, agentId, callerPhone, callSid } = params;
    const db = admin.firestore();

    // 1. Phone dedup — find existing lead or create new one
    const existingSnap = await db
        .collection('leads')
        .where('agencyId', '==', agencyId)
        .where('phone', '==', callerPhone)
        .limit(1)
        .get();

    let leadId: string;
    let leadCreated = false;

    if (!existingSnap.empty) {
        leadId = existingSnap.docs[0].id;
        await db.collection('leads').doc(leadId).update({
            lastCallId: callSid,
            lastCallAt: admin.firestore.FieldValue.serverTimestamp(),
            callCount: admin.firestore.FieldValue.increment(1),
        });
    } else {
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
        assignedToAgentId: agentId,
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
        const integration = agencyData?.whatsappIntegration as WhatsappIntegration | undefined;

        if (integration?.isConnected && integration.idInstance && integration.apiTokenInstance) {
            await sendWhatsAppMessage(
                integration,
                callerPhone,
                'היי! התקשרת אלינו ולא הצלחנו לענות. נחזור אליך בהקדם האפשרי 🏠'
            );
        }
    } catch (err) {
        // WhatsApp failure is non-critical — log and continue
        console.error('[handleMissedCall] WhatsApp send failed:', err);
    }

    console.log(
        `[handleMissedCall] callSid=${callSid} callerPhone=REDACTED leadId=${leadId} leadCreated=${leadCreated}`
    );
}
