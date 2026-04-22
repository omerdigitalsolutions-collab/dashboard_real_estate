"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migratePropertyDoc = migratePropertyDoc;
function migratePropertyDoc(old, id) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40, _41, _42, _43, _44, _45, _46;
    // Normalize transaction type: 'sale' → 'forsale', keep 'rent', handle Hebrew
    let transactionType = 'forsale';
    const rawType = (old.type || old.transactionType || '').toString().toLowerCase();
    if (rawType === 'rent' || rawType.includes('שכיר') || rawType.includes('שכר')) {
        transactionType = 'rent';
    }
    // Build address object
    const street = old.street || ((_a = old.address) === null || _a === void 0 ? void 0 : _a.street) || '';
    const city = old.city || ((_b = old.address) === null || _b === void 0 ? void 0 : _b.city) || '';
    const fullAddress = ((_c = old.address) === null || _c === void 0 ? void 0 : _c.fullAddress) ||
        (typeof old.address === 'string' ? old.address : null) ||
        `${street} ${city}`.trim();
    const coords = (_e = (_d = old.address) === null || _d === void 0 ? void 0 : _d.coords) !== null && _e !== void 0 ? _e : (old.lat != null && old.lng != null ? { lat: old.lat, lng: old.lng } : undefined);
    // Strip agentName: "true" bug — keep only real string names
    const rawDescriptions = old.description || ((_f = old.management) === null || _f === void 0 ? void 0 : _f.descriptions);
    const descriptions = rawDescriptions && rawDescriptions !== 'true' && rawDescriptions !== true
        ? String(rawDescriptions)
        : null;
    // Images: prefer media.images → imageUrls → images
    const images = ((_g = old.media) === null || _g === void 0 ? void 0 : _g.images) ||
        old.imageUrls ||
        old.images ||
        [];
    return Object.assign(Object.assign({ agencyId: old.agencyId, transactionType, propertyType: old.kind || old.propertyType || '', status: old.status || 'active', rooms: (_h = old.rooms) !== null && _h !== void 0 ? _h : null, floor: (_j = old.floor) !== null && _j !== void 0 ? _j : null, totalFloors: (_l = (_k = old.floorsTotal) !== null && _k !== void 0 ? _k : old.totalFloors) !== null && _l !== void 0 ? _l : null, squareMeters: (_o = (_m = old.sqm) !== null && _m !== void 0 ? _m : old.squareMeters) !== null && _o !== void 0 ? _o : null, address: Object.assign({ city,
            street, number: old.streetNumber || ((_p = old.address) === null || _p === void 0 ? void 0 : _p.number) || '', neighborhood: old.neighborhood || ((_q = old.address) === null || _q === void 0 ? void 0 : _q.neighborhood) || '', fullAddress }, (coords ? { coords } : {})), features: {
            hasElevator: (_t = (_s = (_r = old.features) === null || _r === void 0 ? void 0 : _r.hasElevator) !== null && _s !== void 0 ? _s : old.hasElevator) !== null && _t !== void 0 ? _t : null,
            hasParking: (_w = (_v = (_u = old.features) === null || _u === void 0 ? void 0 : _u.hasParking) !== null && _v !== void 0 ? _v : old.hasParking) !== null && _w !== void 0 ? _w : null,
            parkingSpots: (_z = (_y = (_x = old.features) === null || _x === void 0 ? void 0 : _x.parkingSpots) !== null && _y !== void 0 ? _y : old.parkingSpots) !== null && _z !== void 0 ? _z : null,
            hasBalcony: (_2 = (_1 = (_0 = old.features) === null || _0 === void 0 ? void 0 : _0.hasBalcony) !== null && _1 !== void 0 ? _1 : old.hasBalcony) !== null && _2 !== void 0 ? _2 : null,
            hasMamad: (_5 = (_4 = (_3 = old.features) === null || _3 === void 0 ? void 0 : _3.hasMamad) !== null && _4 !== void 0 ? _4 : old.hasSafeRoom) !== null && _5 !== void 0 ? _5 : null,
            hasStorage: (_8 = (_7 = (_6 = old.features) === null || _6 === void 0 ? void 0 : _6.hasStorage) !== null && _7 !== void 0 ? _7 : old.hasStorage) !== null && _8 !== void 0 ? _8 : null,
            isRenovated: (_10 = (_9 = old.features) === null || _9 === void 0 ? void 0 : _9.isRenovated) !== null && _10 !== void 0 ? _10 : (old.condition === 'renovated' ? true : null),
            isFurnished: (_12 = (_11 = old.features) === null || _11 === void 0 ? void 0 : _11.isFurnished) !== null && _12 !== void 0 ? _12 : null,
            hasAirConditioning: (_15 = (_14 = (_13 = old.features) === null || _13 === void 0 ? void 0 : _13.hasAirConditioning) !== null && _14 !== void 0 ? _14 : old.hasAirCondition) !== null && _15 !== void 0 ? _15 : null,
        }, financials: {
            price: (_18 = (_17 = (_16 = old.financials) === null || _16 === void 0 ? void 0 : _16.price) !== null && _17 !== void 0 ? _17 : old.price) !== null && _18 !== void 0 ? _18 : 0,
            originalPrice: (_21 = (_20 = (_19 = old.financials) === null || _19 === void 0 ? void 0 : _19.originalPrice) !== null && _20 !== void 0 ? _20 : old.originalPrice) !== null && _21 !== void 0 ? _21 : null,
        }, media: {
            mainImage: (_24 = (_23 = (_22 = old.media) === null || _22 === void 0 ? void 0 : _22.mainImage) !== null && _23 !== void 0 ? _23 : images[0]) !== null && _24 !== void 0 ? _24 : null,
            images,
            videoTourUrl: (_29 = (_27 = (_26 = (_25 = old.media) === null || _25 === void 0 ? void 0 : _25.videoTourUrl) !== null && _26 !== void 0 ? _26 : old.videoUrl) !== null && _27 !== void 0 ? _27 : (_28 = old.videoUrls) === null || _28 === void 0 ? void 0 : _28[0]) !== null && _29 !== void 0 ? _29 : null,
        } }, (old.source || old.yad2Link
        ? {
            source: {
                origin: (_31 = (typeof old.source === 'string' ? old.source : (_30 = old.source) === null || _30 === void 0 ? void 0 : _30.origin)) !== null && _31 !== void 0 ? _31 : undefined,
                sourceUrl: (_34 = (_32 = old.yad2Link) !== null && _32 !== void 0 ? _32 : (_33 = old.source) === null || _33 === void 0 ? void 0 : _33.sourceUrl) !== null && _34 !== void 0 ? _34 : null,
                scraperBatchId: (_36 = (_35 = old.source) === null || _35 === void 0 ? void 0 : _35.scraperBatchId) !== null && _36 !== void 0 ? _36 : null,
            },
        }
        : {})), { management: {
            assignedAgentId: (_39 = (_38 = (_37 = old.management) === null || _37 === void 0 ? void 0 : _37.assignedAgentId) !== null && _38 !== void 0 ? _38 : old.agentId) !== null && _39 !== void 0 ? _39 : null,
            descriptions,
        }, listingType: (_40 = old.listingType) !== null && _40 !== void 0 ? _40 : null, isGlobalCityProperty: (_41 = old.isGlobalCityProperty) !== null && _41 !== void 0 ? _41 : false, readonly: (_42 = old.readonly) !== null && _42 !== void 0 ? _42 : false, createdAt: (_43 = old.createdAt) !== null && _43 !== void 0 ? _43 : null, updatedAt: (_46 = (_45 = (_44 = old.updatedAt) !== null && _44 !== void 0 ? _44 : old.ingestedAt) !== null && _45 !== void 0 ? _45 : old.createdAt) !== null && _46 !== void 0 ? _46 : null });
}
//# sourceMappingURL=propertyMigrator.js.map