/**
 * geocode.ts — Address to Coordinates via Nominatim
 *
 * Security: Callable function that bypasses CORS and includes a proper User-Agent.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import axios from 'axios';

const db = getFirestore();
const googleMapsKey = defineSecret('VITE_GOOGLE_MAPS_API_KEY');

/**
 * Internal helper to geocode an address string with triple fallback.
 *   1. Google Maps Geocoding (Primary, with Referer)
 *   2. Photon (Komoot) (Secondary)
 *   3. Nominatim (OpenStreetMap) (Tertiary)
 */
async function internalGeocode(address: string, apiKey?: string): Promise<{ lat: number, lng: number, formattedAddress: string } | null> {
    const fullSearch = address.includes('Israel') || address.includes('ישראל') ? address : `${address}, Israel`;
    
    // 1. Google Maps (if API key provided)
    if (apiKey) {
        try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullSearch)}&key=${apiKey}&language=he`;
            const response = await axios.get(url, {
                headers: { 'Referer': 'https://homer.management/' }
            });
            const data = response.data;
            if (data.status === 'OK' && data.results && data.results[0]) {
                const loc = data.results[0].geometry.location;
                return {
                    lat: loc.lat,
                    lng: loc.lng,
                    formattedAddress: data.results[0].formatted_address
                };
            }
            console.warn(`[internalGeocode] Google status: ${data.status}`);
        } catch (error: any) {
            console.error(`[internalGeocode] Google failed: ${error.message}`);
        }
    }

    // 2. Fallback: Photon (Komoot)
    try {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(fullSearch)}&limit=1&lang=he`;
        const res = await axios.get(photonUrl);
        const feature = res.data.features?.[0];
        if (feature) {
            const p = feature.properties;
            const display = [p.name || p.street, p.housenumber, p.city].filter(Boolean).join(', ');
            return {
                lat: feature.geometry.coordinates[1],
                lng: feature.geometry.coordinates[0],
                formattedAddress: display || address
            };
        }
    } catch (e: any) {
        console.error(`[internalGeocode] Photon failed: ${e.message}`);
    }

    // 3. Last resort: Nominatim
    try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullSearch)}&limit=1&addressdetails=1&accept-language=he`;
        const res = await axios.get(nomUrl, { headers: { 'User-Agent': 'HomerCRM/2.0' } });
        const p = res.data?.[0];
        if (p) {
            return {
                lat: parseFloat(p.lat),
                lng: parseFloat(p.lon),
                formattedAddress: p.display_name
            };
        }
    } catch (e: any) {
        console.error(`[internalGeocode] Nominatim failed: ${e.message}`);
    }

    return null;
}

export const getCoordinates = onCall({ cors: true, secrets: [googleMapsKey] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { address } = request.data;
    if (!address || typeof address !== 'string') {
        throw new HttpsError('invalid-argument', 'A valid address string is required.');
    }

    return await internalGeocode(address, googleMapsKey.value());
});

export const getAddressSuggestions = onCall({ cors: true, secrets: [googleMapsKey] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { query } = request.data;
    if (!query || typeof query !== 'string') {
        throw new HttpsError('invalid-argument', 'A valid query string is required.');
    }

    const apiKey = googleMapsKey.value();
    console.log(`[getAddressSuggestions] Searching for: "${query}" (Key provided: ${apiKey ? 'Yes' : 'No'})`);

    // Extract potential house number from query for fallback
    const queryParts = query.split(/\s+/);
    const potentialHouse = queryParts.find(p => /^\d+[a-zA-Z]?$/.test(p));

    if (apiKey) {
        try {
            const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}&language=he&components=country:il`;
            const response = await axios.get(url, {
                headers: { 'Referer': 'https://homer.management/', 'Accept-Language': 'he' }
            });
            
            const data = response.data;
            if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
                const predictions = data.predictions || [];
                // Limit to 1 and return
                if (predictions.length > 0) {
                    return predictions.slice(0, 1).map((p: any) => ({
                        display_name: p.description,
                        place_id: p.place_id,
                        structured_formatting: p.structured_formatting
                    }));
                }
            } else {
                console.warn(`[getAddressSuggestions] Google API denied or errored: ${data.status}. Msg: ${data.error_message}`);
            }
        } catch (error: any) {
            console.error(`[getAddressSuggestions] Google request failed: ${error.message}`);
        }
    }

    // --- FALLBACK LOGIC ---
    let finalResults: any[] = [];

    // Fallback 1: Photon
    try {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=he`;
        const res = await axios.get(photonUrl);
        const features = res.data.features || [];
        features.forEach((f: any) => {
            const p = f.properties;
            const street = p.street || p.name;
            const house = p.housenumber || potentialHouse || '';
            const city = p.city || p.town || '';
            
            const main = [street, house].filter(Boolean).join(' ');
            const display = [main, city].filter(Boolean).join(', ');
            
            if (display) {
                finalResults.push({
                    display_name: display,
                    place_id: `photon_${f.properties.osm_id || Math.random()}`,
                    lat: f.geometry.coordinates[1],
                    lng: f.geometry.coordinates[0],
                    city: city,
                    street: street,
                    houseNumber: house
                });
            }
        });
    } catch (e: any) {}

    // Fallback 2: Nominatim
    if (finalResults.length === 0) {
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Israel')}&limit=10&addressdetails=1&accept-language=he`;
            const res = await axios.get(nomUrl, { headers: { 'User-Agent': 'HomerCRM/2.0' } });
            (res.data || []).forEach((p: any) => {
                const addr = p.address || {};
                const street = addr.road || addr.pedestrian || addr.cycleway || '';
                const house = addr.house_number || potentialHouse || '';
                const city = addr.city || addr.town || addr.village || addr.suburb || '';
                
                const main = [street, house].filter(Boolean).join(' ');
                const display = [main, city].filter(Boolean).join(', ');
                
                if (display) {
                    finalResults.push({
                        display_name: display,
                        place_id: `nom_${p.place_id}`,
                        lat: parseFloat(p.lat),
                        lng: parseFloat(p.lon),
                        city: city,
                        street: street,
                        houseNumber: house
                    });
                }
            });
        } catch (e: any) {}
    }

    // Deduplicate and limit to 1
    const unique = Array.from(new Map(finalResults.map(item => [item.display_name, item])).values());
    console.log(`[getAddressSuggestions] Returning ${unique.length > 0 ? 1 : 0} results after deduplication.`);
    return unique.slice(0, 1);
});

