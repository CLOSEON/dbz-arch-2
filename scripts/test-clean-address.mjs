#!/usr/bin/env node

function cleanAddress(data) {
  if (!data) return '';
  const addr = data.address || {};
  
  // Micro-level precision fields
  const building = addr.amenity || addr.shop || addr.office || addr.building || addr.house_name || addr.leisure || addr.tourism || '';
  const house = addr.house_number ? `Flat/Plot ${addr.house_number}` : '';
  const road = addr.road || addr.street || addr.pedestrian || addr.footway || addr.path || addr.highway || '';
  const neighbourhood = addr.neighbourhood || addr.suburb || addr.residential || addr.quarter || addr.subdistrict || addr.hamlet || addr.allotments || '';
  const locality = addr.locality || addr.city_district || '';
  const city = addr.city || addr.town || addr.village || addr.municipality || '';
  const state = addr.state || '';
  const pincode = addr.postcode || '';

  const rawList = [
    building,
    house,
    road,
    neighbourhood,
    locality,
    city,
    state,
    pincode
  ].filter(Boolean);

  const seen = new Set();
  const cleanedParts = [];

  for (const part of rawList) {
    const trimmed = String(part).trim();
    const lower = trimmed.toLowerCase();
    // Exclude repetitive administrative talukas
    if (lower.includes('taluka') || lower.includes('district') || lower === 'india') continue;
    if (!seen.has(lower)) {
      seen.add(lower);
      cleanedParts.push(trimmed);
    }
  }

  // If structured parts are rich (>=2), use them. Otherwise fallback to filtered display_name
  if (cleanedParts.length >= 2) {
    return cleanedParts.join(', ');
  }

  if (data.display_name) {
    const parts = data.display_name.split(',').map(s => s.trim()).filter(Boolean);
    const filtered = parts.filter(p => {
      const l = p.toLowerCase();
      return !l.includes('taluka') && !l.includes('district') && l !== 'india';
    });
    return filtered.join(', ');
  }

  return '';
}

const samples = [
  {
    display_name: 'Nagpur Government Hospital, Medical Square, Mahal, Nagpur, Nagpur Urban Taluka, Nagpur, Maharashtra, 440003, India',
    address: {
      amenity: 'Nagpur Government Hospital',
      road: 'Medical Square',
      suburb: 'Mahal',
      city: 'Nagpur',
      county: 'Nagpur Urban Taluka',
      state: 'Maharashtra',
      postcode: '440003'
    }
  },
  {
    display_name: 'Shaniwari, Mominpura, Nagpur, Nagpur Urban Taluka, Nagpur, Maharashtra, 440002, India',
    address: {
      neighbourhood: 'Shaniwari',
      suburb: 'Mominpura',
      city: 'Nagpur',
      county: 'Nagpur Urban Taluka',
      state: 'Maharashtra',
      postcode: '440002'
    }
  }
];

samples.forEach((s, idx) => {
  console.log(`Sample ${idx + 1}:`, cleanAddress(s));
});
