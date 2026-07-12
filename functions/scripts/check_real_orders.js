const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const snap = await db.collection('orders').get();
  snap.forEach(doc => {
    console.log(`Order ${doc.id}: ${doc.data().status}`);
  });
}
run().catch(console.error);
