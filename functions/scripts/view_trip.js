const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const tripsSnap = await db.collection('rider_trips').get();
  tripsSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Trip ${doc.id}: status=${data.status}, pickupStops=${JSON.stringify(data.pickupStops)}, dropStops=${JSON.stringify(data.dropStops)}`);
  });
}
run().catch(console.error);
