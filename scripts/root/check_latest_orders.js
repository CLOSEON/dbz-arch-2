const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function checkLatestOrder() {
  const snap = await db.collection('orders').orderBy('created_at', 'desc').limit(5).get();
  snap.docs.forEach(d => {
    const data = d.data();
    console.log(`Order: ${d.id}, user_id: ${data.user_id}, date: ${data.date}, status: ${data.status}`);
  });
}

checkLatestOrder().catch(console.error);
