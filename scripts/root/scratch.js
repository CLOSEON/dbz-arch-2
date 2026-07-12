const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
async function run() {
  const q = db.collection('batches').where('vendor_id', '==', 'gUsPilR0ZKPNyx0oRlUxCO45cfB3');
  const snap = await q.get();
  snap.docs.forEach(d => console.log('Batch:', d.id, 'Date:', d.data().date, 'Slot:', d.data().slot));
}
run();
