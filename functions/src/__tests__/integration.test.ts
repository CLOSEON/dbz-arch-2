import { cancelScheduledTiffin } from '../../src/lib/queries/delivery';
import { acceptSwap } from '../../src/lib/queries/swaps';
import { awardUserCredit } from '../../src/lib/queries/credits';
import { db } from '../../src/lib/firebase';
import { doc, getDoc, updateDoc, setDoc, collection, runTransaction, serverTimestamp } from 'firebase/firestore';

jest.mock('../../src/lib/firebase', () => ({
  db: {}
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  collection: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(() => 'mocked-timestamp'),
}));

jest.mock('../../src/lib/queries/credits', () => ({
  awardUserCredit: jest.fn()
}));

jest.mock('../../src/lib/queries/audit', () => ({
  createAuditLog: jest.fn()
}));

describe('Integration Tests: Canonical Order Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Full swap flow: A requests swap, B accepts, statuses update to swapped_out/swapped_in, credits awarded', async () => {
    const mockTransaction = {
      get: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
    };

    (runTransaction as jest.Mock).mockImplementation(async (db, callback) => {
      await callback(mockTransaction);
    });

    // Mock broadcast snap
    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ response: 'pending', swap_request_id: 'req123', recipient_order_id: 'recip_ord123' })
    });

    // Mock request snap
    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'broadcasted', order_id: 'init_ord123' })
    });

    // Mock init order snap (not batched)
    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ batch_id: null })
    });

    // Mock recip order snap (not batched)
    mockTransaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ batch_id: null })
    });

    await acceptSwap('broadcast123', 'recipientUser');

    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'matched' }) // reqRef
    );

    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'swapped_out' }) // initOrderRef
    );

    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'swapped_in' }) // recipOrderRef
    );

    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ credit_amount: 0.3, source_reference_id: 'reqRef.id' }) // Assuming ID mock
    );
  });

  it('Full skip flow: Tiered credits awarded (0.5 for >=12h, 0.2 for <12h)', async () => {
    const mockOrder = {
      id: 'ord123',
      createdAt: { toDate: () => new Date(Date.now() + 13 * 60 * 60 * 1000) } // 13 hours from now
    };

    await cancelScheduledTiffin(mockOrder, 'user1');
    expect(awardUserCredit).toHaveBeenCalledWith(
      expect.objectContaining({ credit_amount: 0.5, source_reference_id: 'ord123' })
    );

    const mockOrderLate = {
      id: 'ord124',
      batch_id: 'batch123', // batched, so allowed under 4 hours
      createdAt: { toDate: () => new Date(Date.now() + 2 * 60 * 60 * 1000) } // 2 hours from now
    };

    (getDoc as jest.Mock).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ total_count: 5 })
    });

    await cancelScheduledTiffin(mockOrderLate, 'user1');
    expect(awardUserCredit).toHaveBeenCalledWith(
      expect.objectContaining({ credit_amount: 0.2, source_reference_id: 'ord124' })
    );
  });
});
