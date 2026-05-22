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
const admin = __importStar(require("firebase-admin"));
const functionsTest = __importStar(require("firebase-functions-test"));
const deliveryTriggers_1 = require("../deliveryTriggers");
const payoutTriggers_1 = require("../payoutTriggers");
const notifications = __importStar(require("../utils/notifications"));
const testEnv = functionsTest();
jest.mock('firebase-admin', () => {
    const mockTransaction = {
        get: jest.fn(),
        update: jest.fn(),
    };
    const mockDoc = {
        get: jest.fn(),
        update: jest.fn(),
        set: jest.fn(),
    };
    const mockCollection = {
        doc: jest.fn(() => mockDoc),
        where: jest.fn(() => mockCollection),
        get: jest.fn(() => Promise.resolve({ docs: [] })),
    };
    const mockBatch = {
        set: jest.fn(),
        update: jest.fn(),
        commit: jest.fn(() => Promise.resolve()),
    };
    const firestore = jest.fn(() => ({
        collection: jest.fn(() => mockCollection),
        runTransaction: jest.fn((cb) => cb(mockTransaction)),
        batch: jest.fn(() => mockBatch),
    }));
    firestore.FieldValue = {
        arrayUnion: jest.fn((val) => val),
        serverTimestamp: jest.fn(() => 'MOCK_TIMESTAMP'),
        increment: jest.fn((val) => `INCREMENT_${val}`),
    };
    firestore.Timestamp = {
        now: jest.fn(() => 'MOCK_TIMESTAMP'),
    };
    return {
        firestore,
        initializeApp: jest.fn(),
    };
});
jest.mock('../utils/notifications', () => ({
    sendPushNotification: jest.fn(),
    orderPickedUpPayload: jest.fn(),
    orderDeliveredPayload: jest.fn(),
    deliveryFailedPayload: jest.fn(),
    deliveryFailedAdminPayload: jest.fn(),
}));
describe('Delivery Status Updates and Payouts', () => {
    let wrappedUpdateDeliveryStatus;
    let wrappedPayoutTrigger;
    beforeAll(() => {
        wrappedUpdateDeliveryStatus = testEnv.wrap(deliveryTriggers_1.updateDeliveryStatus);
        wrappedPayoutTrigger = testEnv.wrap(payoutTriggers_1.onDeliveryCompletedPayout);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    afterAll(() => {
        testEnv.cleanup();
    });
    const getMockTransaction = () => {
        const db = admin.firestore();
        let tx;
        db.runTransaction = jest.fn((cb) => {
            tx = {
                get: jest.fn(),
                update: jest.fn(),
            };
            return cb(tx);
        });
        return () => tx;
    };
    it('1. Valid transition pending → picked_up succeeds', async () => {
        const getTx = getMockTransaction();
        const db = admin.firestore();
        db.runTransaction.mockImplementationOnce(async (cb) => {
            const tx = {
                get: jest.fn().mockResolvedValue({
                    exists: true,
                    data: () => ({ status: 'pending', agentId: 'agent_123', customerId: 'cust_1' }),
                }),
                update: jest.fn(),
            };
            return cb(tx);
        });
        const result = await wrappedUpdateDeliveryStatus({
            data: { orderId: 'order_1', status: 'picked_up' },
            auth: { uid: 'agent_123', token: { role: 'delivery_agent' } },
        });
        expect(result.success).toBe(true);
        expect(result.newStatus).toBe('picked_up');
        expect(notifications.sendPushNotification).toHaveBeenCalled();
    });
    it('2. Invalid transition pending → delivered throws FAILED_PRECONDITION', async () => {
        const db = admin.firestore();
        db.runTransaction.mockImplementationOnce(async (cb) => {
            const tx = {
                get: jest.fn().mockResolvedValue({
                    exists: true,
                    data: () => ({ status: 'pending', agentId: 'agent_123' }),
                }),
                update: jest.fn(),
            };
            return cb(tx);
        });
        await expect(wrappedUpdateDeliveryStatus({
            data: { orderId: 'order_1', status: 'delivered' },
            auth: { uid: 'agent_123', token: { role: 'delivery_agent' } },
        })).rejects.toThrow('Can only transition to delivered from picked_up');
    });
    it('3. Non-assigned agent calling the function throws PERMISSION_DENIED', async () => {
        const db = admin.firestore();
        db.runTransaction.mockImplementationOnce(async (cb) => {
            const tx = {
                get: jest.fn().mockResolvedValue({
                    exists: true,
                    data: () => ({ status: 'pending', agentId: 'agent_123' }),
                }),
                update: jest.fn(),
            };
            return cb(tx);
        });
        await expect(wrappedUpdateDeliveryStatus({
            data: { orderId: 'order_1', status: 'picked_up' },
            auth: { uid: 'wrong_agent', token: { role: 'delivery_agent' } },
        })).rejects.toThrow('You are not assigned to this delivery');
    });
    it('4. failed_attempt without a reason string throws INVALID_ARGUMENT', async () => {
        const db = admin.firestore();
        db.runTransaction.mockImplementationOnce(async (cb) => {
            const tx = {
                get: jest.fn().mockResolvedValue({
                    exists: true,
                    data: () => ({ status: 'picked_up', agentId: 'agent_123' }),
                }),
                update: jest.fn(),
            };
            return cb(tx);
        });
        await expect(wrappedUpdateDeliveryStatus({
            data: { orderId: 'order_1', status: 'failed_attempt', reason: '   ' },
            auth: { uid: 'agent_123', token: { role: 'delivery_agent' } },
        })).rejects.toThrow('Must provide a non-empty reason');
    });
    it('5. Successful delivered transition creates an agent_payout document', async () => {
        const beforeSnap = testEnv.firestore.makeDocumentSnapshot({ status: 'picked_up', agentId: 'agent_123' }, 'deliveries/order_1');
        const afterSnap = testEnv.firestore.makeDocumentSnapshot({ status: 'delivered', agentId: 'agent_123' }, 'deliveries/order_1');
        const change = testEnv.makeChange(beforeSnap, afterSnap);
        const db = admin.firestore();
        const batchMock = {
            set: jest.fn(),
            update: jest.fn(),
            commit: jest.fn().mockResolvedValue(undefined),
        };
        db.batch.mockReturnValueOnce(batchMock);
        await wrappedPayoutTrigger(change);
        expect(db.batch).toHaveBeenCalled();
        expect(batchMock.set).toHaveBeenCalled();
        expect(batchMock.update).toHaveBeenCalled();
        expect(batchMock.commit).toHaveBeenCalled();
        const payoutRecord = batchMock.set.mock.calls[0][1];
        expect(payoutRecord).toMatchObject({
            agentId: 'agent_123',
            deliveryId: 'order_1',
            amount: 40,
            status: 'pending',
        });
    });
});
//# sourceMappingURL=deliveryTriggers.test.js.map