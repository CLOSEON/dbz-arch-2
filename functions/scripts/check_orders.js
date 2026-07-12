const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const snap = await db.collection('orders').where('vendor_id', '==', 'gUsPilR0ZKPNyx0oRlUxCO45cfB3').where('delivery_date', '==', '2026-07-06').get();
  console.log(`Found ${snap.size} orders`);
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`Order ${doc.id}: status=${data.status}, slot=${data.delivery_slot || data.slot}`);
  });
}
run().catch(console.error);
