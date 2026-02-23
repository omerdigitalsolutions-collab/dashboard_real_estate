"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerSystemAlert = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const db = (0, firestore_2.getFirestore)();
exports.triggerSystemAlert = (0, firestore_1.onDocumentUpdated)('deals/{dealId}', async (event) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    // We only care when the deal enters the "won" stage.
    if (before.stage !== 'won' && after.stage === 'won') {
        const agencyId = after.agencyId;
        const agentId = after.createdBy;
        const propertyId = after.propertyId;
        const actualCommission = (_d = (_c = after.actualCommission) !== null && _c !== void 0 ? _c : after.projectedCommission) !== null && _d !== void 0 ? _d : 0;
        // Fetch related entities for rich alert content
        let agentName = 'סוכן לא ידוע';
        let propertyAddress = 'נכס לא ידוע';
        try {
            const [userDoc, propDoc] = await Promise.all([
                db.doc(`users/${agentId}`).get(),
                db.doc(`properties/${propertyId}`).get()
            ]);
            if (userDoc.exists) {
                agentName = ((_e = userDoc.data()) === null || _e === void 0 ? void 0 : _e.displayName) || ((_f = userDoc.data()) === null || _f === void 0 ? void 0 : _f.email) || agentName;
            }
            if (propDoc.exists) {
                propertyAddress = ((_g = propDoc.data()) === null || _g === void 0 ? void 0 : _g.address) || propertyAddress;
            }
            // Create the broadcast alert document in the `alerts` collection
            await db.collection('alerts').add({
                agencyId,
                targetAgentId: 'all', // Broadcast to everyone in the agency
                title: 'עסקה חדשה נסגרה!',
                message: `סוכן ${agentName} סגר הרגע עסקה בנכס ${propertyAddress} עם עמלה פוטנציאלית של ${actualCommission.toLocaleString()} ש"ח!`,
                type: 'deal_won',
                isRead: false,
                relatedTo: {
                    id: event.params.dealId,
                    type: 'deal'
                },
                createdAt: firestore_2.FieldValue.serverTimestamp()
            });
            console.info(`[triggerSystemAlert] Broadcasted 'deal_won' alert for deal ${event.params.dealId} at ${agencyId}.`);
        }
        catch (err) {
            console.error(`[triggerSystemAlert] Error generating alert for deal ${event.params.dealId}:`, err);
        }
    }
});
//# sourceMappingURL=triggers.js.map