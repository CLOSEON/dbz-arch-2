export {}; // module marker: without a top-level import/export TypeScript
           // treats this file as a script, so its top-level consts collide
           // with the other test files' in one global scope.

const functionsTest = require('firebase-functions-test');

/**
 * setAdminClaim / verifyVendor / verifyRider all gate on assertCallerIsAdmin
 * and all write audit_logs. None had tests. These pin the admin gate (both the
 * custom-claim path and the Firestore-doc fallback), the argument validation,
 * and the approve/reject branches -- including that a rejection must NOT grant
 * the role.
 */

const mockSetCustomUserClaims = jest.fn((..._a: any[]) => Promise.resolve());
const mockUserDocGet = jest.fn();
const mockUserDocSet = jest.fn((..._a: any[]) => Promise.resolve());
const mockUserDocUpdate = jest.fn((..._a: any[]) => Promise.resolve());
const mockAuditAdd = jest.fn((..._a: any[]) => Promise.resolve({ id: 'audit_1' }));

jest.mock('firebase-admin', () => {
  const userDoc = {
    get: () => mockUserDocGet(),
    set: (d: any, o: any) => mockUserDocSet(d, o),
    update: (d: any) => mockUserDocUpdate(d),
  };
  const collection = (name: string) => ({
    doc: jest.fn(() => userDoc),
    add: (d: any) => (name === 'audit_logs' ? mockAuditAdd(d) : Promise.resolve({ id: 'x' })),
  });
  return {
    auth: jest.fn(() => ({ setCustomUserClaims: mockSetCustomUserClaims })),
    firestore: Object.assign(
      jest.fn(() => ({ collection: jest.fn((n: string) => collection(n)) })),
      { FieldValue: { serverTimestamp: jest.fn(() => 'ts') } }
    ),
    initializeApp: jest.fn(),
    apps: [{}],
  };
});

let testEnv: any;
let mod: any;

beforeAll(() => {
  testEnv = functionsTest();
  mod = require('../adminManagementTriggers');
});
afterAll(() => testEnv?.cleanup?.());

beforeEach(() => {
  jest.clearAllMocks();
  mockUserDocGet.mockResolvedValue({ exists: false, data: () => undefined });
});

const claimAdmin = { auth: { uid: 'admin_1', token: { admin: true } } };
const notAdmin = { auth: { uid: 'joe', token: {} } };

async function expectError(p: Promise<any>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

describe('admin gate (assertCallerIsAdmin)', () => {
  test.each([
    ['setAdminClaim', { targetUid: 't1' }],
    ['verifyVendor', { targetUid: 't1', decision: 'approve' }],
    ['verifyRider', { targetUid: 't1', decision: 'approve' }],
  ])('%s rejects an unauthenticated caller', async (fn, payload) => {
    await expectError(testEnv.wrap(mod[fn])(payload, {}), 'unauthenticated');
  });

  test.each([
    ['setAdminClaim', { targetUid: 't1' }],
    ['verifyVendor', { targetUid: 't1', decision: 'approve' }],
    ['verifyRider', { targetUid: 't1', decision: 'approve' }],
  ])('%s rejects a signed-in non-admin', async (fn, payload) => {
    await expectError(testEnv.wrap(mod[fn])(payload, notAdmin), 'permission-denied');
    expect(mockUserDocUpdate).not.toHaveBeenCalled();
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  test('accepts an admin identified only by their Firestore doc (claim missing)', async () => {
    mockUserDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });
    const res = await testEnv.wrap(mod.setAdminClaim)({ targetUid: 't1' }, notAdmin);
    expect(res).toMatchObject({ success: true });
  });

  test('accepts an admin identified by roles.admin === true', async () => {
    mockUserDocGet.mockResolvedValue({ exists: true, data: () => ({ roles: { admin: true } }) });
    const res = await testEnv.wrap(mod.setAdminClaim)({ targetUid: 't1' }, notAdmin);
    expect(res).toMatchObject({ success: true });
  });
});

describe('setAdminClaim', () => {
  test('rejects a missing or non-string targetUid', async () => {
    await expectError(testEnv.wrap(mod.setAdminClaim)({}, claimAdmin), 'invalid-argument');
    await expectError(testEnv.wrap(mod.setAdminClaim)({ targetUid: 42 }, claimAdmin), 'invalid-argument');
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  test('sets the auth claim, the user doc, and an audit log', async () => {
    const res = await testEnv.wrap(mod.setAdminClaim)({ targetUid: 't1' }, claimAdmin);
    expect(res).toMatchObject({ success: true });
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('t1', { admin: true });
    expect(mockUserDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      { merge: true }
    );
    expect(mockAuditAdd).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SET_ADMIN_CLAIM', actorUid: 'admin_1', targetUid: 't1', result: 'success' })
    );
  });

  test('still writes a failure audit log when the claim write throws', async () => {
    mockSetCustomUserClaims.mockRejectedValueOnce(new Error('boom') as never);
    await expectError(testEnv.wrap(mod.setAdminClaim)({ targetUid: 't1' }, claimAdmin), 'internal');
    expect(mockAuditAdd).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SET_ADMIN_CLAIM', result: 'failed' })
    );
  });
});

// Note the asymmetry, which these tests pin: verifyVendor writes
// roles.vendor + role 'vendor', but verifyRider writes roles.RIDER while
// setting role 'delivery'. The roles-map key and the role string differ.
describe.each([
  ['verifyVendor', 'vendor', 'vendor', 'VERIFY_VENDOR'],
  ['verifyRider', 'rider', 'delivery', 'VERIFY_RIDER'],
])('%s', (fn, rolesKey, roleValue, auditAction) => {
  test('rejects a decision other than approve/reject', async () => {
    await expectError(
      testEnv.wrap(mod[fn])({ targetUid: 't1', decision: 'maybe' }, claimAdmin),
      'invalid-argument'
    );
    await expectError(
      testEnv.wrap(mod[fn])({ targetUid: 't1' }, claimAdmin),
      'invalid-argument'
    );
    expect(mockUserDocUpdate).not.toHaveBeenCalled();
  });

  test('rejects a missing targetUid', async () => {
    await expectError(
      testEnv.wrap(mod[fn])({ decision: 'approve' }, claimAdmin),
      'invalid-argument'
    );
  });

  test('approve marks verified, approved, and grants the role', async () => {
    await testEnv.wrap(mod[fn])({ targetUid: 't1', decision: 'approve' }, claimAdmin);
    const written = mockUserDocUpdate.mock.calls[0][0] as Record<string, any>;
    expect(written[`roles.${rolesKey}.status`]).toBe('verified');
    expect(written[`roles.${rolesKey}.verifiedBy`]).toBe('admin_1');
    expect(written.is_approved).toBe(true);
    expect(written.role).toBe(roleValue);
    expect(mockAuditAdd).toHaveBeenCalledWith(
      expect.objectContaining({ action: auditAction, decision: 'approve', result: 'success' })
    );
  });

  // The branch that matters: rejecting must not hand out the role.
  test('reject marks rejected and does NOT grant the role', async () => {
    await testEnv.wrap(mod[fn])({ targetUid: 't1', decision: 'reject' }, claimAdmin);
    const written = mockUserDocUpdate.mock.calls[0][0] as Record<string, any>;
    expect(written[`roles.${rolesKey}.status`]).toBe('rejected');
    expect(written.is_approved).toBe(false);
    expect(written.role).toBeUndefined();
  });
});
