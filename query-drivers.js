const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

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

async function main() {
  console.log('Querying ALL driver profiles...');
  const snap = await getDocs(collection(db, 'driver_profiles'));
  console.log(`Found ${snap.docs.length} drivers total.`);
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log(doc.id, 'isActive:', data.isActive, 'currentLocation:', data.currentLocation);
  });
  process.exit(0);
}

main().catch(console.error);
