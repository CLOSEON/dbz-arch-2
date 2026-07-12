const admin = require("firebase-admin");
const serviceAccount = require("../src/lib/firebaseConfig.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function run() {
  const trips = await db.collection('rider_trips').get();
  console.log("Total trips:", trips.size);
  trips.forEach(t => {
    const data = t.data();
    console.log("Trip ID:", t.id, "| Rider:", data.riderId, "| Status:", data.status);
  });
  
  const orders = await db.collection('orders').where('status', '==', 'en_route').get();
  console.log("En route orders:", orders.size);
  orders.forEach(o => {
    const data = o.data();
    console.log("Order:", o.id, "| Trip ID:", data.rider_trip_id, "| Rider:", data.agent_id);
  });
}
run();
