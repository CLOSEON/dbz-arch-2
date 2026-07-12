const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function insert() {
  const db = admin.firestore();
  
  // Find a vendor
  const vendors = await db.collection('users').where('role', '==', 'vendor').limit(1).get();
  if (vendors.empty) { console.log('No vendors found'); return; }
  const vendorId = vendors.docs[0].id;
  console.log('Vendor:', vendorId);
  
  // Today date string
  const todayStr = new Date().toISOString().split('T')[0];
  
  // 1. Create a mock order in `orders`
  const orderRef = db.collection('orders').doc();
  await orderRef.set({
    user_id: 'mock_customer_123',
    vendor_id: vendorId,
    date: todayStr,
    delivery_slot: '11am',
    status: 'created',
    meal_type: 'lunch',
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('Created mock order:', orderRef.id);
  
  // 2. Create a batch for this order
  const batchRef = db.collection('batches').doc();
  await batchRef.set({
    vendor_id: vendorId,
    date: todayStr,
    slot: '11am',
    status: 'pending',
    orders_list: [{
      order_id: orderRef.id,
      meal_type: 'lunch',
      user_id: 'mock_customer_123',
      status: 'created'
    }],
    meal_counts: { lunch: 1 },
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('Created mock batch:', batchRef.id);
}
insert().catch(console.error);
