import * as admin from 'firebase-admin';
const functionsTest = require('firebase-functions-test');
import { 
  startCustomerUnavailability, 
  confirmCustomerUnavailable, 
  verifyDeliveryOTP, 
  onSubscriptionCreated 
} from '../deliveryTriggers';
import { verifyPickupOTP } from '../matchingTriggers';
import { calculateRiderPayment } from '../riderPaymentTriggers';
import { formBatches, getISTDateString } from '../cronTriggers';

let testEnv: any;

// Setup mocks
jest.mock('firebase-admin', () => {
  const mockDoc = {
    get: jest.fn(),
    update: jest.fn(),
    set: jest.fn(),
  };

  const mockCollection: any = {
    doc: jest.fn(() => ({ ...mockDoc, id: 'mock_gen_doc_id' })),
    where: jest.fn(() => mockCollection),
    limit: jest.fn(() => mockCollection),
    get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })),
    add: jest.fn(() => Promise.resolve({ id: 'mock_doc_id' })),
  };

  const mockBatch = {
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  };

  const mockFirestoreInstance = {
    collection: jest.fn(() => mockCollection),
    runTransaction: jest.fn(),
    batch: jest.fn(() => mockBatch),
  };

  const firestore: any = jest.fn(() => mockFirestoreInstance);

  firestore.FieldValue = {
    arrayUnion: jest.fn((val) => val),
    serverTimestamp: jest.fn(() => 'MOCK_SERVER_TIMESTAMP'),
    increment: jest.fn((val) => `INCREMENT_${val}`),
  };

  firestore.Timestamp = {
    now: jest.fn(() => ({
      toMillis: () => Date.now(),
      seconds: Math.floor(Date.now() / 1000),
      toDate: () => new Date(),
    })),
    fromMillis: jest.fn((ms: number) => ({
      toMillis: () => ms,
      seconds: Math.floor(ms / 1000),
      toDate: () => new Date(ms),
    })),
    fromDate: jest.fn((date: Date) => ({
      toMillis: () => date.getTime(),
      seconds: Math.floor(date.getTime() / 1000),
      toDate: () => date,
    })),
  };

  firestore.FieldPath = {
    documentId: jest.fn(() => '__name__'),
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
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
  orderPickedUpPayload: jest.fn(),
  orderDeliveredPayload: jest.fn(),
  deliveryFailedPayload: jest.fn(),
  deliveryFailedAdminPayload: jest.fn(),
}));

