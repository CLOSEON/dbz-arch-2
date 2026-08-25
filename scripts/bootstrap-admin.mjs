#!/usr/bin/env node
/**
 * bootstrap-admin.mjs
 *
 * Manual one-time script to set the FIRST Admin Custom Claim ({ admin: true })
 * on a user account, bootstrapping administrative access securely.
 *
 * Usage:
 *   node scripts/bootstrap-admin.mjs <UID_OR_PHONE_NUMBER>
 *
 * Examples:
 *   node scripts/bootstrap-admin.mjs +919930577000
 *   node scripts/bootstrap-admin.mjs 4s8X...yZ1
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 1. Initialize Firebase Admin SDK
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'dabzofb';
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;

if (!getApps().length) {
  let credential;
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    credential = cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
  }

  initializeApp({
    projectId,
    ...(credential && { credential })
  });
}

const adminAuth = getAuth();
const adminDb = getFirestore();

async function bootstrapAdmin() {
  const targetInput = process.argv[2];

  if (!targetInput) {
    console.error('❌ Error: Missing target UID or phone number.');
    console.log('\nUsage:\n  node scripts/bootstrap-admin.mjs <UID_OR_PHONE>');
    console.log('Example:\n  node scripts/bootstrap-admin.mjs +919930577000\n');
    process.exit(1);
  }

  console.log(`🔍 Looking up user: "${targetInput}" in project "${projectId}"...`);

  let userRecord;
  try {
    if (targetInput.startsWith('+')) {
      userRecord = await adminAuth.getUserByPhoneNumber(targetInput);
    } else {
      userRecord = await adminAuth.getUser(targetInput);
    }
  } catch (err) {
    console.error(`❌ Failed to find user by UID/phone "${targetInput}":`, err.message);
    process.exit(1);
  }

  const targetUid = userRecord.uid;
  console.log(`✅ Found User: ${userRecord.displayName || 'No Name'} (UID: ${targetUid}, Phone: ${userRecord.phoneNumber})`);

  // 2. Set Custom User Claim { admin: true }
  console.log(`🔐 Setting { admin: true } custom claim...`);
  await adminAuth.setCustomUserClaims(targetUid, { admin: true });

  // 3. Update Firestore Document
  console.log(`📝 Updating users/${targetUid} document in Firestore...`);
  await adminDb.collection('users').doc(targetUid).set({
    roles: { admin: true },
    role: 'admin'
  }, { merge: true });

  // 4. Record Audit Log
  console.log(`📋 Logging entry to audit_logs collection...`);
  await adminDb.collection('audit_logs').add({
    action: 'BOOTSTRAP_ADMIN',
    actorUid: 'SYSTEM_BOOTSTRAP_SCRIPT',
    targetUid,
    phoneNumber: userRecord.phoneNumber,
    timestamp: FieldValue.serverTimestamp(),
    result: 'success'
  });

  console.log('\n🎉 SUCCESS! Admin access bootstrapped successfully.');
  console.log('----------------------------------------------------');
  console.log(`User UID     : ${targetUid}`);
  console.log(`Phone Number : ${userRecord.phoneNumber}`);
  console.log(`Custom Claim : { admin: true }`);
  console.log('----------------------------------------------------');
  console.log('⚠️ IMPORTANT SECURITY NOTE:');
  console.log('The target user MUST SIGN OUT and SIGN IN again on the app/web');
  console.log('for their Firebase Auth ID token to refresh with the new admin claim.\n');

  process.exit(0);
}

bootstrapAdmin().catch((err) => {
  console.error('❌ Bootstrap failed with error:', err);
  process.exit(1);
});
