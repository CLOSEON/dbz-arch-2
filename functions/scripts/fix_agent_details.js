const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  
  const tripId = 'euchI41hf3vEANchST3n';
  const tripSnap = await db.collection('rider_trips').doc(tripId).get();
  const trip = tripSnap.data();
  
  const riderSnap = await db.collection('users').doc(trip.riderId).get();
  const rider = riderSnap.data();
  
  const ordersSnap = await db.collection('orders').where('rider_trip_id', '==', tripId).get();
  for (const doc of ordersSnap.docs) {
    await doc.ref.update({
      agentName: rider.name || 'Dabzzo Rider',
      agentPhone: rider.phone || rider.phoneNumber || '9999999999',
      vehicleNumber: rider.vehicleNumber || 'MH12 AB1234'
    });
  }
  console.log('Fixed agent details');
}
run().catch(console.error);
