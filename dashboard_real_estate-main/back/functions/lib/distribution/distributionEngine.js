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
exports.distributeToAgent = distributeToAgent;
exports.createAdminAlert = createAdminAlert;
const admin = __importStar(require("firebase-admin"));
const stringUtils_1 = require("../leads/stringUtils");
const db = admin.firestore();
function normalizeTransactionType(tt) {
    if (tt === 'forsale')
        return 'sale';
    return tt; // 'sale', 'rent', 'commercial' pass through
}
function applySmartFilter(candidates, transactionType, cities) {
    let filtered = candidates;
    // Agents with no specializations are generalists — keep them for any lead type
    if (transactionType) {
        const normalizedType = normalizeTransactionType(transactionType);
        filtered = filtered.filter(a => a.specializations.length === 0 || a.specializations.includes(normalizedType));
    }
    // Agents with no service areas cover everywhere — keep them for any city
    if (cities && cities.length > 0) {
        filtered = filtered.filter(a => a.serviceAreas.length === 0 || cities.some(city => (0, stringUtils_1.isCityMatch)(a.serviceAreas, city)));
    }
    return filtered; // may be empty — caller decides based on strictness
}
/**
 * Core distribution algorithm. Runs inside a Firestore transaction to prevent
 * race conditions when multiple leads arrive simultaneously.
 *
 * Returns the assigned agent info, or null if no eligible agent found.
 */
async function distributeToAgent(agencyId, targetDocRef, context, mode, strictness) {
    const cities = mode === 'lead'
        ? context.desiredCities
        : [context.city].filter(Boolean);
    let result = null;
    await db.runTransaction(async (t) => {
        // ALL READS FIRST (Firestore transaction requirement)
        const agentsSnap = await t.get(db.collection('users')
            .where('agencyId', '==', agencyId)
            .where('isActive', '==', true)
            .limit(20));
        if (agentsSnap.empty)
            return;
        // Filter: treat isAvailableForLeads === undefined as true
        const candidates = agentsSnap.docs
            .filter(doc => doc.data().isAvailableForLeads !== false)
            .map(doc => {
            const d = doc.data();
            return {
                ref: doc.ref,
                uid: doc.id,
                name: d.name || '',
                phone: d.phone,
                specializations: d.specializations || [],
                serviceAreas: d.serviceAreas || [],
                lastLeadAssignedAt: d.lastLeadAssignedAt || null,
                lastPropertyAssignedAt: d.lastPropertyAssignedAt || null,
            };
        });
        if (candidates.length === 0)
            return;
        let matched = applySmartFilter(candidates, context.transactionType, cities);
        if (matched.length === 0) {
            if (strictness === 'strict')
                return; // No match in strict mode → caller creates admin alert
            matched = candidates; // Flexible: fall back to all available agents
        }
        // Round-robin: agent with oldest assignment timestamp goes first (null = never assigned → first)
        const lastField = mode === 'lead' ? 'lastLeadAssignedAt' : 'lastPropertyAssignedAt';
        matched.sort((a, b) => {
            var _a, _b, _c, _d;
            const aMs = (_b = (_a = a[lastField]) === null || _a === void 0 ? void 0 : _a.toMillis()) !== null && _b !== void 0 ? _b : 0;
            const bMs = (_d = (_c = b[lastField]) === null || _c === void 0 ? void 0 : _c.toMillis()) !== null && _d !== void 0 ? _d : 0;
            return aMs - bMs;
        });
        const agent = matched[0];
        // WRITES (after all reads)
        if (mode === 'lead') {
            t.update(targetDocRef, { assignedAgentId: agent.uid });
            t.update(agent.ref, { lastLeadAssignedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        else {
            t.update(targetDocRef, {
                'management.assignedAgentId': agent.uid,
                'management.assignedAgentName': agent.name,
            });
            t.update(agent.ref, { lastPropertyAssignedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        result = {
            assignedAgentId: agent.uid,
            assignedAgentName: agent.name,
            assignedAgentPhone: agent.phone,
        };
    });
    return result;
}
async function createAdminAlert(agencyId, type, title, message, link) {
    await db.collection('alerts').add({
        agencyId,
        targetAgentId: 'all',
        type,
        title,
        message,
        link,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
//# sourceMappingURL=distributionEngine.js.map