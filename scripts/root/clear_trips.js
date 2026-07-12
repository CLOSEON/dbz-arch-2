import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDDuCCfdoGZUv92B_tgK3ibzOU8io5bee0',
  authDomain: 'dabzofb.firebaseapp.com',
  projectId: 'dabzofb',
  storageBucket: 'dabzofb.firebasestorage.app',
  messagingSenderId: '651368129597',
  appId: '1:651368129597:web:31bd85f34d84e7e23b3654'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const q = query(
    collection(db, 'rider_trips'),
    where('status', 'in', ['pickup_pending', 'picking_up', 'pickup_complete', 'dropping'])
  );
  const snap = await getDocs(q);
  console.log("Found", snap.size, "stuck trips!");
  for (const d of snap.docs) {
    await updateDoc(doc(db, 'rider_trips', d.id), { status: 'completed' });
    console.log("Cleared trip", d.id);
  }
}
run().catch(console.error).then(() => process.exit(0));
