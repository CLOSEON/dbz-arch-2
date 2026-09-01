/**
 * Universal High-Precision Reverse Geocoding Utility for Dabzzo
 * Converts GPS Coordinates (Lat, Lng) into a structured, highly-accurate complete Indian address.
 */

export interface GeocodedAddress {
  completeAddress: string;
  building?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
  lat: number;
  lng: number;
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedAddress> {
  try {
    // zoom=18 requests maximum building / street-level precision from OpenStreetMap
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en-IN,en;q=0.9',
        'User-Agent': 'DabzzoWeb/2.0 (contact@dabzzo.in)'
      }
    });

    if (!res.ok) {
      throw new Error(`Reverse geocode failed with status ${res.status}`);
    }

    const data = await res.json();
    const addr = data.address || {};

    const building = addr.amenity || addr.shop || addr.office || addr.building || addr.house_name || addr.leisure || addr.tourism || '';
    const house = addr.house_number ? (building ? `Flat/Plot ${addr.house_number}` : addr.house_number) : '';
    const road = addr.road || addr.street || addr.pedestrian || addr.footway || addr.path || addr.highway || '';
    const neighbourhood = addr.neighbourhood || addr.residential || '';
    const suburb = addr.suburb || addr.quarter || addr.subdistrict || addr.hamlet || addr.allotments || '';
    const locality = addr.locality || addr.city_district || '';
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    const state = addr.state || '';
    const pincode = addr.postcode || '';

    const rawList = [
      building,
      house,
      road,
      neighbourhood,
      suburb,
      locality,
      city,
      state,
      pincode
    ].filter(Boolean);

    const seen = new Set<string>();
    const cleanedParts: string[] = [];

    for (const part of rawList) {
      const trimmed = String(part).trim();
      const lower = trimmed.toLowerCase();
      // Exclude repetitive administrative talukas / generic country
      if (lower.includes('taluka') || lower.includes('district') || lower === 'india') continue;
      if (!seen.has(lower)) {
        seen.add(lower);
        cleanedParts.push(trimmed);
      }
    }

    let completeAddress = '';
    if (cleanedParts.length >= 2) {
      completeAddress = cleanedParts.join(', ');
    } else if (data.display_name) {
      const parts = data.display_name.split(',').map((s: string) => s.trim()).filter(Boolean);
      const filtered = parts.filter((p: string) => {
        const l = p.toLowerCase();
        return !l.includes('taluka') && !l.includes('district') && l !== 'india';
      });
      completeAddress = filtered.join(', ');
    } else {
      completeAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }

    return {
      completeAddress,
      building: building || house,
      road,
      neighbourhood,
      suburb,
      locality,
      city,
      state,
      pincode,
      lat,
      lng
    };
  } catch (error) {
    console.warn('[reverseGeocode] Error:', error);
    return {
      completeAddress: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng
    };
  }
}
