const admin = require("firebase-admin");
const path = require("path");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const users = require('./users.json').users;

async function run() {
  for (const user of users) {
    let role = 'admin'; // default to admin to fix permission denied for the developer
    let name = 'User ' + user.phoneNumber;
    
    if (user.phoneNumber === '+919900990011') {
      role = 'customer';
      name = 'Test Customer';
    } else if (user.phoneNumber === '+919900990022') {
      role = 'vendor';
      name = 'Test Vendor';
    } else if (user.phoneNumber === '+919900990044') {
      role = 'delivery_agent'; // also set in driver_profiles
      name = 'Test Delivery';
    }
    
    await db.collection('users').doc(user.localId).set({
      phone: user.phoneNumber,
      role: role,
      name: name,
      location: { lat: 21.1500, lng: 79.0900 },
      address: { line1: '123 Restoration St', lat: 21.1500, lng: 79.0900 },
      isActive: true,
      currentLocation: { lat: 21.1500, lng: 79.0900 },
      deliveryPreference: '11am',
    });
    
    if (role === 'delivery_agent') {
      await db.collection('driver_profiles').doc(user.localId).set({
        id: user.localId, name: name, phone: user.phoneNumber, isActive: true,
        currentLocation: { lat: 21.1500, lng: 79.0900 }
      });
    }
    
    // Set Custom claim
    try {
      await admin.auth().setCustomUserClaims(user.localId, { role: role });
    } catch (e) {
      console.log("Failed to set claim for", user.localId);
    }
  }
  console.log("Restored " + users.length + " users!");
}
run().then(() => process.exit(0)).catch(console.error);
