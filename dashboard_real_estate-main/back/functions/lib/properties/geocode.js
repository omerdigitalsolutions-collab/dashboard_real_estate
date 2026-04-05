"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.geocodeNewProperty = exports.getPlaceDetails = exports.getAddressSuggestions = exports.getCoordinates = void 0;
/**
 * geocode.ts — Address to Coordinates via Nominatim
 *
 * Security: Callable function that bypasses CORS and includes a proper User-Agent.
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const params_1 = require("firebase-functions/params");
const axios_1 = __importDefault(require("axios"));
const db = (0, firestore_2.getFirestore)();
const googleMapsKey = (0, params_1.defineSecret)('VITE_GOOGLE_MAPS_API_KEY');
exports.getCoordinates = (0, https_1.onCall)({ cors: true, secrets: [googleMapsKey] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { address } = request.data;
    if (!address || typeof address !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A valid address string is required.');
    }
    const apiKey = googleMapsKey.value();
    if (!apiKey) {
        // Fallback to nominatim if key is missing (optional, but safer to just fail if we want "real" ones)
        console.warn('[geocode] VITE_GOOGLE_MAPS_API_KEY is not set. Falling back to Nominatim.');
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Israel')}&limit=1`;
            const response = await axios_1.default.get(url, {
                headers: { 'User-Agent': 'OmerDigitalCRM/1.0' },
                timeout: 5000
            });
            const data = response.data;
            if (data && data[0]) {
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
            return null;
        }
        catch (e) {
            throw new https_1.HttpsError('internal', 'Geocoding failed.');
        }
    }
    try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + ', Israel')}&key=${apiKey}&language=he`;
        const response = await axios_1.default.get(url);
        const data = response.data;
        if (data.status === 'OK' && data.results && data.results[0]) {
            const loc = data.results[0].geometry.location;
            return {
                lat: loc.lat,
                lng: loc.lng,
                formattedAddress: data.results[0].formatted_address
            };
        }
        return null; // Not found
    }
    catch (error) {
        console.error('[geocode] Google Geocoding failed:', error.message);
        throw new https_1.HttpsError('internal', 'Geocoding service unavailable.');
    }
});
exports.getAddressSuggestions = (0, https_1.onCall)({ cors: true, secrets: [googleMapsKey] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { query } = request.data;
    if (!query || typeof query !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A valid query string is required.');
    }
    const apiKey = googleMapsKey.value();
    console.log(`[getAddressSuggestions] Searching for: "${query}" (Key provided: ${apiKey ? 'Yes' : 'No'})`);
    // Extract potential house number from query for fallback
    const queryParts = query.split(/\s+/);
    const potentialHouse = queryParts.find(p => /^\d+[a-zA-Z]?$/.test(p));
    if (apiKey) {
        try {
            const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}&language=he&components=country:il`;
            const response = await axios_1.default.get(url, {
                headers: { 'Referer': 'https://homer.management/', 'Accept-Language': 'he' }
            });
            const data = response.data;
            if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
                const predictions = data.predictions || [];
                // Limit to 1 and return
                if (predictions.length > 0) {
                    return predictions.slice(0, 1).map((p) => ({
                        display_name: p.description,
                        place_id: p.place_id,
                        structured_formatting: p.structured_formatting
                    }));
                }
            }
            else {
                console.warn(`[getAddressSuggestions] Google API denied or errored: ${data.status}. Msg: ${data.error_message}`);
            }
        }
        catch (error) {
            console.error(`[getAddressSuggestions] Google request failed: ${error.message}`);
        }
    }
    // --- FALLBACK LOGIC ---
    let finalResults = [];
    // Fallback 1: Photon
    try {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=he`;
        const res = await axios_1.default.get(photonUrl);
        const features = res.data.features || [];
        features.forEach((f) => {
            const p = f.properties;
            const street = p.street || p.name;
            const house = p.housenumber || potentialHouse || '';
            const city = p.city || p.town || '';
            const main = [street, house].filter(Boolean).join(' ');
            const display = [main, city].filter(Boolean).join(', ');
            if (display) {
                finalResults.push({
                    display_name: display,
                    place_id: `photon_${f.properties.osm_id || Math.random()}`
                });
            }
        });
    }
    catch (e) { }
    // Fallback 2: Nominatim
    if (finalResults.length === 0) {
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Israel')}&limit=10&addressdetails=1&accept-language=he`;
            const res = await axios_1.default.get(nomUrl, { headers: { 'User-Agent': 'HomerCRM/2.0' } });
            (res.data || []).forEach((p) => {
                const addr = p.address || {};
                const street = addr.road || addr.pedestrian || addr.cycleway || '';
                const house = addr.house_number || potentialHouse || '';
                const city = addr.city || addr.town || addr.village || addr.suburb || '';
                const main = [street, house].filter(Boolean).join(' ');
                const display = [main, city].filter(Boolean).join(', ');
                if (display) {
                    finalResults.push({
                        display_name: display,
                        place_id: `nom_${p.place_id}`
                    });
                }
            });
        }
        catch (e) { }
    }
    // Deduplicate and limit to 1
    const unique = Array.from(new Map(finalResults.map(item => [item.display_name, item])).values());
    console.log(`[getAddressSuggestions] Returning ${unique.length > 0 ? 1 : 0} results after deduplication.`);
    return unique.slice(0, 1);
});
/**
 * Fetch detailed address components (city, street, etc.) from Google Places
 */
