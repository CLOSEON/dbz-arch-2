const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  
  // 1. Reset batch
  const batches = await db.collection('batches').get();
  let count = 0;
  for (const doc of batches.docs) {
    if (doc.data().status === 'ready') {
      await doc.ref.update({ status: 'preparing' });
      count++;
    }
  }
  console.log(`Reset ${count} batches`);

  // 2. Reset real orders in `orders`
  const orders = await db.collection('orders').where('status', '==', 'vendor_ready').get();
  let orderCount = 0;
  for (const doc of orders.docs) {
    await doc.ref.update({ status: 'preparing', rider_trip_id: admin.firestore.FieldValue.delete() });
    orderCount++;
  }
  console.log(`Reset ${orderCount} orders`);
  
  // 3. Clear old rider trips
  const trips = await db.collection('rider_trips').get();
  for (const doc of trips.docs) {
    await doc.ref.delete();
  }
  console.log(`Deleted ${trips.size} old trips`);
}
run().catch(console.error);
