"use strict";
/**
 * ─── Bot Action Handlers ──────────────────────────────────────────────────────
 *
 * Functions that the WhatsApp WeBot can call via Gemini function-calling.
 * These handle CREATE-only operations: property, lead, and agent.
 *
 * Security:
 *   - All functions validate required fields before Firestore writes
 *   - No UPDATE or DELETE operations
 *   - Bot acts with the agency context only
 */
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
exports.createProperty = createProperty;
exports.createLead = createLead;
exports.createAgent = createAgent;
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
async function createProperty(agencyId, params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    // Required field validation
    if (!params.city || !params.city.trim()) {
        return { success: false, reason: 'missing_city', message: 'חסר שדה חובה: עיר.' };
    }
    if (!params.propertyType || !params.propertyType.trim()) {
        return { success: false, reason: 'missing_property_type', message: 'חסר שדה חובה: סוג נכס (דירה, בית, וכו׳).' };
    }
    if (typeof params.price !== 'number' || params.price <= 0) {
        return { success: false, reason: 'missing_price', message: 'חסר שדה חובה: מחיר תקין.' };
    }
    if (!params.transactionType || !['forsale', 'rent'].includes(params.transactionType)) {
        return { success: false, reason: 'invalid_transaction_type', message: 'סוג עסקה חייב להיות "למכירה" או "להשכרה".' };
    }
    try {
        const propertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc();
        const fullAddress = [params.street, params.city].filter(Boolean).join(', ');
        await propertyRef.set({
            id: propertyRef.id,
            agencyId,
            transactionType: params.transactionType,
            propertyType: params.propertyType.trim(),
            status: 'active',
            rooms: (_a = params.rooms) !== null && _a !== void 0 ? _a : null,
            floor: (_b = params.floor) !== null && _b !== void 0 ? _b : null,
            totalFloors: (_c = params.totalFloors) !== null && _c !== void 0 ? _c : null,
            squareMeters: (_d = params.squareMeters) !== null && _d !== void 0 ? _d : null,
            address: {
                city: params.city.trim(),
                street: ((_e = params.street) === null || _e === void 0 ? void 0 : _e.trim()) || null,
                neighborhood: ((_f = params.neighborhood) === null || _f === void 0 ? void 0 : _f.trim()) || null,
                fullAddress: fullAddress.trim(),
                coords: null,
            },
            features: {
                hasElevator: (_g = params.hasElevator) !== null && _g !== void 0 ? _g : null,
                hasParking: (_h = params.hasParking) !== null && _h !== void 0 ? _h : null,
                hasBalcony: (_j = params.hasBalcony) !== null && _j !== void 0 ? _j : null,
                hasMamad: null,
                hasStorage: null,
                isRenovated: null,
                isFurnished: null,
                hasAirConditioning: null,
            },
            financials: {
                price: Math.round(params.price),
                originalPrice: null,
            },
            media: {
                mainImage: null,
                images: [],
                videoTourUrl: null,
            },
            management: {
                assignedAgentId: null,
                descriptions: ((_k = params.description) === null || _k === void 0 ? void 0 : _k.trim()) || null,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[BotActions] Property created: ${propertyRef.id} in ${params.city}`);
        return {
            success: true,
            propertyId: propertyRef.id,
            message: `נכס חדש נוצר בהצלחה: ${params.propertyType} ב${params.city}.`,
        };
    }
    catch (err) {
        console.error('[BotActions] createProperty failed:', err === null || err === void 0 ? void 0 : err.message);
        return {
            success: false,
            reason: 'database_error',
            message: 'שגיאה בשמירת הנכס. אנא נסה שנית.',
        };
    }
}
async function createLead(agencyId, params) {
    var _a, _b, _c, _d;
    // Required field validation
    if (!params.name || !params.name.trim()) {
        return { success: false, reason: 'missing_name', message: 'חסר שדה חובה: שם הליד.' };
    }
    if (!params.phone || !params.phone.trim()) {
        return { success: false, reason: 'missing_phone', message: 'חסר שדה חובה: מספר טלפון.' };
    }
    try {
        let phone = params.phone.trim().replace(/\D/g, '');
        if (phone.startsWith('972'))
            phone = '0' + phone.substring(3);
        const existing = await db
            .collection('leads')
            .where('agencyId', '==', agencyId)
            .where('phone', '==', phone)
            .limit(1)
            .get();
        if (!existing.empty) {
            const existingId = existing.docs[0].id;
            console.log(`[BotActions] Lead already exists: ${existingId} | phone ${phone}`);
            return {
                success: true,
                leadId: existingId,
                message: `ליד קיים כבר במערכת: ${params.name}.`,
            };
        }
        const leadRef = db.collection('leads').doc();
        await leadRef.set({
            agencyId,
            name: params.name.trim(),
            phone,
            email: ((_a = params.email) === null || _a === void 0 ? void 0 : _a.trim()) || null,
            source: 'WhatsApp WeBot (Free Text)',
            type: 'buyer',
            status: 'new',
            requirements: {
                desiredCity: params.preferredCity ? [params.preferredCity.trim()] : [],
                maxBudget: (_b = params.maxBudget) !== null && _b !== void 0 ? _b : null,
                minRooms: (_c = params.desiredRooms) !== null && _c !== void 0 ? _c : null,
                propertyType: [],
            },
            notes: ((_d = params.notes) === null || _d === void 0 ? void 0 : _d.trim()) || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[BotActions] Lead created: ${leadRef.id} | ${params.name}`);
        return {
            success: true,
            leadId: leadRef.id,
            message: `ליד חדש נוצר בהצלחה: ${params.name}.`,
        };
    }
    catch (err) {
        console.error('[BotActions] createLead failed:', err === null || err === void 0 ? void 0 : err.message);
        return {
            success: false,
            reason: 'database_error',
            message: 'שגיאה בשמירת הליד. אנא נסה שנית.',
        };
    }
}
async function createAgent(agencyId, params) {
    var _a;
    // Required field validation
    if (!params.name || !params.name.trim()) {
        return { success: false, reason: 'missing_name', message: 'חסר שדה חובה: שם הסוכן.' };
    }
    if (!params.phone || !params.phone.trim()) {
        return { success: false, reason: 'missing_phone', message: 'חסר שדה חובה: מספר טלפון.' };
    }
    // Optional: Validate email if provided
    const normalizedEmail = ((_a = params.email) === null || _a === void 0 ? void 0 : _a.trim()) || null;
    if (normalizedEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return { success: false, reason: 'invalid_email', message: 'כתובת דוא״ל אינה תקינה.' };
        }
    }
    const normalizedRole = params.role === 'admin' ? 'admin' : 'agent';
    try {
        // Check if email already exists (if provided)
        if (normalizedEmail) {
            const existingSnap = await db
                .collection('users')
                .where('email', '==', normalizedEmail)
                .limit(1)
                .get();
            if (!existingSnap.empty) {
                const existingDoc = existingSnap.docs[0];
                if (existingDoc.data().uid) {
                    // Don't expose 'email_exists' reason — avoids email enumeration
                    return {
                        success: false,
                        reason: 'invalid_input',
                        message: 'לא ניתן ליצור את הסוכן עם הפרטים שסופקו.',
                    };
                }
            }
        }
        const agentRef = db.collection('users').doc();
        await agentRef.set({
            uid: null, // Will be populated when the user signs up
            email: normalizedEmail,
            name: params.name.trim(),
            phone: params.phone.trim(),
            role: normalizedRole,
            agencyId,
            isActive: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[BotActions] Agent created: ${agentRef.id} | ${params.name} | role=${normalizedRole}`);
        return {
            success: true,
            agentId: agentRef.id,
            message: `סוכן חדש נוצר בהצלחה: ${params.name} (${normalizedRole === 'admin' ? 'מנהל' : 'סוכן'}).`,
        };
    }
    catch (err) {
        console.error('[BotActions] createAgent failed:', err === null || err === void 0 ? void 0 : err.message);
        return {
            success: false,
            reason: 'database_error',
            message: 'שגיאה בשמירת הסוכן. אנא נסה שנית.',
        };
    }
}
//# sourceMappingURL=botActions.js.map