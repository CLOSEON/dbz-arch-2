const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  
  const ordersSnap = await db.collection('orders')
    .where('status', 'in', ['rider_assigned', 'vendor_ready', 'picked_up'])
    .get();
    
  let count = 0;
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    if (order.rider_trip_id && !order.driverId) {
      // Find the riderId from the trip
      const tripSnap = await db.collection('rider_trips').doc(order.rider_trip_id).get();
      if (tripSnap.exists) {
        const trip = tripSnap.data();
        if (trip.riderId) {
          await doc.ref.update({ driverId: trip.riderId });
          count++;
        }
      }
    }
  }
  console.log(`Updated ${count} orders with driverId.`);
}
run().catch(console.error);
