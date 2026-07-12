const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function check() {
  const doc = await admin.firestore().collection('batches').doc('BATCH-gUsPilR0ZKPNyx0oRlUxCO45cfB3-2026-07-06-11am').get();
  console.log('Exists?', doc.exists);
  if (doc.exists) {
    console.log('Order IDs:', doc.data().order_ids);
  }
}
check().catch(console.error);
