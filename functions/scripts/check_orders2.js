const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const snap = await db.collection('orders').where('vendorId', '==', 'gUsPilR0ZKPNyx0oRlUxCO45cfB3').get();
  console.log(`Found ${snap.size} orders`);
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`Order ${doc.id}: status=${data.status}, slot=${data.scheduledSlot}, createdAt=${data.createdAt ? data.createdAt.toDate().toISOString() : 'none'}`);
  });
}
run().catch(console.error);
