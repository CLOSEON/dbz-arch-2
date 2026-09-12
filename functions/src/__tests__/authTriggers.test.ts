export {}; // module marker: without a top-level import/export TypeScript
           // treats this file as a script, so its top-level consts collide
           // with the other test files' in one global scope.

const functionsTest = require('firebase-functions-test');

/**
 * setUserRole is the privilege-escalation boundary: it is how any account's
 * role gets changed. It had no tests. These cover each rejection path plus the
 * happy path, so the guards can't be removed without a failure.
 */

const mockSetCustomUserClaims = jest.fn((..._a: any[]) => Promise.resolve());
const mockUserDocGet = jest.fn();
const mockUserDocSet = jest.fn((..._a: any[]) => Promise.resolve());

jest.mock('firebase-admin', () => {
  const mockDoc = {
    get: () => mockUserDocGet(),
    set: (data: any, opts: any) => mockUserDocSet(data, opts),
  };
  const mockCollection = { doc: jest.fn(() => mockDoc) };
  return {
    auth: jest.fn(() => ({ setCustomUserClaims: mockSetCustomUserClaims })),
    firestore: Object.assign(
      jest.fn(() => ({ collection: jest.fn(() => mockCollection) })),
      { FieldValue: { serverTimestamp: jest.fn(() => 'ts') } }
    ),
    initializeApp: jest.fn(),
    apps: [{}],
  };
});

let testEnv: any;
let setUserRole: any;

beforeAll(() => {
  testEnv = functionsTest();
  setUserRole = require('../authTriggers').setUserRole;
});

afterAll(() => testEnv?.cleanup?.());

beforeEach(() => {
  jest.clearAllMocks();
  // default: caller's Firestore doc says they are an admin
  mockUserDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });
});

const wrap = () => testEnv.wrap(setUserRole);
const adminCtx = { auth: { uid: 'admin_1', token: { role: 'admin' } } };

async function expectError(promise: Promise<any>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('setUserRole', () => {
  describe('rejects', () => {
    test('an unauthenticated caller', async () => {
      await expectError(wrap()({ uid: 'u1', role: 'vendor' }, {}), 'unauthenticated');
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    });

    test('a signed-in non-admin whose Firestore doc is not admin', async () => {
      mockUserDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'customer' }) });
      await expectError(
        wrap()({ uid: 'u1', role: 'vendor' }, { auth: { uid: 'u2', token: { role: 'customer' } } }),
        'permission-denied'
      );
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    });

    test('a caller with no Firestore user doc at all', async () => {
      mockUserDocGet.mockResolvedValue({ exists: false, data: () => undefined });
      await expectError(
        wrap()({ uid: 'u1', role: 'vendor' }, { auth: { uid: 'ghost', token: {} } }),
        'permission-denied'
      );
    });

    test('a missing uid or role', async () => {
      await expectError(wrap()({ role: 'vendor' }, adminCtx), 'invalid-argument');
      await expectError(wrap()({ uid: 'u1' }, adminCtx), 'invalid-argument');
    });

    test('a role outside the allow-list', async () => {
      await expectError(wrap()({ uid: 'u1', role: 'superadmin' }, adminCtx), 'invalid-argument');
      await expectError(wrap()({ uid: 'u1', role: 'owner' }, adminCtx), 'invalid-argument');
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    });

    // The important one: admin is in allowedRoles, but is then explicitly
    // rejected so this callable can never mint another admin.
    test('granting admin — even when the caller is a genuine admin', async () => {
      await expectError(wrap()({ uid: 'u1', role: 'admin' }, adminCtx), 'permission-denied');
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
      expect(mockUserDocSet).not.toHaveBeenCalled();
    });
  });

  describe('allows', () => {
    test.each(['customer', 'vendor', 'delivery_agent'])('an admin to grant %s', async (role) => {
      const res = await wrap()({ uid: 'u1', role }, adminCtx);
      expect(res).toMatchObject({ success: true });
      expect(mockSetCustomUserClaims).toHaveBeenCalledWith('u1', { role });
      expect(mockUserDocSet).toHaveBeenCalledWith(
        expect.objectContaining({ role }),
        { merge: true }
      );
    });

    test('a caller who is admin only via their Firestore doc, not their token', async () => {
      mockUserDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });
      const res = await wrap()(
        { uid: 'u1', role: 'vendor' },
        { auth: { uid: 'admin_2', token: {} } }
      );
      expect(res).toMatchObject({ success: true });
    });
  });

  test('surfaces an internal error if the claim write fails', async () => {
    mockSetCustomUserClaims.mockRejectedValueOnce(new Error('boom') as never);
    await expectError(wrap()({ uid: 'u1', role: 'vendor' }, adminCtx), 'internal');
  });
});
