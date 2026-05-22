const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function run() {
  const db = admin.firestore();
  const snapshot = await db.collection("users").where("role", "==", "admin").get();
  console.log(`Found ${snapshot.size} admins in Firestore`);
  
  for (const doc of snapshot.docs) {
    const uid = doc.id;
    console.log(`Setting admin claim for ${uid}`);
    await admin.auth().setCustomUserClaims(uid, { role: "admin" });
  }
  console.log("Done.");
}

run().catch(console.error);