exports.getPlaceDetails = (0, https_1.onCall)({ cors: true, secrets: [googleMapsKey] }, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { placeId } = request.data;
    if (!placeId) {
        throw new https_1.HttpsError('invalid-argument', 'placeId is required.');
    }
    console.log(`[getPlaceDetails] Fetching details for ID: ${placeId}`);
    // If it's a fallback ID (photon or nom), we handle it differently
    if (placeId.startsWith('photon_') || placeId.startsWith('nom_')) {
        return null; // The frontend will just use the display_name for now
    }
    const apiKey = googleMapsKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'Google Maps API key is missing.');
    }
    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&language=he&fields=address_components,geometry,formatted_address`;
        const response = await axios_1.default.get(url, {
            headers: { 'Referer': 'https://homer.management/', 'Accept-Language': 'he' }
        });
        const result = response.data.result;
        if (!result) {
            console.warn(`[getPlaceDetails] Google returned no results for ID ${placeId}. Status: ${response.data.status}`);
            return null;
        }
        const components = result.address_components || [];
        const getComp = (types) => { var _a; return ((_a = components.find((c) => types.some(t => c.types.includes(t)))) === null || _a === void 0 ? void 0 : _a.long_name) || ''; };
        return {
            street: getComp(['route']),
            houseNumber: getComp(['street_number']),
            city: getComp(['locality', 'postal_town', 'administrative_area_level_2']),
            lat: (_b = (_a = result.geometry) === null || _a === void 0 ? void 0 : _a.location) === null || _b === void 0 ? void 0 : _b.lat,
            lng: (_d = (_c = result.geometry) === null || _c === void 0 ? void 0 : _c.location) === null || _d === void 0 ? void 0 : _d.lng,
            formattedAddress: result.formatted_address
        };
    }
    catch (error) {
        console.error('[getPlaceDetails] Google request failed:', error.message);
        throw new https_1.HttpsError('internal', 'Failed to fetch place details.');
    }
});
/**
 * Automatically attempt to geocode newly imported/created properties
 * that have the exact default Israel center coordinates.
 */
exports.geocodeNewProperty = (0, firestore_1.onDocumentCreated)({
    document: 'properties/{propertyId}',
    secrets: [googleMapsKey]
}, async (event) => {
    var _a, _b, _c, _d;
    const doc = event.data;
    if (!doc)
        return;
    const prop = doc.data();
    const latVal = (_a = prop.lat) !== null && _a !== void 0 ? _a : (_b = prop.location) === null || _b === void 0 ? void 0 : _b.lat;
    const lngVal = (_c = prop.lng) !== null && _c !== void 0 ? _c : (_d = prop.location) === null || _d === void 0 ? void 0 : _d.lng;
    const isPlaceholder = !latVal || (latVal === 31.5 && lngVal === 34.75);
    if (!isPlaceholder)
        return;
    const { address, city } = prop;
    if (!address || !city)
        return;
    const fullSearch = `${address}, ${city}, Israel`;
    const apiKey = googleMapsKey.value();
    try {
        let lat, lng, formatted;
        if (apiKey) {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullSearch)}&key=${apiKey}&language=he`;
            const response = await axios_1.default.get(url);
            const data = response.data;
            if (data.status === 'OK' && data.results[0]) {
                const loc = data.results[0].geometry.location;
                lat = loc.lat;
                lng = loc.lng;
                formatted = data.results[0].formatted_address;
            }
        }
        else {
            // Fallback to nominatim
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullSearch)}&limit=1`;
            const response = await axios_1.default.get(url, { headers: { 'User-Agent': 'OmerDigitalCRM/1.0' } });
            if (response.data[0]) {
                lat = parseFloat(response.data[0].lat);
                lng = parseFloat(response.data[0].lon);
                formatted = response.data[0].display_name;
            }
        }
        if (lat && lng) {
            await db.doc(`properties/${event.params.propertyId}`).update({
                lat,
                lng,
                location: { lat, lng },
                geocode: {
                    lat,
                    lng,
                    formattedAddress: formatted,
                    lastUpdated: firestore_2.FieldValue.serverTimestamp(),
                    source: apiKey ? 'google' : 'nominatim'
                }
            });
            console.log(`[geocodeNewProperty] Geocoded property ${event.params.propertyId} to [${lat}, ${lng}]`);
        }
    }
    catch (error) {
        console.error(`[geocodeNewProperty] Geocoding failed for ${fullSearch}:`, error.message);
    }
});
//# sourceMappingURL=geocode.js.map