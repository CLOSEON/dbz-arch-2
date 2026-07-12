const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'dabzofb' });
}
const db = admin.firestore();
const users = require('../users.json').users;

async function run() {
  for (const user of users) {
    let role = 'admin'; // default to admin
    let name = 'User ' + user.phoneNumber;
    
    if (user.phoneNumber === '+919900990011') {
      role = 'user'; // FIXED FROM 'customer'
      name = 'Test Customer';
    } else if (user.phoneNumber === '+919900990022') {
      role = 'vendor';
      name = 'Test Vendor';
    } else if (user.phoneNumber === '+919900990044') {
      role = 'delivery'; // FIXED FROM 'delivery_agent'
      name = 'Test Delivery';
    }
    
    await db.collection('users').doc(user.localId).set({
      phone: user.phoneNumber,
      role: role,
      name: name,
      location: { lat: 21.1500, lng: 79.0900 },
      address: '123 Restoration St', // FIXED FROM object to string
      isActive: true,
      is_approved: true, // FIXED: Make sure vendors are approved
      currentLocation: { lat: 21.1500, lng: 79.0900 },
      deliveryPreference: '11am',
    });
    
    if (role === 'delivery') {
      await db.collection('driver_profiles').doc(user.localId).set({
        id: user.localId, name: name, phone: user.phoneNumber, isActive: true,
        currentLocation: { lat: 21.1500, lng: 79.0900 }
      });
    }
    
    try {
      await admin.auth().setCustomUserClaims(user.localId, { role: role });
    } catch (e) {
      console.log("Failed to set claim for", user.localId);
    }
  }
  console.log("Restored " + users.length + " users with correct approval statuses!");
}
run().then(() => process.exit(0)).catch(console.error);
