#!/usr/bin/env node
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectId = 'dabzofb';

if (!getApps().length) {
  initializeApp({ projectId });
}

const db = getFirestore();
const auth = getAuth();

async function main() {
  console.log('🔍 Searching users for closeon.st@gmail.com and +919930577000...');
  
  const usersSnap = await db.collection('users').get();
  console.log(`Found ${usersSnap.size} users total.`);

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const isTarget = 
      (data.email && data.email.toLowerCase() === 'closeon.st@gmail.com') ||
      data.phone === '+919930577000' ||
      data.phone === '+919900990044';

    if (isTarget) {
      console.log(`✨ Approving Rider Target: ${doc.id} | Email: ${data.email} | Phone: ${data.phone}`);
      await doc.ref.set({
        is_approved: true,
        verification_status: 'verified',
        is_superadmin: true,
        vehicle_type: data.vehicle_type || 'Motorcycle',
        vehicle_number: data.vehicle_number || 'DL-01-AB-1234',
        license_number: data.license_number || 'DL-2024-TEST-001',
        updated_at: new Date()
      }, { merge: true });

      // Also ensure driver_profiles has active status
      await db.collection('driver_profiles').doc(doc.id).set({
        id: doc.id,
        name: data.name || 'Test Rider',
        phone: data.phone || '+919900990044',
        isActive: true,
        vehicle_type: data.vehicle_type || 'Motorcycle',
        vehicle_number: data.vehicle_number || 'DL-01-AB-1234',
        lastActive: new Date(),
        updatedAt: new Date()
      }, { merge: true });
    }
  }

  console.log('✅ Rider approval sync complete!');
}

main().catch(console.error);
