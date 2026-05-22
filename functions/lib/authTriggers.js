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
exports.setUserRole = exports.onUserCreate = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
    try {
        const customClaims = { role: 'customer' };
        await admin.auth().setCustomUserClaims(user.uid, customClaims);
        await admin.firestore().collection('users').doc(user.uid).set({
            email: user.email,
            role: 'customer',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        functions.logger.info(`Successfully set default 'customer' role for user ${user.uid}`);
    }
    catch (error) {
        functions.logger.error(`Failed to set custom claim for user ${user.uid}:`, error);
    }
});
exports.setUserRole = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
    }
    if (context.auth.token.role !== 'admin') {
        const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Only admins can set user roles.');
        }
    }
    const { uid, role } = data;
    if (!uid || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing uid or role.');
    }
    const allowedRoles = ['customer', 'vendor', 'delivery_agent', 'admin'];
    if (!allowedRoles.includes(role)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid role provided.');
    }
    try {
        await admin.auth().setCustomUserClaims(uid, { role });
        await admin.firestore().collection('users').doc(uid).set({
            role: role,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        functions.logger.info(`Admin ${context.auth.uid} successfully updated user ${uid} to role: ${role}`);
        return { success: true, message: `Successfully updated user role to ${role}` };
    }
    catch (error) {
        functions.logger.error(`Error setting user role for ${uid}:`, error);
        throw new functions.https.HttpsError('internal', 'Failed to update user role.');
    }
});
//# sourceMappingURL=authTriggers.js.map