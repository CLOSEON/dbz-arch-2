const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
async function run() {
  const query = await db.collection('orders').where('customer_phone', '==', '9900990011').get();
  query.forEach(doc => console.log(doc.id, doc.data().status));
  
  const query2 = await db.collection('orders').where('user_id', '==', 'user_id_here').get(); // Need user id?
}
run();
