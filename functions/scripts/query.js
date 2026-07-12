const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const snap = await db.collection("orders").get();
  console.log(`Found ${snap.size} total orders`);
  snap.docs.forEach(d => {
    const data = d.data();
    console.log(`Order ${d.id}: date=${data.date}, status=${data.status}`);
  });
  process.exit(0);
}
run();
