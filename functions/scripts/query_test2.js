const admin = require("firebase-admin");
const serviceAccount = require("../src/lib/firebaseConfig.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function run() {
  const riders = await db.collection('driver_profiles').get();
  riders.forEach(r => console.log('Rider Profile:', r.id, r.data().isActive, r.data().currentLocation));

  const users = await db.collection('users').where('role', 'in', ['rider', 'vendor']).get();
  users.forEach(u => console.log('User:', u.id, u.data().role, u.data().location));
}
run();
