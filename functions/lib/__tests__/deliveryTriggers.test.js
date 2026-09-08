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
const functionsTest = require('firebase-functions-test');
const deliveryTriggers_1 = require("../deliveryTriggers");
const payoutTriggers_1 = require("../payoutTriggers");
const events = __importStar(require("../utils/events"));
let testEnv;
// 1. Setup Mocks
jest.mock('firebase-admin', () => {
    const mockTransaction = {
        get: jest.fn(),
        update: jest.fn(),
        set: jest.fn(),
    };
    const mockDoc = {
        get: jest.fn(),
        update: jest.fn(),
        set: jest.fn(),
    };
    const mockCollection = {
        doc: jest.fn(() => mockDoc),
        where: jest.fn(() => mockCollection),
        limit: jest.fn(() => mockCollection),
        get: jest.fn(() => Promise.resolve({ docs: [], empty: true })),
        add: jest.fn(() => Promise.resolve({ id: 'mock_doc_id' })),
    };
    const mockBatch = {
        set: jest.fn(),
        update: jest.fn(),
        commit: jest.fn(() => Promise.resolve()),
    };
    const mockFirestoreInstance = {
        collection: jest.fn(() => mockCollection),
        runTransaction: jest.fn((cb) => cb(mockTransaction)),
        batch: jest.fn(() => mockBatch),
    };
    const firestore = jest.fn(() => mockFirestoreInstance);
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
jest.mock('../utils/events', () => ({
    publishEvent: jest.fn().mockResolvedValue(undefined),
}));
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
        testEnv = functionsTest();
        // Wrap the functions
        wrappedUpdateDeliveryStatus = testEnv.wrap(deliveryTriggers_1.updateDeliveryStatus);
        wrappedPayoutTrigger = payoutTriggers_1.onDeliveryCompletedPayout.run;
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
        // Mock the document snapshot returned by transaction.get()
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
        expect(events.publishEvent).toHaveBeenCalled();
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
                    data: () => ({ status: 'pending', agentId: 'agent_123' }), // assigned to agent_123
                }),
                update: jest.fn(),
            };
            return cb(tx);
        });
        await expect(wrappedUpdateDeliveryStatus({
            data: { orderId: 'order_1', status: 'picked_up' },
            auth: { uid: 'wrong_agent', token: { role: 'delivery_agent' } }, // called by wrong_agent
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
            data: { orderId: 'order_1', status: 'failed_attempt', reason: '   ' }, // empty reason
            auth: { uid: 'agent_123', token: { role: 'delivery_agent' } },
        })).rejects.toThrow('Must provide a non-empty reason');
    });
    it('5. Successful delivered transition creates an agent_payout document', async () => {
        // This tests the payoutTrigger (onDeliveryCompletedPayout) which runs after the delivery status is updated to delivered.
        // Simulate the Firestore change event
        const beforeSnap = {
            data: () => ({ status: 'picked_up', agentId: 'agent_123' }),
        };
        const afterSnap = {
            data: () => ({ status: 'delivered', agentId: 'agent_123' }),
        };
        const event = {
            data: {
                before: beforeSnap,
                after: afterSnap,
            },
            params: {
                orderId: 'order_1',
            },
        };
        // Get the batch mock to assert it was used correctly
        const db = admin.firestore();
        const batchMock = {
            set: jest.fn(),
            update: jest.fn(),
            commit: jest.fn().mockResolvedValue(undefined),
        };
        db.batch.mockReturnValueOnce(batchMock);
        // Call the wrapped payout trigger
        await wrappedPayoutTrigger(event);
        // Verify batch was created and committed
        expect(db.batch).toHaveBeenCalled();
        expect(batchMock.set).toHaveBeenCalled(); // Payout doc creation
        expect(batchMock.update).toHaveBeenCalled(); // User earnings increment
        expect(batchMock.commit).toHaveBeenCalled();
        // Verify the payout arguments
        const payoutRecord = batchMock.set.mock.calls[0][1];
        expect(payoutRecord).toMatchObject({
            agentId: 'agent_123',
            deliveryId: 'order_1',
            amount: 40, // ₹40 fixed payout
            status: 'pending',
        });
    });
    it('6. verifyDeliveryOTP returns success: false and warning when invalid OTP is provided', async () => {
        const db = admin.firestore();
        const mockOrderData = {
            rider_id: 'rider_99',
            status: 'out_for_delivery',
            otp: '1234',
        };
        db.runTransaction.mockImplementationOnce(async (cb) => {
            const tx = {
                get: jest.fn().mockResolvedValue({
                    exists: true,
                    data: () => mockOrderData,
                }),
                update: jest.fn(),
                set: jest.fn(),
            };
            return cb(tx);
        });
        const result = await deliveryTriggers_1.verifyDeliveryOTP.run({
            data: { orderId: 'order_test_otp', otp: '9999' }, // Wrong OTP
            auth: { uid: 'rider_99', token: { role: 'delivery_agent' } },
        });
        expect(result.success).toBe(false);
        expect(result.message).toContain('Invalid OTP');
    });
    it('7. verifyDeliveryOTP returns success: true and transitions order when valid OTP is provided', async () => {
        const db = admin.firestore();
        const mockOrderData = {
            rider_id: 'rider_99',
            status: 'out_for_delivery',
            otp: '5678',
        };
        let updatedFields = null;
        db.runTransaction.mockImplementationOnce(async (cb) => {
            const tx = {
                get: jest.fn().mockResolvedValue({
                    exists: true,
                    data: () => mockOrderData,
                }),
                update: jest.fn((ref, data) => {
                    updatedFields = data;
                }),
                set: jest.fn(),
            };
            return cb(tx);
        });
        const result = await deliveryTriggers_1.verifyDeliveryOTP.run({
            data: { orderId: 'order_test_otp', otp: '5678' }, // Correct OTP
            auth: { uid: 'rider_99', token: { role: 'delivery_agent' } },
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain('OTP verified successfully');
        expect(updatedFields).toMatchObject({
            status: 'delivered',
            otpVerified: true,
        });
    });
    it('8. onOrderCompletedPayout triggers payout on canonical orders collection', async () => {
        const beforeSnap = {
            data: () => ({ status: 'out_for_delivery', rider_id: 'rider_canonical_1' }),
        };
        const afterSnap = {
            data: () => ({ status: 'delivered', rider_id: 'rider_canonical_1' }),
        };
        const event = {
            data: {
                before: beforeSnap,
                after: afterSnap,
            },
            params: {
                orderId: 'order_canon_123',
            },
        };
        const db = admin.firestore();
        const batchMock = {
            set: jest.fn(),
            update: jest.fn(),
            commit: jest.fn().mockResolvedValue(undefined),
        };
        db.batch.mockReturnValueOnce(batchMock);
        await payoutTriggers_1.onOrderCompletedPayout.run(event);
        expect(db.batch).toHaveBeenCalled();
        expect(batchMock.set).toHaveBeenCalled();
        expect(batchMock.update).toHaveBeenCalled();
        expect(batchMock.commit).toHaveBeenCalled();
        const payoutRecord = batchMock.set.mock.calls[0][1];
        expect(payoutRecord).toMatchObject({
            agentId: 'rider_canonical_1',
            deliveryId: 'order_canon_123',
            amount: 40,
            status: 'pending',
        });
    });
});
