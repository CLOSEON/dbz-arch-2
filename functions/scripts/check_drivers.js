const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const driversSnap = await db.collection('driver_profiles').get();
  driversSnap.forEach(doc => {
    console.log(`Driver ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
  });
}
run().catch(console.error);
