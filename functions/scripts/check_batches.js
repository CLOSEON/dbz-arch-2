const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function check() {
  const docs = await admin.firestore().collection('batches').get();
  docs.forEach(d => {
    console.log(d.id, d.data().status, d.data().slot, d.data().date, d.data().order_ids);
  });
}
check().catch(console.error);
