const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const batches = await db.collection('batches').get();
  console.log(`Batches:`);
  batches.forEach(doc => console.log(doc.id, doc.data()));

  const subs = await db.collection('subscriptions').get();
  console.log(`\nSubscriptions:`);
  subs.forEach(doc => console.log(doc.id, doc.data()));
  
  const orders = await db.collection('orders').get();
  console.log(`\nOrders:`);
  orders.forEach(doc => console.log(doc.id, doc.data()));

  const deliveryOrders = await db.collection('delivery_orders').get();
  console.log(`\nDelivery Orders (today):`);
  deliveryOrders.forEach(doc => {
    // maybe just print count to avoid long output
  });
  console.log(`Total delivery_orders: ${deliveryOrders.size}`);
}
run().catch(console.error);
