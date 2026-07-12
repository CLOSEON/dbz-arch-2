const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function run() {
  const trips = await db.collection('rider_trips').get();
  for (const doc of trips.docs) {
    const data = doc.data();
    let updated = false;
    if (data.pickupStops) {
      data.pickupStops.forEach(s => {
        if (!s.pickupOTP) {
          s.pickupOTP = "5555";
          updated = true;
        }
      });
    }
    if (updated) {
      await doc.ref.update({ pickupStops: data.pickupStops });
      console.log(`Updated trip ${doc.id} with fallback OTP`);
    }
  }

  const batches = await db.collection('batches').get();
  for (const doc of batches.docs) {
    const data = doc.data();
    if (!data.pickup_otp) {
      await doc.ref.update({ pickup_otp: "5555" });
      console.log(`Updated batch ${doc.id} with fallback OTP`);
    }
  }
}
run();
