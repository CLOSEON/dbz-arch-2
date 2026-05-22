import { subscribeToAgentDeliveries } from '../delivery';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { setDoc, doc, disableNetwork, enableNetwork } from 'firebase/firestore';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;
let testDb: any;

// Mock the global db instance to use the emulator db
jest.mock('@/lib/firebase', () => ({
  get db() {
    return testDb;
  }
}));

describe('Delivery Queries - subscribeToAgentDeliveries', () => {
  beforeAll(async () => {
    // Setup Firebase Emulator Suite
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-dabzo-test',
      firestore: {
        host: 'localhost',
        port: 8080,
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    
    // Create an authenticated context for the delivery agent
    const context = testEnv.authenticatedContext('agent_123', { role: 'delivery_agent' });
    testDb = context.firestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should return only non-completed deliveries for the correct agent', (done) => {
    const setupData = async () => {
      // 1. Correct Agent - Pending (Should be included)
      await setDoc(doc(testDb, 'deliveries', 'order1'), {
        agentId: 'agent_123',
        status: 'pending',
        createdAt: 100,
      });

      // 2. Correct Agent - Picked Up (Should be included)
      await setDoc(doc(testDb, 'deliveries', 'order2'), {
        agentId: 'agent_123',
        status: 'picked_up',
        createdAt: 200,
      });

      // 3. Correct Agent - Delivered (Should be excluded)
      await setDoc(doc(testDb, 'deliveries', 'order3'), {
        agentId: 'agent_123',
        status: 'delivered',
        createdAt: 300,
      });

      // 4. Correct Agent - Failed Attempt (Should be excluded)
      await setDoc(doc(testDb, 'deliveries', 'order4'), {
        agentId: 'agent_123',
        status: 'failed_attempt',
        createdAt: 400,
      });

      // 5. Wrong Agent - Pending (Should be excluded)
      await setDoc(doc(testDb, 'deliveries', 'order5'), {
        agentId: 'agent_456',
        status: 'pending',
        createdAt: 500,
      });
    };

    setupData().then(() => {
      const unsubscribe = subscribeToAgentDeliveries('agent_123', (orders, fromCache) => {
        // We might get partial updates, wait for both valid orders
        if (orders.length === 2) {
          const orderIds = orders.map(o => o.id).sort();
          expect(orderIds).toEqual(['order1', 'order2']);
          expect(orders[0].status).not.toBe('delivered');
          expect(orders[1].status).not.toBe('failed_attempt');
          unsubscribe();
          done();
        }
      });
    });
  });

  it('should return cached data when offline', (done) => {
    const setupData = async () => {
      await setDoc(doc(testDb, 'deliveries', 'cacheOrder1'), {
        agentId: 'agent_123',
        status: 'pending',
        createdAt: 100,
      });
    };

    setupData().then(async () => {
      // First let it load normally to populate cache
      let initialLoad = true;
      let unsubscribe: () => void;

      unsubscribe = subscribeToAgentDeliveries('agent_123', async (orders, fromCache) => {
        if (initialLoad && orders.length === 1 && !fromCache) {
          initialLoad = false;
          unsubscribe();

          // Disable network to force cache reading
          await disableNetwork(testDb);

          // Re-subscribe while offline
          const offlineUnsubscribe = subscribeToAgentDeliveries('agent_123', (offlineOrders, isOfflineCache) => {
            if (offlineOrders.length === 1) {
              expect(offlineOrders[0].id).toBe('cacheOrder1');
              expect(isOfflineCache).toBe(true);
              
              offlineUnsubscribe();
              enableNetwork(testDb).then(() => done());
            }
          });
        }
      });
    });
  });

  it('should correctly unsubscribe from real-time updates on cleanup', (done) => {
    let callCount = 0;

    const setupData = async () => {
      await setDoc(doc(testDb, 'deliveries', 'unsubscribeOrder1'), {
        agentId: 'agent_123',
        status: 'pending',
        createdAt: 100,
      });
    };

    setupData().then(() => {
      const unsubscribe = subscribeToAgentDeliveries('agent_123', async (orders) => {
        callCount++;

        if (callCount === 1) {
          expect(orders.length).toBe(1);
          
          // Trigger unsubscribe
          unsubscribe();

          // Add a new document that would normally trigger the listener
          await setDoc(doc(testDb, 'deliveries', 'unsubscribeOrder2'), {
            agentId: 'agent_123',
            status: 'picked_up',
            createdAt: 200,
          });

          // Wait a bit to ensure listener wasn't called again
          setTimeout(() => {
            expect(callCount).toBe(1); // Should still be 1
            done();
          }, 1000);
        }
      });
    });
  });
});