/**
 * Fetch detailed address components (city, street, etc.) from Google Places
 */
export const getPlaceDetails = onCall({ cors: true, secrets: [googleMapsKey] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { placeId } = request.data;
    if (!placeId) {
        throw new HttpsError('invalid-argument', 'placeId is required.');
    }

    console.log(`[getPlaceDetails] Fetching details for ID: ${placeId}`);

    // If it's a fallback ID (photon or nom), we handle it differently
    if (placeId.startsWith('photon_') || placeId.startsWith('nom_')) {
        return null; // The frontend will just use the display_name for now
    }

    const apiKey = googleMapsKey.value();
    if (!apiKey) {
        throw new HttpsError('failed-precondition', 'Google Maps API key is missing.');
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&language=he&fields=address_components,geometry,formatted_address`;
        const response = await axios.get(url, {
            headers: { 'Referer': 'https://homer.management/', 'Accept-Language': 'he' }
        });
        const result = response.data.result;

        if (!result) {
            console.warn(`[getPlaceDetails] Google returned no results for ID ${placeId}. Status: ${response.data.status}`);
            return null;
        }

        const components = result.address_components || [];
        const getComp = (types: string[]) => components.find((c: any) => types.some(t => c.types.includes(t)))?.long_name || '';

        return {
            street: getComp(['route']),
            houseNumber: getComp(['street_number']),
            city: getComp(['locality', 'postal_town', 'administrative_area_level_2']),
            lat: result.geometry?.location?.lat,
            lng: result.geometry?.location?.lng,
            formattedAddress: result.formatted_address
        };
    } catch (error: any) {
        console.error('[getPlaceDetails] Google request failed:', error.message);
        throw new HttpsError('internal', 'Failed to fetch place details.');
    }
});

/**
 * Automatically attempt to geocode newly imported/created properties
 * that have the exact default Israel center coordinates.
 */
export const geocodeNewProperty = onDocumentCreated({ 
    document: 'properties/{propertyId}',
    secrets: [googleMapsKey] 
}, async (event) => {
    const doc = event.data;
    if (!doc) return;

    const prop = doc.data();
    const latVal = prop.lat ?? prop.location?.lat;
    const lngVal = prop.lng ?? prop.location?.lng;

    const isPlaceholder = !latVal || (latVal === 31.5 && lngVal === 34.75);

    if (!isPlaceholder) return;

    const { address, city } = prop;
    if (!address || !city) return;

    const fullSearch = `${address}, ${city}, Israel`;
    const apiKey = googleMapsKey.value();

    console.log(`[geocodeNewProperty] Triggered for: ${event.params.propertyId} -> "${fullSearch}"`);

    try {
        const geo = await internalGeocode(fullSearch, apiKey);

        if (geo) {
            const { lat, lng, formattedAddress } = geo;
            await db.doc(`properties/${event.params.propertyId}`).update({
                lat,
                lng,
                location: { lat, lng },
                geocode: {
                    lat,
                    lng,
                    formattedAddress,
                    lastUpdated: FieldValue.serverTimestamp(),
                    source: apiKey ? 'google_trigger' : 'fallback_trigger'
                }
            });
            console.log(`[geocodeNewProperty] SUCCESS for ${event.params.propertyId}: [${lat}, ${lng}]`);
        } else {
            console.warn(`[geocodeNewProperty] FAILED to geocode address: "${fullSearch}"`);
        }
    } catch (error: any) {
        console.error(`[geocodeNewProperty] EXCEPTION for ${event.params.propertyId}:`, error.message);
    }
});
