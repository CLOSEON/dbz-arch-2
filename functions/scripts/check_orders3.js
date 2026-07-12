const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const snap = await db.collection('orders').limit(1).get();
  snap.forEach(doc => {
    console.log(`Order ${doc.id}: ${JSON.stringify(doc.data(), null, 2)}`);
  });
}
run().catch(console.error);
