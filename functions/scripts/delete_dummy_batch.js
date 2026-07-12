const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  await admin.firestore().collection('batches').doc('EsGbpMH6qR8lOiN4n5cv').delete();
  console.log('Dummy batch deleted');
}
run().catch(console.error);
