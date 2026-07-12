const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  // Call the logic from assignRiderTrips
  
  // 1. Fetch unassigned canonical orders that are ready for pickup
  let ordersQuery = db.collection('orders').where('status', '==', 'vendor_ready');
  const ordersSnap = await ordersQuery.get();
  console.log(`Found ${ordersSnap.size} vendor_ready orders in orders collection`);

  const unassignedOrders = ordersSnap.docs
    .map(doc => ({ id: doc.id, ...(doc.data()) }))
    .filter(order => !order.rider_trip_id);
    
  console.log(`Unassigned orders: ${unassignedOrders.length}`);
  
  if (unassignedOrders.length > 0) {
    const order = unassignedOrders[0];
    console.log(`First unassigned order: ${order.id}, vendor_id: ${order.vendor_id}`);
    
    // Check drivers
    const driversSnap = await db.collection('driver_profiles')
      .where('isActive', '==', true)
      .get();
    console.log(`Active drivers: ${driversSnap.size}`);
  }
}
run().catch(console.error);
