"use strict";
/**
 * geocode.ts — Address to Coordinates via Nominatim
 *
 * Security: Callable function that bypasses CORS and includes a proper User-Agent.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAddressSuggestions = exports.getCoordinates = void 0;
const https_1 = require("firebase-functions/v2/https");
const axios_1 = __importDefault(require("axios"));
exports.getCoordinates = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { address } = request.data;
    if (!address || typeof address !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A valid address string is required.');
    }
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Israel')}&limit=1`;
        const response = await axios_1.default.get(url, {
            headers: {
                // Nominatim policy requires a valid User-Agent
                'User-Agent': 'OmerDigitalCRM/1.0',
                'Accept': 'application/json',
                'Accept-Language': 'he'
            },
            timeout: 5000
        });
        const data = response.data;
        if (data && data[0]) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
        return null; // Not found
    }
    catch (error) {
        console.error('[geocode] Failed to fetch coordinates:', error.message);
        throw new https_1.HttpsError('internal', 'Geocoding failed. Please try again later.');
    }
});
exports.getAddressSuggestions = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const { query } = request.data;
    if (!query || typeof query !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A valid query string is required.');
    }
    // Attempt to extract a house number from the query (e.g. "תכלת 8", "דיזנגוף 50א")
    const numberMatch = query.match(/(?:^|\s)(\d+[א-תa-zA-Z]?)(?:\s|$|,)/);
    const parsedNumber = numberMatch ? numberMatch[1] : '';
    try {
        // Using komoot photon API. It is based on OSM data but uses elasticsearch for much better autocomplete.
        // We omit 'lang' to get the local language (Hebrew) and use bbox to limit results to Israel.
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&bbox=34.0,29.3,36.0,33.5`;
        const response = await axios_1.default.get(url, {
            headers: {
                'Accept': 'application/json',
            },
            timeout: 5000
        });
        const features = response.data.features || [];
        // Map photon features to the structure expected by the frontend
        const suggestions = features.map((f) => {
            const prop = f.properties;
            const lon = f.geometry.coordinates[0];
            const lat = f.geometry.coordinates[1];
            const city = prop.city || prop.locality || prop.town || prop.village || '';
            const street = prop.street || prop.name || '';
            let num = prop.housenumber || '';
            // If API didn't return a house number but user typed one, append it.
            // Avoid appending if the street name already contains the number at the end (e.g. "כביש 4")
            if (!num && parsedNumber && street && !street.endsWith(parsedNumber)) {
                num = parsedNumber;
            }
            // Deduplicate name/street since sometimes they are the same
            let addressStr = street;
            if (num)
                addressStr += ` ${num}`;
            if (prop.name && prop.name !== street && !prop.name.includes(street)) {
                if (addressStr) {
                    addressStr = `${prop.name} - ${addressStr}`;
                }
                else {
                    addressStr = prop.name;
                }
            }
            const parts = [];
            if (addressStr)
                parts.push(addressStr);
            if (city && city !== addressStr)
                parts.push(city);
            const display_name = parts.join(', ') || prop.name || 'כתובת לא ידועה';
            return {
                display_name,
                lat: lat.toString(),
                lon: lon.toString(),
                address: {
                    city: city,
                    road: street,
                    house_number: num
                }
            };
        });
        // Filter out items without a city or street effectively if we want, but for now just return unique display names
        const uniqueSuggestions = Array.from(new Map(suggestions.map((s) => [s.display_name, s])).values());
        return uniqueSuggestions;
    }
    catch (error) {
        console.error('[geocode] Failed to fetch suggestions:', error.message);
        throw new https_1.HttpsError('internal', 'Fetching suggestions failed.');
    }
});
//# sourceMappingURL=geocode.js.map