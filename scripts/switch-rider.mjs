#!/usr/bin/env node
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'dabzofb' });
}

const db = getFirestore();

async function switchRider() {
  console.log('🔄 Linking closeon.st@gmail.com with Test Delivery account (+919900990044)...');

  const usersSnap = await db.collection('users').get();
  let userWithEmail = null;
  let userWithPhone = null;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.email && data.email.toLowerCase() === 'closeon.st@gmail.com') {
      userWithEmail = { id: doc.id, ref: doc.ref, data };
    }
    if (data.phone === '+919900990044') {
      userWithPhone = { id: doc.id, ref: doc.ref, data };
    }
  }

  console.log('User with email:', userWithEmail ? `${userWithEmail.id} (${userWithEmail.data.name}, ${userWithEmail.data.phone})` : 'None');
  console.log('User with phone +919900990044:', userWithPhone ? `${userWithPhone.id} (${userWithPhone.data.name})` : 'None');

  if (userWithEmail) {
    // Merge test rider properties into closeon.st@gmail.com's user doc
    const updatedData = {
      name: 'Test Delivery',
      phone: '+919900990044',
      phone_number: '+919900990044',
      role: 'delivery',
      roles: { delivery: true, admin: true },
      is_approved: true,
      verification_status: 'verified',
      is_superadmin: true,
      vehicle_type: 'Motorcycle',
      vehicle_number: 'DL-01-AB-1234',
      license_number: 'DL-2024-TEST-001',
      updated_at: new Date()
    };

    await userWithEmail.ref.set(updatedData, { merge: true });
    console.log(`✅ Updated user doc ${userWithEmail.id} with phone +919900990044 & Test Delivery profile!`);

    // Also update driver_profiles collection for this UID
    await db.collection('driver_profiles').doc(userWithEmail.id).set({
      id: userWithEmail.id,
      uid: userWithEmail.id,
      name: 'Test Delivery',
      phone: '+919900990044',
      isActive: true,
      vehicle_type: 'Motorcycle',
      vehicle_number: 'DL-01-AB-1234',
      lastActive: new Date(),
      updatedAt: new Date()
    }, { merge: true });
    console.log(`✅ Updated driver_profiles/${userWithEmail.id} for Test Delivery!`);

    // If there was an old test delivery user doc, also migrate/link its trips and orders
    if (userWithPhone && userWithPhone.id !== userWithEmail.id) {
      console.log(`Migrating orders and trips from old UID ${userWithPhone.id} to new UID ${userWithEmail.id}...`);

      const ordersSnap = await db.collection('orders').where('driverId', '==', userWithPhone.id).get();
      for (const o of ordersSnap.docs) {
        await o.ref.update({ driverId: userWithEmail.id });
      }
      console.log(`Migrated ${ordersSnap.size} orders.`);

      const tripsSnap = await db.collection('rider_trips').where('riderId', '==', userWithPhone.id).get();
      for (const t of tripsSnap.docs) {
        await t.ref.update({ riderId: userWithEmail.id });
      }
      console.log(`Migrated ${tripsSnap.size} rider_trips.`);

      const paymentsSnap = await db.collection('rider_payments').where('riderId', '==', userWithPhone.id).get();
      for (const p of paymentsSnap.docs) {
        await p.ref.update({ riderId: userWithEmail.id });
      }
      console.log(`Migrated ${paymentsSnap.size} rider_payments.`);
    }
  }

  console.log('🎉 Successfully linked closeon.st@gmail.com to Test Delivery (+919900990044)!');
}

switchRider().catch(console.error);
