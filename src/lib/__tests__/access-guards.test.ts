import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
const dealerScopeKey = vi.fn();
const getOrder = vi.fn();
const readSlip = vi.fn();

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/lib/shop/dealer', () => ({ dealerScopeKey: () => dealerScopeKey() }));
vi.mock('@/lib/shop/store', () => ({ getOrder: (...args: unknown[]) => getOrder(...args) }));
vi.mock('@/lib/shop/uploads', () => ({ readSlip: (name: string) => readSlip(name) }));

const { denyUnlessBackoffice } = await import('@/lib/auth/api-guard');
const { GET: getSlip } = await import('@/app/api/proto/uploads/[name]/route');

const slipRequest = (name: string) => getSlip(new Request('http://x'), { params: Promise.resolve({ name }) });

beforeEach(() => {
  vi.clearAllMocks();
  readSlip.mockReturnValue({ body: Buffer.from('img'), contentType: 'image/png' });
});

describe('denyUnlessBackoffice', () => {
  it('rejects anonymous callers with 401', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await denyUnlessBackoffice())?.status).toBe(401);
  });
  it('rejects dealer users with 403', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DEALER_OWNER' });
    expect((await denyUnlessBackoffice())?.status).toBe(403);
  });
  it('lets back-office staff through', async () => {
    getCurrentUser.mockResolvedValue({ role: 'SALES' });
    expect(await denyUnlessBackoffice()).toBeNull();
  });
});

describe('slip image route', () => {
  it('requires a session', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await slipRequest('abc1-x1.png')).status).toBe(401);
  });
  it('serves the slip to the dealer that owns the order', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DEALER_OWNER' });
    dealerScopeKey.mockResolvedValue('dealer:1');
    getOrder.mockReturnValue({ payment: { slipFile: 'abc1-x1.png' } });
    expect((await slipRequest('abc1-x1.png')).status).toBe(200);
    expect(getOrder).toHaveBeenCalledWith('dealer:1', 'abc1');
  });
  it('hides another shop\'s slip', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DEALER_STAFF' });
    dealerScopeKey.mockResolvedValue('dealer:2');
    getOrder.mockReturnValue(undefined);
    expect((await slipRequest('abc1-x1.png')).status).toBe(404);
  });
  it('serves any slip to back-office staff', async () => {
    getCurrentUser.mockResolvedValue({ role: 'ADMIN' });
    expect((await slipRequest('abc1-x1.png')).status).toBe(200);
    expect(getOrder).not.toHaveBeenCalled();
  });
});
