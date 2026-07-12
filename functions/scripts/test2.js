const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function check() {
  const db = admin.firestore();
  console.log('--- Checking "delivery_orders" collection ---');
  const deliveryOrders = await db.collection('delivery_orders').orderBy('createdAt', 'desc').limit(5).get();
  deliveryOrders.forEach(d => console.log(d.id, d.data().scheduledSlot, d.data().status));
}
check().catch(console.error);
