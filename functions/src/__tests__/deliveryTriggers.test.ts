import * as admin from 'firebase-admin';
import * as functionsTest from 'firebase-functions-test';
import { updateDeliveryStatus } from '../deliveryTriggers';
import { onDeliveryCompletedPayout } from '../payoutTriggers';
import * as notifications from '../utils/notifications';

// Initialize firebase-functions-test in offline mode
const testEnv = functionsTest();

// 1. Setup Mocks
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
  })) as any;

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
  let wrappedUpdateDeliveryStatus: any;
  let wrappedPayoutTrigger: any;

  beforeAll(() => {
    // Wrap the functions
    wrappedUpdateDeliveryStatus = testEnv.wrap(updateDeliveryStatus);
    wrappedPayoutTrigger = testEnv.wrap(onDeliveryCompletedPayout);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  const getMockTransaction = () => {
    const db = admin.firestore();
    let tx: any;
    db.runTransaction = jest.fn((cb) => {
      tx = {
        get: jest.fn(),
        update: jest.fn(),
      };
      return cb(tx);
    }) as any;
    return () => tx;
  };

  it('1. Valid transition pending → picked_up succeeds', async () => {
    const getTx = getMockTransaction();

    // Mock the document snapshot returned by transaction.get()
    const db = admin.firestore();
    (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
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
    (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
      const tx = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ status: 'pending', agentId: 'agent_123' }),
        }),
        update: jest.fn(),
      };
      return cb(tx);
    });

    await expect(
      wrappedUpdateDeliveryStatus({
        data: { orderId: 'order_1', status: 'delivered' },
        auth: { uid: 'agent_123', token: { role: 'delivery_agent' } },
      })
    ).rejects.toThrow('Can only transition to delivered from picked_up');
  });

  it('3. Non-assigned agent calling the function throws PERMISSION_DENIED', async () => {
    const db = admin.firestore();
    (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
      const tx = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ status: 'pending', agentId: 'agent_123' }), // assigned to agent_123
        }),
        update: jest.fn(),
      };
      return cb(tx);
    });

    await expect(
      wrappedUpdateDeliveryStatus({
        data: { orderId: 'order_1', status: 'picked_up' },
        auth: { uid: 'wrong_agent', token: { role: 'delivery_agent' } }, // called by wrong_agent
      })
    ).rejects.toThrow('You are not assigned to this delivery');
  });

  it('4. failed_attempt without a reason string throws INVALID_ARGUMENT', async () => {
    const db = admin.firestore();
    (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
      const tx = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ status: 'picked_up', agentId: 'agent_123' }),
        }),
        update: jest.fn(),
      };
      return cb(tx);
    });

    await expect(
      wrappedUpdateDeliveryStatus({
        data: { orderId: 'order_1', status: 'failed_attempt', reason: '   ' }, // empty reason
        auth: { uid: 'agent_123', token: { role: 'delivery_agent' } },
      })
    ).rejects.toThrow('Must provide a non-empty reason');
  });

  it('5. Successful delivered transition creates an agent_payout document', async () => {
    // This tests the payoutTrigger (onDeliveryCompletedPayout) which runs after the delivery status is updated to delivered.
    
    // Simulate the Firestore change event
    const beforeSnap = testEnv.firestore.makeDocumentSnapshot(
      { status: 'picked_up', agentId: 'agent_123' },
      'deliveries/order_1'
    );
    const afterSnap = testEnv.firestore.makeDocumentSnapshot(
      { status: 'delivered', agentId: 'agent_123' },
      'deliveries/order_1'
    );

    const change = testEnv.makeChange(beforeSnap, afterSnap);

    // Get the batch mock to assert it was used correctly
    const db = admin.firestore();
    const batchMock = {
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    (db.batch as jest.Mock).mockReturnValueOnce(batchMock);

    // Call the wrapped payout trigger
    await wrappedPayoutTrigger(change);

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
});
