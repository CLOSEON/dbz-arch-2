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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastNotificationV1 = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
exports.broadcastNotificationV1 = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const { target, title, message } = data;
    if (!title || !message) {
        throw new functions.https.HttpsError('invalid-argument', 'Title and message are required.');
    }
    try {
        const db = admin.firestore();
        const messaging = admin.messaging();
        let query = db.collection('users');
        if (target !== 'all') {
            query = query.where('role', '==', target);
        }
        const snapshot = await query.get();
        const tokens = [];
        snapshot.forEach(doc => {
            const user = doc.data();
            if (user.push_tokens && Array.isArray(user.push_tokens)) {
                tokens.push(...user.push_tokens);
            }
        });
        if (tokens.length === 0) {
            return { success: true, sentCount: 0, message: 'No devices found for this target.' };
        }
        const uniqueTokens = Array.from(new Set(tokens));
        const chunks = [];
        for (let i = 0; i < uniqueTokens.length; i += 500) {
            chunks.push(uniqueTokens.slice(i, i + 500));
        }
        let successCount = 0;
        for (const chunk of chunks) {
            const response = await messaging.sendEachForMulticast({
                tokens: chunk,
                notification: {
                    title,
                    body: message,
                },
                android: {
                    notification: {
                        channelId: 'default',
                        priority: 'high'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default'
                        }
                    }
                }
            });
            successCount += response.successCount;
        }
        await db.collection('notifications_history').add({
            target,
            title,
            message,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            successCount,
            totalTargeted: uniqueTokens.length,
            senderUid: context.auth.uid
        });
        return {
            success: true,
            sentCount: successCount,
            totalDevices: uniqueTokens.length
        };
    }
    catch (error) {
        console.error('Error sending broadcast:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send notifications');
    }
});
__exportStar(require("./deliveryTriggers"), exports);
__exportStar(require("./authTriggers"), exports);
__exportStar(require("./payoutTriggers"), exports);
//# sourceMappingURL=index.js.map