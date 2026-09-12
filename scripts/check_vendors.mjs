import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDDuCCfdoGZUv92B_tgK3ibzOU8io5bee0",
  authDomain: "dabzofb.firebaseapp.com",
  projectId: "dabzofb",
  storageBucket: "dabzofb.firebasestorage.app",
  messagingSenderId: "651368129597",
  appId: "1:651368129597:web:31bd85f34d84e7e23b3654"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Fetching vendors...");
  const q = query(collection(db, 'users'), where('role', '==', 'vendor'));
  const snap = await getDocs(q);
  console.log("Found vendor count:", snap.size);
  snap.forEach(doc => {
    const data = doc.data();
    console.log({
      id: doc.id,
      name: data.name,
      cuisine_type: data.cuisine_type,
      is_approved: data.is_approved,
      is_rejected: data.is_rejected,
      location: data.location
    });
  });
}

run().catch(console.error);
