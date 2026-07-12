const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function cleanBatches() {
  const vendorSnap = await db.collection('users').where('phone', '==', '+919900990022').get();
  if (vendorSnap.empty) return;
  const vendorId = vendorSnap.docs[0].id;
  
  const batches = await db.collection('batches')
    .where('vendor_id', '==', vendorId)
    .where('status', '==', 'ready')
    .get();
    
  for (const doc of batches.docs) {
    if (doc.data().slot !== '11am') {
      console.log('Deleting stuck batch', doc.id);
      await doc.ref.delete();
    }
  }
  console.log('Done');
}
cleanBatches();
