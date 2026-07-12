const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const snap = await db.collection('rider_trips').get();
  console.log(`Found ${snap.size} trips`);
  snap.forEach(doc => {
    console.log(`Trip ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
  });
}
run().catch(console.error);
