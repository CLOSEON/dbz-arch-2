const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dabzofb' });
async function run() {
  const db = admin.firestore();
  
  const drivers = await db.collection('driver_profiles').get();
  for (const doc of drivers.docs) {
    if (doc.id === 'sp80Y9XAKJaMpAUjAFjbrArEaGw2' || doc.data().name.includes('Delivery')) {
      await doc.ref.update({ isActive: true });
      console.log(`Activated driver ${doc.id}`);
    }
  }
}
run().catch(console.error);
