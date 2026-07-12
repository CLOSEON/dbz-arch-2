const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.resolve(__dirname, "../src/lib/firebaseConfig.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function run() {
  const trips = await db.collection('rider_trips').where('status', 'in', ['pickup_pending', 'picking_up', 'pickup_complete', 'dropping']).get();
  console.log("Active trips:", trips.size);
  
  for (const t of trips.docs) {
    console.log("Trip ID:", t.id, "| Status:", t.data().status, "| Rider ID:", t.data().riderId);
    console.log("Drop stops:", JSON.stringify(t.data().dropStops, null, 2));
    
    // I can complete the stuck trips
    if (t.data().status === 'dropping' || t.data().status === 'pickup_complete') {
        await t.ref.update({ status: 'completed' });
        console.log("Marked trip as completed!");
    }
  }
}
run();
