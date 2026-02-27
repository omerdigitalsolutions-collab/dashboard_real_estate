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
exports.onPropertyCreatedMatchmaking = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Triggered whenever a new document is added to the `properties` collection.
 * Finds all active leads in the same agency who are looking to buy (`intent == 'buy'`),
 * compares basic matching criteria (city and budget), and generates an alert.
 */
exports.onPropertyCreatedMatchmaking = (0, firestore_1.onDocumentCreated)('properties/{propertyId}', async (event) => {
    const propertyId = event.params.propertyId;
    const propertySnap = event.data;
    if (!propertySnap)
        return;
    const propertyData = propertySnap.data();
    const agencyId = propertyData.agencyId;
    const propertyCity = propertyData.city;
    const propertyPrice = propertyData.price;
    const propertyVat = propertyData.vat || false;
    // Only proceed if it is a property for sale/rent that has actual details
    // (If it's just a WhatsApp 'draft', it might not have price or city yet)
    if (!agencyId || !propertyCity || propertyPrice === undefined) {
        console.log(`Matchmaking skipped for ${propertyId}: Missing city, price, or agencyId.`);
        return;
    }
    try {
        // Find all active 'buy' (or 'rent', depending on your standard `intent` definition) leads in the same agency
        const leadsSnap = await db.collection('leads')
            .where('agencyId', '==', agencyId)
            .where('status', 'not-in', ['lost', 'won']) // Assuming you don't match closed leads
            .get();
        if (leadsSnap.empty) {
            return;
        }
        // We will batch our notification creation
        const batch = db.batch();
        let matchCount = 0;
        leadsSnap.docs.forEach((doc) => {
            const lead = doc.data();
            const reqs = lead.requirements;
            // Skip leads with no requirements
            if (!reqs)
                return;
            let isMatch = true;
            // 1. Check City Intent
            if (reqs.desiredCity && Array.isArray(reqs.desiredCity) && reqs.desiredCity.length > 0) {
                if (!reqs.desiredCity.includes(propertyCity)) {
                    isMatch = false;
                }
            }
            // 2. Check Max Budget
            if (isMatch && reqs.maxBudget) {
                // Note: complex VAT inclusive/exclusive logic could go here
                if (propertyPrice > reqs.maxBudget) {
                    isMatch = false;
                }
            }
            // 3. Check Min Rooms
            if (isMatch && reqs.minRooms && propertyData.rooms != null) {
                if (propertyData.rooms < reqs.minRooms) {
                    isMatch = false;
                }
            }
            if (isMatch) {
                matchCount++;
                const notificationRef = db.collection('alerts').doc();
                batch.set(notificationRef, {
                    agencyId,
                    targetAgentId: doc.data().assignedAgentId || 'all',
                    type: 'property_match',
                    title: 'התאמת נכס חדשה!',
                    message: `הנכס החדש שנוסף ב${propertyCity} מתאים במדויק ללקוח ${lead.name || 'שלך'}!`,
                    link: `/dashboard/leads/${doc.id}`,
                    propertyId: propertyId,
                    leadId: doc.id,
                    isRead: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                console.log(`Matchmaking: Property ${propertyId} matched with Lead ${doc.id}`);
            }
        });
        if (matchCount > 0) {
            await batch.commit();
            console.log(`Matchmaking complete for ${propertyId}. Generated ${matchCount} notifications.`);
        }
    }
    catch (err) {
        console.error(`Error during matchmaking for property ${propertyId}:`, err);
    }
});
//# sourceMappingURL=matchmaking.js.map