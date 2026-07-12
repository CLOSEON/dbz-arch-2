const admin = require("firebase-admin");
const serviceAccount = require("./src/lib/firebaseConfig.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const riders = await db.collection("users").where("role", "==", "rider").get();
  riders.forEach(r => console.log("Rider:", r.id, r.data().phone));
  
  const trips = await db.collection("rider_trips").get();
  trips.forEach(t => console.log("Trip:", t.id, t.data().status, t.data().riderId));
}

run();
