const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  const todayStr = new Date().toISOString().split('T')[0];
  const targetSlot = '8am';
  
  const ordersSnap = await db.collection('orders')
    .where('date', '==', todayStr)
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
    const batchId = `BATCH-${vendorId}-${todayStr}-${targetSlot}`;
    const orderIds = docs.map(d => d.id);
    const batchRef = db.collection('batches').doc(batchId);
    
    await batchRef.set({
      id: batchId,
      vendor_id: vendorId,
      date: todayStr,
      slot: targetSlot,
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
