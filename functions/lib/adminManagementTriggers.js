"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRider = exports.verifyVendor = exports.setAdminClaim = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
async function assertCallerIsAdmin(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const callerUid = context.auth.uid;
    const hasCustomClaim = context.auth.token.admin === true;
    if (hasCustomClaim) {
        return callerUid;
    }
    const userDoc = await admin.firestore().collection('users').doc(callerUid).get();
    if (userDoc.exists && (userDoc.data()?.role === 'admin' || userDoc.data()?.roles?.admin === true)) {
        return callerUid;
    }
    throw new functions.https.HttpsError('permission-denied', 'Only administrators are permitted to perform this action.');
}
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    const actorUid = await assertCallerIsAdmin(context);
    const { targetUid } = data;
    if (!targetUid || typeof targetUid !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'The targetUid argument must be a non-empty string.');
    }
    try {
        await admin.auth().setCustomUserClaims(targetUid, { admin: true });
        await admin.firestore().collection('users').doc(targetUid).set({
            roles: { admin: true },
            role: 'admin'
        }, { merge: true });
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
    }
    catch (error) {
        console.error(`[setAdminClaim] Error for ${targetUid}:`, error);
        await admin.firestore().collection('audit_logs').add({
            action: 'SET_ADMIN_CLAIM',
            actorUid,
            targetUid,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            result: 'failed',
            error: error.message || String(error)
        }).catch(console.error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to set admin claim.');
    }
});
exports.verifyVendor = functions.https.onCall(async (data, context) => {
    const actorUid = await assertCallerIsAdmin(context);
    const { targetUid, decision } = data;
    if (!targetUid || typeof targetUid !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'targetUid is required.');
    }
    if (decision !== 'approve' && decision !== 'reject') {
        throw new functions.https.HttpsError('invalid-argument', 'decision must be either "approve" or "reject".');
    }
    try {
        const isApprove = decision === 'approve';
        const status = isApprove ? 'verified' : 'rejected';
        const updateData = {
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
    }
    catch (error) {
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
exports.verifyRider = functions.https.onCall(async (data, context) => {
    const actorUid = await assertCallerIsAdmin(context);
    const { targetUid, decision } = data;
    if (!targetUid || typeof targetUid !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'targetUid is required.');
    }
    if (decision !== 'approve' && decision !== 'reject') {
        throw new functions.https.HttpsError('invalid-argument', 'decision must be either "approve" or "reject".');
    }
    try {
        const isApprove = decision === 'approve';
        const status = isApprove ? 'verified' : 'rejected';
        const updateData = {
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
    }
    catch (error) {
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
//# sourceMappingURL=adminManagementTriggers.js.map