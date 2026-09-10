#!/usr/bin/env node

// Let's test with Nagpur coordinates
const testCoords = [
  { name: 'Nagpur 440008 (Medical/Hanuman Nagar area)', lat: 21.1264, lng: 79.0982 },
  { name: 'Nagpur Center (Sitabuldi)', lat: 21.1458, lng: 79.0882 },
  { name: 'Nagpur IT Park', lat: 21.1245, lng: 79.0515 },
  { name: 'Nagpur Dharampeth', lat: 21.1415, lng: 79.0625 }
];

async function testReverseGeocode() {
  for (const { name, lat, lng } of testCoords) {
    console.log(`\n========================================`);
    console.log(`📍 Testing: ${name} (${lat}, ${lng})`);
    
    // 1. Nominatim with zoom=18
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;
    try {
      const res = await fetch(nomUrl, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'DabzzoApp/2.0' }
      });
      const data = await res.json();
      console.log('--- Nominatim Raw Data ---');
      console.log('display_name:', data.display_name);
      console.log('address object:', JSON.stringify(data.address, null, 2));
    } catch (e) {
      console.error('Nominatim error:', e.message);
    }

    // 2. BigDataCloud Client Reverse Geocoding (Free, no key needed)
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    try {
      const res = await fetch(bdcUrl);
      const data = await res.json();
      console.log('--- BigDataCloud Raw Data ---');
      console.log('locality:', data.locality);
      console.log('principalSubdivision:', data.principalSubdivision);
      console.log('postcode:', data.postcode);
      console.log('localityInfo.informative:', JSON.stringify(data.localityInfo?.informative, null, 2));
    } catch (e) {
      console.error('BDC error:', e.message);
    }
  }
}

testReverseGeocode();
