const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const todayStr = new Date().toISOString().split('T')[0];
  const orders = await db.collection('orders').where('date', '==', todayStr).get();
  orders.forEach(doc => console.log(doc.id, doc.data().delivery_slot, doc.data().status));
}
run().catch(console.error);
