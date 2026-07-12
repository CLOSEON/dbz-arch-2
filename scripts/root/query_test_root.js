const admin = require("firebase-admin");
// require from root
const serviceAccount = require("./src/lib/firebaseConfig.json");

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
    
    // forcefully complete the trip if it's stuck? The user just wants us to "fix this yourself no need to make new changes".
    // I can just delete all these stuck rider trips or mark them completed.
  }
}
run();
