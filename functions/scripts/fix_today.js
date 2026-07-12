const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  
  // 1. Delete today's batches and orders to start fresh
  const todayStr = new Date().toISOString().split('T')[0];
  console.log(`Clearing orders and batches for ${todayStr}...`);
  
  let deletedOrders = 0;
  const orders = await db.collection('orders').where('date', '==', todayStr).get();
  for (const doc of orders.docs) {
    await doc.ref.delete();
    deletedOrders++;
  }
  
  let deletedBatches = 0;
  const batches = await db.collection('batches').where('date', '==', todayStr).get();
  for (const doc of batches.docs) {
    await doc.ref.delete();
    deletedBatches++;
  }
  
  console.log(`Deleted ${deletedOrders} orders, ${deletedBatches} batches.`);

  // 2. Call processDailyDeliveries (from our newly built functions/lib)
  console.log('Running processDailyDeliveries...');
  const { processDailyDeliveries } = require('./lib/deliveryTriggers.js');
  // Hack: The function might be exported or we can just copy the logic. 
  // Wait, processDailyDeliveries is NOT exported! It's wrapped in onCall.
  // Actually I can just write the logic here to force generate the orders for today.
  
  const subsSnap = await db.collection('subscriptions').where('status', '==', 'active').get();
  for (const subDoc of subsSnap.docs) {
    const sub = subDoc.data();
    const userSnap = await db.collection('users').doc(sub.user_id).get();
    const user = userSnap.data();
    
    const mealTypesToGenerate = sub.meal_type === 'both' ? ['lunch', 'dinner'] : [sub.meal_type];
    for (const mealType of mealTypesToGenerate) {
      const scheduledSlot = mealType === 'lunch' ? (user.deliveryPreference || '11am') : '8pm';
      
      const newOrderRef = db.collection('orders').doc();
      await newOrderRef.set({
        order_id: newOrderRef.id,
        user_id: sub.user_id,
        subscription_id: subDoc.id,
        date: todayStr,
        meal_type: mealType,
        delivery_slot: scheduledSlot,
        vendor_id: sub.vendor_id,
        batch_id: null,
        delivery_address: {
          line1: user.address || `${user.name}'s Location`,
          lat: user.location?.lat || 18.5204,
          lng: user.location?.lng || 73.8567,
        },
        status: 'created',
        rider_trip_id: null,
        swap_ref: null,
        skip_ref: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Created order ${newOrderRef.id} for ${sub.user_id} (${mealType})`);
    }
  }

  // 3. Call formBatches logic
  console.log('Running formBatches...');
  const targetSlot = '11am'; // We'll just do 11am for now since that's what the user is testing
  const targetDateStr = todayStr;
  
  const ordersSnap = await db.collection('orders')
    .where('date', '==', targetDateStr)
    .where('delivery_slot', '==', targetSlot)
    .where('status', '==', 'created')
    .get();
    
  const vendorOrders = new Map();
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    if (order.vendor_id) {
      if (!vendorOrders.has(order.vendor_id)) vendorOrders.set(order.vendor_id, []);
      vendorOrders.get(order.vendor_id).push(doc);
    }
  }
  
  for (const [vendorId, docs] of vendorOrders.entries()) {
    const batchId = `BATCH-${vendorId}-${targetDateStr}-${targetSlot}`;
    const orderIds = docs.map(d => d.id);
    const batchRef = db.collection('batches').doc(batchId);
    
    await batchRef.set({
      id: batchId,
      vendor_id: vendorId,
      date: targetDateStr,
      slot: targetSlot,
      order_ids: orderIds,
      status: 'notified', // set to notified or preparing? The UI looks for preparing
      total_count: orderIds.length,
      last_notified_count: orderIds.length,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    for (const d of docs) {
      await d.ref.update({
        batch_id: batchId,
        status: 'preparing', // we can skip vendor_notified directly to preparing so the vendor sees it
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log(`Created batch ${batchId} with ${orderIds.length} orders`);
  }
  
  // also do 8pm just in case
  const targetSlot2 = '8pm';
  const ordersSnap2 = await db.collection('orders')
    .where('date', '==', targetDateStr)
    .where('delivery_slot', '==', targetSlot2)
    .where('status', '==', 'created')
    .get();
    
  const vendorOrders2 = new Map();
  for (const doc of ordersSnap2.docs) {
    const order = doc.data();
    if (order.vendor_id) {
      if (!vendorOrders2.has(order.vendor_id)) vendorOrders2.set(order.vendor_id, []);
      vendorOrders2.get(order.vendor_id).push(doc);
    }
  }
  
  for (const [vendorId, docs] of vendorOrders2.entries()) {
    const batchId = `BATCH-${vendorId}-${targetDateStr}-${targetSlot2}`;
    const orderIds = docs.map(d => d.id);
    const batchRef = db.collection('batches').doc(batchId);
    
    await batchRef.set({
      id: batchId,
      vendor_id: vendorId,
      date: targetDateStr,
      slot: targetSlot2,
      order_ids: orderIds,
      status: 'notified',
      total_count: orderIds.length,
      last_notified_count: orderIds.length,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    for (const d of docs) {
      await d.ref.update({
        batch_id: batchId,
        status: 'preparing',
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    console.log(`Created batch ${batchId} with ${orderIds.length} orders`);
  }
  
}
run().catch(console.error);
