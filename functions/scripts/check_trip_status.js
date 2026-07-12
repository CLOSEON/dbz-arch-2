const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const trips = await db.collection('rider_trips').get();
  console.log(`Total trips: ${trips.size}`);
  trips.forEach(doc => {
    console.log(`Trip ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
  });
}
run().catch(console.error);