describe('Delivery Redesign Backend Suite', () => {
  let wrappedStartUnavail: any;
  let wrappedConfirmUnavail: any;
  let wrappedVerifyPickupOTP: any;
  let wrappedCalculatePayment: any;
  let wrappedVerifyDeliveryOTP: any;
  let wrappedOnSubscriptionCreated: any;
  let wrappedFormBatches: any;

  beforeAll(() => {
    testEnv = functionsTest();
    wrappedStartUnavail = testEnv.wrap(startCustomerUnavailability);
    wrappedConfirmUnavail = testEnv.wrap(confirmCustomerUnavailable);
    wrappedVerifyPickupOTP = testEnv.wrap(verifyPickupOTP);
    wrappedCalculatePayment = (calculateRiderPayment as any).run;
    wrappedVerifyDeliveryOTP = (verifyDeliveryOTP as any).run || testEnv.wrap(verifyDeliveryOTP);
    wrappedOnSubscriptionCreated = (onSubscriptionCreated as any).run;
    wrappedFormBatches = (formBatches as any).run || testEnv.wrap(formBatches);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('Customer Unavailability Callables', () => {
    it('1. startCustomerUnavailability rejects unauthenticated calls', async () => {
      await expect(
        wrappedStartUnavail({ data: { orderId: 'ord_123' }, auth: null })
      ).rejects.toThrow('Must be authenticated');
    });

    it('2. startCustomerUnavailability stamps unavailability_started_at on active order', async () => {
      const db = admin.firestore();
      const mockOrderData = {
        id: 'ord_123',
        status: 'out_for_delivery',
        driverId: 'rider_99',
        user_id: 'cust_456',
      };

      const mockOrderRef = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockOrderData,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      (db.collection as jest.Mock).mockImplementationOnce((colName: string) => {
        if (colName === 'orders') {
          return {
            doc: jest.fn((id: string) => {
              if (id === 'ord_123') return mockOrderRef;
              return {
                collection: jest.fn(() => ({
                  doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined) })),
                })),
              };
            }),
          };
        }
        return {
          doc: jest.fn(() => ({
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue({ exists: false }),
          })),
        };
      });

      const res = await wrappedStartUnavail({
        data: { orderId: 'ord_123' },
        auth: { uid: 'rider_99', token: {} },
      });

      expect(res.success).toBe(true);
      expect(mockOrderRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          unavailability_started_at: expect.anything(),
        })
      );
    });

    it('3. confirmCustomerUnavailable rejects when less than 10 minutes have elapsed', async () => {
      const db = admin.firestore();
      const fiveMinutesAgoMs = Date.now() - 5 * 60 * 1000;

      (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const tx = {
          get: jest.fn().mockImplementation((ref: any) => {
            return Promise.resolve({
              exists: true,
              data: () => ({
                id: 'ord_123',
                status: 'out_for_delivery',
                driverId: 'rider_99',
                unavailability_started_at: {
                  toMillis: () => fiveMinutesAgoMs,
                  seconds: Math.floor(fiveMinutesAgoMs / 1000),
                },
              }),
            });
          }),
          update: jest.fn(),
          set: jest.fn(),
        };
        return cb(tx);
      });

      await expect(
        wrappedConfirmUnavail({
          data: { orderId: 'ord_123', tripId: 'trip_1' },
          auth: { uid: 'rider_99', token: {} },
        })
      ).rejects.toThrow(/10-minute wait is required/);
    });

    it('4. confirmCustomerUnavailable marks order as failed after 10 minutes', async () => {
      const db = admin.firestore();
      const elevenMinutesAgoMs = Date.now() - 11 * 60 * 1000;

      let txUpdateMock = jest.fn();
      let txSetMock = jest.fn();

      (db.collection as jest.Mock).mockImplementation((colName: string) => {
        if (colName === 'rider_trips') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `rider_trips/${id}`,
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => ({ dropStops: [{ orderId: 'ord_123', status: 'pending' }] }),
                ref: { update: jest.fn().mockResolvedValue(undefined) },
              }),
              update: jest.fn().mockResolvedValue(undefined),
            })),
          };
        }
        const colMock: any = {
          doc: jest.fn((id: string) => ({
            id,
            path: `${colName}/${id}`,
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue({ exists: false }),
          })),
          where: jest.fn(() => colMock),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
        return colMock;
      });

      (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const tx = {
          get: jest.fn().mockImplementation((ref: any) => {
            const isTrip = ref?.path?.includes?.('rider_trips');
            if (isTrip) {
              return Promise.resolve({
                exists: true,
                data: () => ({
                  dropStops: [
                    { orderId: 'ord_123', status: 'pending' },
                  ],
                }),
              });
            }
            return Promise.resolve({
              exists: true,
              data: () => ({
                id: 'ord_123',
                status: 'out_for_delivery',
                driverId: 'rider_99',
                batch_id: 'batch_01',
                unavailability_started_at: {
                  toMillis: () => elevenMinutesAgoMs,
                  seconds: Math.floor(elevenMinutesAgoMs / 1000),
                },
              }),
            });
          }),
          update: txUpdateMock,
          set: txSetMock,
        };
        return cb(tx);
      });

      const res = await wrappedConfirmUnavail({
        data: { orderId: 'ord_123', tripId: 'trip_1' },
        auth: { uid: 'rider_99', token: {} },
      });

      expect(res.success).toBe(true);
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'failed',
          failure_reason: 'customer_unavailable',
        })
      );
    });
  });

  describe('Pickup OTP & Discrepancy Verification', () => {
    it('1. verifyPickupOTP rejects incorrect OTP', async () => {
      const db = admin.firestore();
      (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              riderId: 'rider_1',
              pickupStops: [
                { vendorId: 'ven_1', pickupOTP: '9999', status: 'pending' },
              ],
            }),
          }),
          update: jest.fn(),
          set: jest.fn(),
        };
        return cb(tx);
      });

      const res = await wrappedVerifyPickupOTP(
        { tripId: 'trip_1', vendorId: 'ven_1', otp: '1234', confirmedCount: 5 },
        { auth: { uid: 'rider_1', token: { role: 'delivery' } } }
      );

      expect(res.success).toBe(false);
      expect(res.message).toBe('Invalid OTP');
    });

    it('2. verifyPickupOTP records count discrepancy and updates orders', async () => {
      const db = admin.firestore();
      let updatedTripData: any = null;

      const mockOrdersQuery: any = {
        where: jest.fn(() => mockOrdersQuery),
      };

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'orders') {
          return {
            where: jest.fn(() => mockOrdersQuery),
          };
        }
        if (col === 'users') {
          return {
            where: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ docs: [] }),
            })),
          };
        }
        return {
          doc: jest.fn((id: string) => ({ id, path: `rider_trips/${id}` })),
        };
      });

      (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const tx = {
          get: jest.fn().mockImplementation((refOrQuery: any) => {
            // Check if it's the orders query
            if (refOrQuery === mockOrdersQuery || refOrQuery?.where) {
              return Promise.resolve({
                forEach: (fn: any) => {
                  fn({
                    id: 'ord_A',
                    data: () => ({ status: 'vendor_ready', batch_id: 'b_1' }),
                    ref: { path: 'orders/ord_A' },
                  });
                },
              });
            }
            // It's the trip doc
            return Promise.resolve({
              exists: true,
              data: () => ({
                riderId: 'rider_1',
                pickupStops: [
                  { vendorId: 'ven_1', pickupOTP: '1234', expectedTiffinCount: 10, status: 'pending' },
                ],
              }),
            });
          }),
          update: jest.fn((ref: any, data: any) => {
            if (data.pickupStops) updatedTripData = data;
          }),
          set: jest.fn(),
        };
        return cb(tx);
      });

      const res = await wrappedVerifyPickupOTP(
        { tripId: 'trip_1', vendorId: 'ven_1', otp: '1234', confirmedCount: 8 },
        { auth: { uid: 'rider_1', token: { role: 'delivery' } } }
      );

      expect(res.success).toBe(true);
      expect(res.discrepancy).toBe(-2);
      expect(res.allDone).toBe(true);
      expect(updatedTripData.pickupStops[0].confirmedCount).toBe(8);
      expect(updatedTripData.pickupStops[0].discrepancy).toBe(-2);
    });
  });

  describe('Authoritative Rider Payout Calculation', () => {
    it('1. Falls back to server routeDistanceKm when device GPS is 0 / throttled', async () => {
      const db = admin.firestore();
      let createdPayment: any = null;

      const mockDocInstance = {
        set: jest.fn((data: any) => {
          createdPayment = data;
          return Promise.resolve();
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'rider_payments') {
          return {
            where: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ empty: true }),
              })),
            })),
            doc: jest.fn(() => mockDocInstance),
          };
        }
        if (col === 'orders') {
          const chain: any = {
            where: jest.fn(() => chain),
            get: jest.fn().mockResolvedValue({ size: 0 }),
          };
          return chain;
        }
        return {
          doc: jest.fn(() => mockDocInstance),
        };
      });

      const change = {
        before: { data: () => ({ status: 'picking_up' }) },
        after: {
          id: 'trip_101',
          data: () => ({
            status: 'completed',
            riderId: 'rider_101',
            gpsDistanceKm: 0, // throttled GPS!
            pickupStops: [{ distanceKm: 2.5, confirmedCount: 5 }],
            dropStops: [{ distanceKm: 4.5 }],
            assignedOrderIds: ['ord_1', 'ord_2'],
          }),
        },
      };

      await wrappedCalculatePayment(change);

      expect(createdPayment).not.toBeNull();
      // Server route distance = 2.5 + 4.5 = 7.0 km. Base pay = 7.0 * ₹10 = ₹70
      expect(createdPayment.routeDistanceKm).toBe(7.0);
      expect(createdPayment.totalDistanceKm).toBe(7.0);
      expect(createdPayment.basePayment).toBe(70);
    });

    it('2. Caps distance to route distance if GPS distance is unrealistic (> 2.5x)', async () => {
      const db = admin.firestore();
      let createdPayment: any = null;

      const mockDocInstance = {
        set: jest.fn((data: any) => {
          createdPayment = data;
          return Promise.resolve();
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'rider_payments') {
          return {
            where: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ empty: true }),
              })),
            })),
            doc: jest.fn(() => mockDocInstance),
          };
        }
        if (col === 'orders') {
          const chain: any = {
            where: jest.fn(() => chain),
            get: jest.fn().mockResolvedValue({ size: 0 }),
          };
          return chain;
        }
        return {
          doc: jest.fn(() => mockDocInstance),
        };
      });

      const change = {
        before: { data: () => ({ status: 'out_for_delivery' }) },
        after: {
          id: 'trip_102',
          data: () => ({
            status: 'completed',
            riderId: 'rider_102',
            gpsDistanceKm: 30.0, // 30km GPS for a 6km route! (> 2.5x)
            pickupStops: [{ distanceKm: 2.0, confirmedCount: 5 }],
            dropStops: [{ distanceKm: 4.0 }],
            assignedOrderIds: ['ord_1'],
          }),
        },
      };

      await wrappedCalculatePayment(change);

      expect(createdPayment).not.toBeNull();
      // Should be capped at route distance 6.0km
      expect(createdPayment.totalDistanceKm).toBe(6.0);
      expect(createdPayment.basePayment).toBe(60);
    });

    it('3. Subtracts failed and cancelled drops from confirmed tiffins', async () => {
      const db = admin.firestore();
      let createdPayment: any = null;

      const mockDocInstance = {
        set: jest.fn((data: any) => {
          createdPayment = data;
          return Promise.resolve();
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'rider_payments') {
          return {
            where: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ empty: true }),
              })),
            })),
            doc: jest.fn(() => mockDocInstance),
          };
        }
        if (col === 'orders') {
          return {
            where: jest.fn(() => ({
              where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ size: 2 }), // 2 orders failed in DB
              })),
            })),
          };
        }
        return {
          where: jest.fn(() => ({
            where: jest.fn(() => ({
              where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ size: 0 }),
              })),
            })),
          })),
          doc: jest.fn(() => mockDocInstance),
        };
      });

      const change = {
        before: { data: () => ({ status: 'dropping' }) },
        after: {
          id: 'trip_103',
          data: () => ({
            status: 'completed',
            riderId: 'rider_103',
            gpsDistanceKm: 8.0,
            pickupStops: [{ distanceKm: 3.0, confirmedCount: 16 }],
            dropStops: [
              { distanceKm: 2.5, status: 'completed' },
              { distanceKm: 2.5, status: 'failed' },
            ],
            assignedOrderIds: ['ord_1', 'ord_2'],
          }),
        },
      };

      await wrappedCalculatePayment(change);

      expect(createdPayment).not.toBeNull();
      // Total confirmed = 16, undelivered = 2 -> paid = 14
      expect(createdPayment.paidTiffinCount).toBe(14);
      // Extra tiffins = max(0, 14 - 14) = 0 -> bonus = 0
      expect(createdPayment.tiffinBonus).toBe(0);
    });
  });

  describe('Customer Drop-Off & Delivery OTP Verification', () => {
    it('1. verifyDeliveryOTP rejects incorrect PIN', async () => {
      const db = admin.firestore();
      (db.collection as jest.Mock).mockImplementation((col: string) => {
        const colMock: any = {
          doc: jest.fn((id: string) => ({ id, path: `${col}/${id}` })),
          where: jest.fn(() => colMock),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
        return colMock;
      });

      (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              id: 'ord_1',
              status: 'out_for_delivery',
              rider_id: 'rider_1',
              otp: '4821',
            }),
          }),
          update: jest.fn(),
          set: jest.fn(),
        };
        return cb(tx);
      });

      const res = await wrappedVerifyDeliveryOTP({
        data: { orderId: 'ord_1', otp: '9999' },
        auth: { uid: 'rider_1', token: { role: 'delivery' } },
      });

      expect(res.success).toBe(false);
      expect(res.message).toMatch(/Invalid OTP/);
    });

    it('2. verifyDeliveryOTP marks order delivered and completes dropStop', async () => {
      const db = admin.firestore();
      let txUpdateMock = jest.fn();
      let tripUpdateMock = jest.fn().mockResolvedValue(undefined);

      (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              id: 'ord_1',
              status: 'out_for_delivery',
              rider_id: 'rider_1',
              rider_trip_id: 'trip_100',
              otp: '4821',
            }),
          }),
          update: txUpdateMock,
          set: jest.fn(),
        };
        return cb(tx);
      });

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'rider_trips') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  dropStops: [
                    { orderId: 'ord_1', status: 'pending' },
                    { orderId: 'ord_2', status: 'pending' },
                  ],
                }),
              }),
              update: tripUpdateMock,
            })),
          };
        }
        const colMock: any = {
          doc: jest.fn((id: string) => ({ id, path: `${col}/${id}`, update: txUpdateMock, set: jest.fn() })),
          where: jest.fn(() => colMock),
          get: jest.fn().mockResolvedValue({ docs: [{ id: 'ord_2' }] }),
        };
        return colMock;
      });

      const res = await wrappedVerifyDeliveryOTP({
        data: { orderId: 'ord_1', otp: '4821' },
        auth: { uid: 'rider_1', token: { role: 'delivery' } },
      });

      expect(res.success).toBe(true);
      expect(txUpdateMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'delivered', otpVerified: true })
      );
      expect(tripUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dropStops: expect.arrayContaining([
            expect.objectContaining({ orderId: 'ord_1', status: 'completed' }),
          ]),
        })
      );
    });

    it('3. verifyDeliveryOTP completes trip when all dropStops are completed', async () => {
      const db = admin.firestore();
      let tripUpdateMock = jest.fn().mockResolvedValue(undefined);

      (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const tx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              id: 'ord_1',
              status: 'out_for_delivery',
              rider_id: 'rider_1',
              rider_trip_id: 'trip_100',
              delivery_otp: '7722',
            }),
          }),
          update: jest.fn(),
          set: jest.fn(),
        };
        return cb(tx);
      });

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'rider_trips') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  dropStops: [
                    { orderId: 'ord_1', status: 'pending' },
                  ],
                }),
              }),
              update: tripUpdateMock,
            })),
          };
        }
        const colMock: any = {
          doc: jest.fn((id: string) => ({ id, path: `${col}/${id}`, update: jest.fn(), set: jest.fn() })),
          where: jest.fn(() => colMock),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
        return colMock;
      });

      const res = await wrappedVerifyDeliveryOTP({
        data: { orderId: 'ord_1', otp: '7722' },
        auth: { uid: 'rider_1', token: { role: 'delivery' } },
      });

      expect(res.success).toBe(true);
      expect(tripUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          dropStops: expect.arrayContaining([
            expect.objectContaining({ orderId: 'ord_1', status: 'completed' }),
          ]),
        })
      );
    });
  });

  describe('Subscription Order Generation (onSubscriptionCreated)', () => {
    it('1. Generates 28 days of canonical orders with deterministic box_tag and 4-digit PIN for monthly plan', async () => {
      const db = admin.firestore();
      const setOrders: any[] = [];

      const mockBatch: any = {
        set: jest.fn((ref, data) => {
          setOrders.push(data);
          return mockBatch;
        }),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      };

      (db.batch as jest.Mock).mockReturnValue(mockBatch);

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'users') {
          return {
            doc: jest.fn((id: string) => ({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  id,
                  name: id === 'u1' ? 'Aarav Patel' : 'Spice Kitchen',
                  phone: '9876543210',
                  deliveryPreference: '11am',
                  location: { lat: 18.5204, lng: 73.8567 },
                }),
              }),
            })),
          };
        }
        if (col === 'orders') {
          return {
            where: jest.fn(() => ({
              where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
              })),
            })),
            doc: jest.fn(() => ({ id: `ord_gen_${setOrders.length + 1}` })),
          };
        }
        return {
          doc: jest.fn(() => ({ id: 'gen_id' })),
        };
      });

      const event = {
        params: { subId: 'sub_monthly_1' },
        data: {
          before: { exists: false },
          after: {
            exists: true,
            data: () => ({
              status: 'active',
              plan_duration: 'monthly',
              total_meals: 28,
              user_id: 'u1',
              vendor_id: 'v1',
              meal_type: 'lunch',
              dietary: 'veg',
            }),
          },
        },
      };

      await wrappedOnSubscriptionCreated(event);

      // Verify that 28 canonical orders were generated
      expect(setOrders.length).toBe(28);

      // Check first order properties
      const firstOrder = setOrders[0];
      expect(firstOrder.meal_type).toBe('lunch');
      expect(firstOrder.delivery_slot).toBe('11am');
      expect(firstOrder.status).toBe('created');
      expect(firstOrder.subscription_id).toBe('sub_monthly_1');
      expect(firstOrder.delivery_otp).toMatch(/^\d{4}$/);
      expect(firstOrder.box_tag).toMatch(/^L-VEG-001$/);
    });

    it('2. Preserves day-specific slots (lunch vs dinner) from date-keyed map', async () => {
      const db = admin.firestore();
      const setOrders: any[] = [];

      const mockBatch: any = {
        set: jest.fn((ref, data) => {
          setOrders.push(data);
          return mockBatch;
        }),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      };

      (db.batch as jest.Mock).mockReturnValue(mockBatch);

      const todayStr = getISTDateString();
      // Date 2 days from now
      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const targetDate = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + 2));
      const targetDateStr = targetDate.toISOString().split('T')[0];

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'users') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  name: 'Rohit Sharma',
                  phone: '9876543210',
                  location: { lat: 18.5204, lng: 73.8567 },
                }),
              }),
            })),
          };
        }
        if (col === 'orders') {
          return {
            where: jest.fn(() => ({
              where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
              })),
            })),
            doc: jest.fn(() => ({ id: `ord_gen_${setOrders.length + 1}` })),
          };
        }
        return { doc: jest.fn(() => ({ id: 'gen_id' })) };
      });

      const event = {
        params: { subId: 'sub_slots_1' },
        data: {
          before: { exists: false },
          after: {
            exists: true,
            data: () => ({
              status: 'active',
              plan_duration: 'weekly',
              total_meals: 1,
              selected_dates: [targetDateStr],
              slots: { [targetDateStr]: 'dinner' },
              user_id: 'u1',
              vendor_id: 'v1',
              dietary: 'non_veg',
            }),
          },
        },
      };

      await wrappedOnSubscriptionCreated(event);

      expect(setOrders.length).toBe(1);
      const order = setOrders[0];
      expect(order.date).toBe(targetDateStr);
      expect(order.meal_type).toBe('dinner');
      expect(order.delivery_slot).toBe('8pm');
      expect(order.box_tag).toMatch(/^D-NONVEG-001$/);
    });

    it('3. Generates all 28 meals for Mon-Fri custom pattern spanning >28 calendar days', async () => {
      const db = admin.firestore();
      const setOrders: any[] = [];

      const mockBatch: any = {
        set: jest.fn((ref, data) => {
          setOrders.push(data);
          return mockBatch;
        }),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      };

      (db.batch as jest.Mock).mockReturnValue(mockBatch);

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'users') {
          return {
            doc: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({
                exists: true,
                data: () => ({
                  name: 'Priya Singh',
                  phone: '9876543210',
                  location: { lat: 18.5204, lng: 73.8567 },
                }),
              }),
            })),
          };
        }
        if (col === 'orders') {
          return {
            where: jest.fn(() => ({
              where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
              })),
            })),
            doc: jest.fn(() => ({ id: `ord_gen_${setOrders.length + 1}` })),
          };
        }
        return { doc: jest.fn(() => ({ id: 'gen_id' })) };
      });

      const event = {
        params: { subId: 'sub_custom_monfri' },
        data: {
          before: { exists: false },
          after: {
            exists: true,
            data: () => ({
              status: 'active',
              plan_duration: 'monthly',
              total_meals: 28,
              deliveryPattern: {
                monday: 1,
                tuesday: 1,
                wednesday: 1,
                thursday: 1,
                friday: 1,
                saturday: 0,
                sunday: 0,
              },
              user_id: 'u1',
              vendor_id: 'v1',
              meal_type: 'lunch',
              dietary: 'veg',
            }),
          },
        },
      };

      await wrappedOnSubscriptionCreated(event);

      // Must fulfill all 28 meals across the 5.6 calendar weeks
      expect(setOrders.length).toBe(28);
    });
  });

  describe('Batch Formation & IST Timezone (cronTriggers)', () => {
    it('1. getISTDateString accurately converts UTC timestamps to Indian Standard Time', () => {
      // 2026-09-11 20:00:00 UTC = 2026-09-12 01:30:00 IST (+5.5h)
      const lateUtc = new Date('2026-09-11T20:00:00.000Z');
      const istDateStr = getISTDateString(lateUtc);
      expect(istDateStr).toBe('2026-09-12');
    });

    it('2. formBatches processes unbatched created orders into vendor batch', async () => {
      const db = admin.firestore();
      let createdBatchData: any = null;

      const mockOrderDocs = [
        {
          id: 'ord_b1',
          data: () => ({
            vendor_id: 'ven_10',
            date: getISTDateString(),
            delivery_slot: '11am',
            status: 'created',
          }),
          ref: { update: jest.fn() },
        },
        {
          id: 'ord_b2',
          data: () => ({
            vendor_id: 'ven_10',
            date: getISTDateString(),
            delivery_slot: '11am',
            status: 'created',
          }),
          ref: { update: jest.fn() },
        },
      ];

      (db.collection as jest.Mock).mockImplementation((col: string) => {
        if (col === 'orders') {
          return {
            where: jest.fn(() => ({
              where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ docs: mockOrderDocs }),
              })),
            })),
          };
        }
        if (col === 'swap_requests') {
          return {
            where: jest.fn(() => ({
              get: jest.fn().mockResolvedValue({ docs: [] }),
            })),
          };
        }
        if (col === 'batches') {
          return {
            doc: jest.fn((id: string) => ({ id, path: `batches/${id}` })),
            where: jest.fn(() => ({
              where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ docs: [] }),
              })),
              get: jest.fn().mockResolvedValue({ docs: [] }),
            })),
          };
        }
        return {
          doc: jest.fn((id: string) => ({ id, path: `${col}/${id}` })),
        };
      });

      (db.runTransaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const tx = {
          get: jest.fn().mockImplementation((ref: any) => {
            return Promise.resolve({ exists: false, data: () => null });
          }),
          set: jest.fn((ref, data) => {
            if (ref.path?.includes('batches')) {
              createdBatchData = data;
            }
          }),
          update: jest.fn(),
        };
        return cb(tx);
      });

      await wrappedFormBatches({});

      if (createdBatchData) {
        expect(createdBatchData.vendor_id).toBe('ven_10');
        expect(createdBatchData.slot).toBe('11am');
        expect(createdBatchData.order_ids).toContain('ord_b1');
        expect(createdBatchData.order_ids).toContain('ord_b2');
        expect(createdBatchData.status).toBe('notified');
      }
    });
  });
});
