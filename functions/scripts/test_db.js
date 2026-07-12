const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function run() {
  const trips = await db.collection('rider_trips').get();
  console.log("trips:", trips.docs.map(d => d.data()));
  const batches = await db.collection('batches').get();
  console.log("batches:", batches.docs.map(d => d.data()));
}
run();
