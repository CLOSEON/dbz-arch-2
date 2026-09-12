#!/usr/bin/env node
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'dabzofb' });
}

const db = getFirestore();

async function inspectAndDeduplicate() {
  console.log('🔍 Inspecting delivery users and driver_profiles in Firestore...');

  const usersSnap = await db.collection('users').get();
  const deliveryUsers = [];

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.role === 'delivery' || data.roles?.delivery || data.phone === '+919900990044' || data.phone === '+919930577000') {
      deliveryUsers.push({ id: doc.id, ...data });
    }
  }

  console.log(`Found ${deliveryUsers.length} delivery user documents:`);
  deliveryUsers.forEach(u => {
    console.log(`- UID: ${u.id}, Name: ${u.name}, Email: ${u.email}, Phone: ${u.phone}`);
  });

  // Find duplicate +919900990044
  const phoneMap = new Map();
  for (const u of deliveryUsers) {
    const key = u.phone || u.email;
    if (!key) continue;
    if (!phoneMap.has(key)) {
      phoneMap.set(key, []);
    }
    phoneMap.get(key).push(u);
  }

  for (const [key, list] of phoneMap.entries()) {
    if (list.length > 1) {
      console.log(`⚠️ Found ${list.length} duplicates for ${key}:`);
      // Keep the one with email closeon.st@gmail.com, delete or demote the older dummy ones
      const primary = list.find(u => u.email === 'closeon.st@gmail.com') || list[0];
      const duplicates = list.filter(u => u.id !== primary.id);

      for (const dup of duplicates) {
        console.log(`🗑️ Deleting orphan duplicate user doc: ${dup.id} (${dup.name})`);
        await db.collection('users').doc(dup.id).delete();
        await db.collection('driver_profiles').doc(dup.id).delete();
      }
    }
  }

  console.log('✅ Firestore deduplication complete!');
}

inspectAndDeduplicate().catch(console.error);
