#!/usr/bin/env node
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'dabzofb' });
}

const db = getFirestore();

async function check() {
  const snap = await db.collection('users').get();
  console.log('Total users:', snap.size);
  
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.role === 'delivery' || data.roles?.delivery || data.phone === '+919930577000' || data.phone === '+919900990044' || data.email === 'closeon.st@gmail.com') {
      console.log(`Doc ID: ${d.id} | Name: ${data.name} | Phone: ${data.phone} | Email: ${data.email} | Role: ${data.role} | Roles:`, data.roles, '| Approved:', data.is_approved);
    }
  });

  const driversSnap = await db.collection('driver_profiles').get();
  console.log('\nTotal driver_profiles:', driversSnap.size);
  driversSnap.docs.forEach(d => console.log('driver_profile:', d.id, d.data()));
}

check().catch(console.error);
