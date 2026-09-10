#!/usr/bin/env node
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'dabzofb' });
}

const db = getFirestore();

async function inspectAndDeduplicateVendors() {
  console.log('🔍 Inspecting vendor users in Firestore...');

  const usersSnap = await db.collection('users').get();
  const vendors = [];

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.role === 'vendor' || data.roles?.vendor || data.phone === '+919900990022' || (data.name && data.name.toLowerCase().includes('test vendor')) || (data.kitchen_name && data.kitchen_name.toLowerCase().includes('test vendor'))) {
      vendors.push({ id: doc.id, ...data });
    }
  }

  console.log(`Found ${vendors.length} vendor documents in users:`);
  vendors.forEach(v => {
    console.log(`- ID: ${v.id}, Name: ${v.name || v.kitchen_name}, Phone: ${v.phone}, Status: ${v.verification_status}, Approved: ${v.is_approved}, Rejected: ${v.is_rejected}, Address: ${v.location?.address || v.address?.line1 || v.address}`);
  });

  // Group by phone or kitchen name
  const phoneMap = new Map();
  for (const v of vendors) {
    const key = v.phone || v.kitchen_name || v.id;
    if (!phoneMap.has(key)) {
      phoneMap.set(key, []);
    }
    phoneMap.get(key).push(v);
  }

  for (const [key, list] of phoneMap.entries()) {
    if (list.length > 1) {
      console.log(`⚠️ Found ${list.length} duplicate vendors for key: ${key}`);
      // Find the one with banner image or Noida address, or most complete profile
      const primary = list.find(v => v.banner_url || v.logo_url || (v.location?.address && v.location.address.includes('Noida'))) || list[0];
      const duplicates = list.filter(v => v.id !== primary.id);

      // Make sure primary is fully approved, verified, and unlocked
      console.log(`✅ Keeping primary vendor: ${primary.id} (${primary.name || primary.kitchen_name})`);
      await db.collection('users').doc(primary.id).set({
        ...primary,
        role: 'vendor',
        is_approved: true,
        verification_status: 'verified',
        is_rejected: false,
        admin_note: '',
        rejection_reason: null,
      }, { merge: true });

      for (const dup of duplicates) {
        console.log(`🗑️ Deleting duplicate vendor: ${dup.id} (${dup.name || dup.kitchen_name})`);
        await db.collection('users').doc(dup.id).delete();
      }
    } else {
      // Also ensure any test vendor is verified
      const single = list[0];
      if (single.phone === '+919900990022' || single.name === 'Test Vendor') {
        console.log(`Ensuring single vendor ${single.id} is verified and approved:`);
        await db.collection('users').doc(single.id).set({
          is_approved: true,
          verification_status: 'verified',
          is_rejected: false,
          admin_note: '',
          rejection_reason: null,
        }, { merge: true });
      }
    }
  }

  console.log('✅ Vendor deduplication & verification complete!');
}

inspectAndDeduplicateVendors().catch(console.error);
