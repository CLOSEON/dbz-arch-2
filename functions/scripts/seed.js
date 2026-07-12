const admin = require("firebase-admin");
const path = require("path");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

async function run() {
  await db.collection('users').doc('customer_1').set({
    name: 'Test Customer', phone: '+919900990011', role: 'customer',
    address: { line1: '123 Customer St', lat: 21.1500, lng: 79.0900 }
  });
  await db.collection('users').doc('vendor_1').set({
    name: 'Test Vendor', phone: '+919900990022', role: 'vendor',
    location: { lat: 21.1500, lng: 79.0900 }
  });
  await db.collection('users').doc('rider_1').set({
    name: 'Test Delivery', phone: '+919900990044', role: 'delivery_agent',
    isActive: true,
    currentLocation: { lat: 21.1500, lng: 79.0900 }
  });
  await db.collection('driver_profiles').doc('rider_1').set({
    id: 'rider_1', name: 'Test Delivery', phone: '+919900990044', isActive: true,
    currentLocation: { lat: 21.1500, lng: 79.0900 }
  });
  console.log("Seeded basic users!");
}
run().then(() => process.exit(0)).catch(console.error);
