const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });

async function run() {
  const db = admin.firestore();
  
  const ordersSnap = await db.collection('orders').get();
  let count = 0;
  let batch = db.batch();
  
  for (const doc of ordersSnap.docs) {
    const data = doc.data();
    if (!data.otp) {
      const otp = String(Math.floor(1000 + Math.random() * 9000));
      batch.update(doc.ref, { otp });
      count++;
      
      if (count % 490 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
  }
  
  if (count % 490 !== 0) {
    await batch.commit();
  }
  
  console.log(`Successfully backfilled OTP for ${count} orders!`);
}

run().catch(console.error);
