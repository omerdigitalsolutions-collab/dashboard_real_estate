"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addProperty = void 0;
/**
 * addProperty — Creates a new property document under agencies/{agencyId}/properties.
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const authGuard_1 = require("../config/authGuard");
const db = (0, firestore_1.getFirestore)();
exports.addProperty = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15;
    const authData = await (0, authGuard_1.validateUserAuth)(request);
    const agencyId = authData.agencyId;
    const data = request.data;
    // ── Validation ──────────────────────────────────────────────────────────────
    const city = ((_a = data.address) === null || _a === void 0 ? void 0 : _a.city) || data.city;
    const price = (_c = (_b = data.financials) === null || _b === void 0 ? void 0 : _b.price) !== null && _c !== void 0 ? _c : data.price;
    if (!(city === null || city === void 0 ? void 0 : city.trim()))
        throw new https_1.HttpsError('invalid-argument', 'address.city is required.');
    if (!price || price <= 0)
        throw new https_1.HttpsError('invalid-argument', 'financials.price must be positive.');
    const fullAddress = ((_d = data.address) === null || _d === void 0 ? void 0 : _d.fullAddress) ||
        `${((_e = data.address) === null || _e === void 0 ? void 0 : _e.street) || data.street || ''} ${city}`.trim();
    // ── Write to subcollection ──────────────────────────────────────────────────
    const propertyRef = db.collection('agencies').doc(agencyId).collection('properties').doc();
    await propertyRef.set(Object.assign({ agencyId, transactionType: data.transactionType || (data.type === 'rent' ? 'rent' : 'forsale'), propertyType: data.propertyType || '', status: data.status || 'active', rooms: (_f = data.rooms) !== null && _f !== void 0 ? _f : null, floor: (_g = data.floor) !== null && _g !== void 0 ? _g : null, totalFloors: (_h = data.totalFloors) !== null && _h !== void 0 ? _h : null, squareMeters: (_j = data.squareMeters) !== null && _j !== void 0 ? _j : null, address: {
            city: city.trim(),
            street: ((_k = data.address) === null || _k === void 0 ? void 0 : _k.street) || data.street || '',
            number: ((_l = data.address) === null || _l === void 0 ? void 0 : _l.number) || '',
            neighborhood: ((_m = data.address) === null || _m === void 0 ? void 0 : _m.neighborhood) || '',
            fullAddress,
        }, features: {
            hasElevator: (_p = (_o = data.features) === null || _o === void 0 ? void 0 : _o.hasElevator) !== null && _p !== void 0 ? _p : null,
            hasParking: (_r = (_q = data.features) === null || _q === void 0 ? void 0 : _q.hasParking) !== null && _r !== void 0 ? _r : null,
            parkingSpots: (_t = (_s = data.features) === null || _s === void 0 ? void 0 : _s.parkingSpots) !== null && _t !== void 0 ? _t : null,
            hasBalcony: (_v = (_u = data.features) === null || _u === void 0 ? void 0 : _u.hasBalcony) !== null && _v !== void 0 ? _v : null,
            hasMamad: (_x = (_w = data.features) === null || _w === void 0 ? void 0 : _w.hasMamad) !== null && _x !== void 0 ? _x : null,
            hasStorage: (_z = (_y = data.features) === null || _y === void 0 ? void 0 : _y.hasStorage) !== null && _z !== void 0 ? _z : null,
            isRenovated: (_1 = (_0 = data.features) === null || _0 === void 0 ? void 0 : _0.isRenovated) !== null && _1 !== void 0 ? _1 : null,
            isFurnished: (_3 = (_2 = data.features) === null || _2 === void 0 ? void 0 : _2.isFurnished) !== null && _3 !== void 0 ? _3 : null,
            hasAirConditioning: (_5 = (_4 = data.features) === null || _4 === void 0 ? void 0 : _4.hasAirConditioning) !== null && _5 !== void 0 ? _5 : null,
        }, financials: {
            price,
            originalPrice: (_7 = (_6 = data.financials) === null || _6 === void 0 ? void 0 : _6.originalPrice) !== null && _7 !== void 0 ? _7 : null,
        }, media: {
            mainImage: (_9 = (_8 = data.media) === null || _8 === void 0 ? void 0 : _8.mainImage) !== null && _9 !== void 0 ? _9 : null,
            images: (_11 = (_10 = data.media) === null || _10 === void 0 ? void 0 : _10.images) !== null && _11 !== void 0 ? _11 : [],
            videoTourUrl: (_13 = (_12 = data.media) === null || _12 === void 0 ? void 0 : _12.videoTourUrl) !== null && _13 !== void 0 ? _13 : null,
        }, management: {
            assignedAgentId: ((_14 = data.management) === null || _14 === void 0 ? void 0 : _14.assignedAgentId) || data.agentId || null,
            descriptions: ((_15 = data.management) === null || _15 === void 0 ? void 0 : _15.descriptions) || data.description || null,
        }, listingType: data.listingType || null, visibility: data.visibility || null, createdAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() }, (data.visibility === 'public' ? { publicAt: firestore_1.FieldValue.serverTimestamp() } : {})));
    return { success: true, propertyId: propertyRef.id };
});
//# sourceMappingURL=addProperty.js.map