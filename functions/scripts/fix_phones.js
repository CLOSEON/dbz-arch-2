const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  
  const ordersSnap = await db.collection('orders').get();
    
  let count = 0;
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    if (!order.customer_phone || !order.vendor_phone) {
      const userSnap = await db.collection('users').doc(order.user_id).get();
      const vendorSnap = await db.collection('users').doc(order.vendor_id).get();
      
      const user = userSnap.data() || {};
      const vendor = vendorSnap.data() || {};
      
      const customer_phone = user.phone || user.phoneNumber || '9999999999';
      const vendor_phone = vendor.phone || vendor.phoneNumber || '9999999999';
      
      await doc.ref.update({ customer_phone, vendor_phone });
      count++;
    }
  }
  console.log(`Updated ${count} orders with phone numbers.`);
}
run().catch(console.error);
