const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function check() {
  const db = admin.firestore();
  console.log('--- Checking "batches" collection ---');
  const batches = await db.collection('batches').limit(50).get();
  batches.forEach(d => console.log(d.id, d.data().vendor_id));
}
check().catch(console.error);
