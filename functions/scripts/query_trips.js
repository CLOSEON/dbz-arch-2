const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function check() {
  const batches = await db.collection('batches').where('status', '==', 'ready').get();
  console.log("Ready Batches:");
  batches.docs.forEach(b => console.log(b.id, b.data().pickup_otp));

  const trips = await db.collection('rider_trips').get();
  console.log("Trips:");
  trips.docs.forEach(t => console.log(t.id, "batch_ids:", t.data().batch_ids, "status:", t.data().status));
}

check();
