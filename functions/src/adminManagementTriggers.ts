import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

/**
 * Helper to check if caller is an admin
 */
async function assertCallerIsAdmin(context: functions.https.CallableContext): Promise<string> {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const callerUid = context.auth.uid;
  const hasCustomClaim = context.auth.token.admin === true;

  if (hasCustomClaim) {
    return callerUid;
  }

  // Fallback check on Firestore doc for initial migration
  const userDoc = await admin.firestore().collection('users').doc(callerUid).get();
  if (userDoc.exists && (userDoc.data()?.role === 'admin' || userDoc.data()?.roles?.admin === true)) {
    return callerUid;
  }

  throw new functions.https.HttpsError(
    'permission-denied',
    'Only administrators are permitted to perform this action.'
  );
}

/**
 * 1. setAdminClaim
 * Sets the { admin: true } Firebase Auth custom claim on a target user.
 */
export const setAdminClaim = functions.https.onCall(async (data, context) => {
  const actorUid = await assertCallerIsAdmin(context);

  const { targetUid } = data;
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The targetUid argument must be a non-empty string.'
    );
  }

  try {
    // Set Custom User Claim on Firebase Auth
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });

    // Update Firestore user document
    await admin.firestore().collection('users').doc(targetUid).set({
      roles: { admin: true },
      role: 'admin'
    }, { merge: true });

    // Record Audit Log Entry
    await admin.firestore().collection('audit_logs').add({
      action: 'SET_ADMIN_CLAIM',
      actorUid,
      targetUid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      result: 'success'
    });

    return {
      success: true,
      message: `Successfully set admin custom claim for user ${targetUid}`
    };

  } catch (error: any) {
    console.error(`[setAdminClaim] Error for ${targetUid}:`, error);

    // Record Failed Audit Log
    await admin.firestore().collection('audit_logs').add({
      action: 'SET_ADMIN_CLAIM',
      actorUid,
      targetUid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      result: 'failed',
      error: error.message || String(error)
    }).catch(console.error);

    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Failed to set admin claim.'
    );
  }
});

/**
 * 2. verifyVendor
 * Approves or rejects a vendor application and updates roles.vendor.status.
 */
export const verifyVendor = functions.https.onCall(async (data, context) => {
  const actorUid = await assertCallerIsAdmin(context);

  const { targetUid, decision } = data;
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid is required.');
  }

  if (decision !== 'approve' && decision !== 'reject') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'decision must be either "approve" or "reject".'
    );
  }

  try {
    const isApprove = decision === 'approve';
    const status = isApprove ? 'verified' : 'rejected';

    const updateData: Record<string, any> = {
      'roles.vendor.status': status,
      'roles.vendor.verifiedAt': admin.firestore.FieldValue.serverTimestamp(),
      'roles.vendor.verifiedBy': actorUid,
      is_approved: isApprove,
      isApproved: isApprove,
    };

    if (isApprove) {
      updateData.role = 'vendor';
    }

    await admin.firestore().collection('users').doc(targetUid).update(updateData);

    // Record Audit Log Entry
    await admin.firestore().collection('audit_logs').add({
      action: 'VERIFY_VENDOR',
      actorUid,
      targetUid,
      decision,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      result: 'success'
    });

    return {
      success: true,
      targetUid,
      decision,
      status
    };

  } catch (error: any) {
    console.error(`[verifyVendor] Error for ${targetUid}:`, error);

    await admin.firestore().collection('audit_logs').add({
      action: 'VERIFY_VENDOR',
      actorUid,
      targetUid,
      decision,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      result: 'failed',
      error: error.message || String(error)
    }).catch(console.error);

    throw new functions.https.HttpsError('internal', error.message || 'Failed to verify vendor.');
  }
});

/**
 * 3. verifyRider
 * Approves or rejects a rider application and updates roles.rider.status.
 */
export const verifyRider = functions.https.onCall(async (data, context) => {
  const actorUid = await assertCallerIsAdmin(context);

  const { targetUid, decision } = data;
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid is required.');
  }

  if (decision !== 'approve' && decision !== 'reject') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'decision must be either "approve" or "reject".'
    );
  }

  try {
    const isApprove = decision === 'approve';
    const status = isApprove ? 'verified' : 'rejected';

    const updateData: Record<string, any> = {
      'roles.rider.status': status,
      'roles.rider.verifiedAt': admin.firestore.FieldValue.serverTimestamp(),
      'roles.rider.verifiedBy': actorUid,
      is_approved: isApprove,
      isApproved: isApprove,
    };

    if (isApprove) {
      updateData.role = 'delivery';
    }

    await admin.firestore().collection('users').doc(targetUid).update(updateData);

    // Record Audit Log Entry
    await admin.firestore().collection('audit_logs').add({
      action: 'VERIFY_RIDER',
      actorUid,
      targetUid,
      decision,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      result: 'success'
    });

    return {
      success: true,
      targetUid,
      decision,
      status
    };

  } catch (error: any) {
    console.error(`[verifyRider] Error for ${targetUid}:`, error);

    await admin.firestore().collection('audit_logs').add({
      action: 'VERIFY_RIDER',
      actorUid,
      targetUid,
      decision,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      result: 'failed',
      error: error.message || String(error)
    }).catch(console.error);

    throw new functions.https.HttpsError('internal', error.message || 'Failed to verify rider.');
  }
});
