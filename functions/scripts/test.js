const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function check() {
  const db = admin.firestore();
  console.log('--- Checking "orders" collection ---');
  const orders = await db.collection('orders').orderBy('created_at', 'desc').limit(5).get();
  orders.forEach(d => console.log(d.id, d.data().date, d.data().delivery_slot, d.data().status));
}
check().catch(console.error);
