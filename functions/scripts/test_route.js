const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
function getDistanceInKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}
async function run() {
  const db = admin.firestore();
  const tripId = 'euchI41hf3vEANchST3n';
  const tripSnap = await db.collection('rider_trips').doc(tripId).get();
  const after = tripSnap.data();
  console.log('Trip Data:', after);
  
  const pickupStops = after.pickupStops ?? [];
  const lastPickup = [...pickupStops].reverse().find(s => s.status === 'completed');
  let currentLat = lastPickup?.location?.lat ?? 18.5204;
  let currentLng = lastPickup?.location?.lng ?? 73.8567;
  
  const orderIds = after.assignedOrderIds ?? [];
  if (orderIds.length === 0) return console.log('No assigned orders');
  
  const allOrders = [];
  for (let i = 0; i < orderIds.length; i += 30) {
    const chunk = orderIds.slice(i, i + 30);
    const snap = await db.collection('orders').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
    snap.docs.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
  }
  console.log('All Orders fetched:', allOrders.length);
  
  const pendingDrops = allOrders.filter(o => o.status !== 'delivered' && o.status !== 'failed');
  console.log('Pending Drops:', pendingDrops.length);
  
  const dropStops = [];
  let unvisited = [...pendingDrops];
  let sequence = 1;
  
  while (unvisited.length > 0) {
    let nearest = null;
    let shortestDist = Infinity;
    for (const order of unvisited) {
      const oLat = order.delivery_address?.lat ?? 0;
      const oLng = order.delivery_address?.lng ?? 0;
      const d = getDistanceInKm(currentLat, currentLng, oLat, oLng);
      if (d < shortestDist) {
        shortestDist = d;
        nearest = order;
      }
    }
    if (!nearest) {
      console.log('No nearest found, breaking');
      break;
    }
    
    dropStops.push({
      orderId: nearest.id,
      customerId: nearest.user_id,
      location: { lat: nearest.delivery_address?.lat ?? 0, lng: nearest.delivery_address?.lng ?? 0 },
      address: nearest.delivery_address?.line1 ?? '',
      landmark: nearest.delivery_address?.landmark ?? '',
      sequence,
      distanceKm: shortestDist,
      status: 'pending'
    });
    
    currentLat = nearest.delivery_address?.lat ?? currentLat;
    currentLng = nearest.delivery_address?.lng ?? currentLng;
    unvisited = unvisited.filter(o => o.id !== nearest.id);
    sequence++;
  }
  console.log('Computed dropStops:', dropStops);
}
run().catch(console.error);
