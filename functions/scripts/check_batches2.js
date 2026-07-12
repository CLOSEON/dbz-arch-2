const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const snap = await db.collection('batches').get();
  snap.docs.forEach(d => {
    console.log(d.id, d.data().vendor_id, d.data().date, d.data().slot);
  });
}
run().catch(console.error);
