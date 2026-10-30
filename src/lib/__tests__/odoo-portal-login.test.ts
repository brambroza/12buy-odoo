import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ odooCheckLogin: vi.fn(), odooRead: vi.fn(), odooSearchRead: vi.fn() }));
const repo = vi.hoisted(() => ({ createDealer: vi.fn(), findDealerByPartnerId: vi.fn(), findDealerByTaxId: vi.fn(), getDealer: vi.fn(), updateDealer: vi.fn() }));
const users = vi.hoisted(() => ({ createUser: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);
vi.mock('@/lib/dealers/repo', () => repo);
vi.mock('@/lib/auth/users', () => users);
vi.mock('@/lib/shop/catalog', () => ({ shortProvince: (n: string) => n.replace(/^จังหวัด/, '') }));

vi.mock('@/lib/security/rate-limit', () => ({ RATE_LIMITS: { odooLogin: { max: 10, windowMs: 3_600_000 } }, hitRateLimit: vi.fn(async () => ({ ok: true, count: 1, retryAfterMs: 0 })) }));

const { createDealerFromPartner, provisionFromOdooLogin } = await import('@/lib/dealers/from-odoo');

const company = { id: 40, name: 'บจก. ยางดี', vat: 'TH0105556123456', phone: '+66 2 123 4567', street: '9 ถ.พระราม 2', street2: false, city: false, zip: '10150', state_id: [1, 'จังหวัดสมุทรสาคร'] };

/** Odoo answers for: res.users → contact partner → company partner. */
function odooHas({ share = true, commercial = 40 }: { share?: boolean; commercial?: number } = {}) {
  rpc.odooSearchRead.mockImplementation(async (model: string, domain: unknown[][]) => {
    if (model === 'res.users') return [{ id: 12, share, partner_id: [41, 'คุณสมชาย'] }];
    if (domain[0][2] === 41) return [{ id: 41, name: 'คุณสมชาย', commercial_partner_id: [commercial, 'บจก. ยางดี'] }];
    return [company];
  });
}

describe('createDealerFromPartner', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates an ACTIVE tier-M dealer from the partner with all product types by default', async () => {
    repo.createDealer.mockResolvedValue({ id: 'd1' });
    await createDealerFromPartner(company as never, { note: 'n' });
    expect(repo.createDealer).toHaveBeenCalledWith(expect.objectContaining({
      name: 'บจก. ยางดี', province: 'สมุทรสาคร', tier: 'M', status: 'ACTIVE', odooPartnerId: 40, phone: '021234567',
      taxId: '0105556123456', address: '9 ถ.พระราม 2 10150', types: ['CAR', 'TRUCK', 'MOTORCYCLE', 'BATTERY', 'WHEEL'],
    }));
    expect(repo.updateDealer).toHaveBeenCalledWith('d1', { approvedAt: expect.any(Date) });
  });

  it('returns null when the partner was linked by another request', async () => {
    repo.createDealer.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    expect(await createDealerFromPartner(company as never, { note: 'n' })).toBeNull();
  });

  it('returns null without inserting when a web dealer already has the partner tax id', async () => {
    repo.findDealerByTaxId.mockResolvedValue({ id: 'd-old', name: 'ร้านเดิม' });
    expect(await createDealerFromPartner(company as never, { note: 'n' })).toBeNull();
    expect(repo.findDealerByTaxId).toHaveBeenCalledWith('0105556123456');
    expect(repo.createDealer).not.toHaveBeenCalled();
  });
});

describe('provisionFromOdooLogin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    users.createUser.mockImplementation(async (input: Record<string, unknown>) => ({ id: 'u1', ...input }));
  });

  it('rejects wrong Odoo credentials without creating anything', async () => {
    rpc.odooCheckLogin.mockResolvedValue(null);
    expect(await provisionFromOdooLogin('a@b.co', 'x')).toEqual({ kind: 'invalid' });
    expect(repo.createDealer).not.toHaveBeenCalled();
    expect(users.createUser).not.toHaveBeenCalled();
  });

  it('refuses internal Odoo users', async () => {
    rpc.odooCheckLogin.mockResolvedValue(12);
    odooHas({ share: false });
    expect(await provisionFromOdooLogin('staff@b.co', 'x')).toEqual({ kind: 'not-portal', odooUid: 12 });
    expect(users.createUser).not.toHaveBeenCalled();
  });

  it('creates the dealer for the contact company and makes the first login its owner', async () => {
    rpc.odooCheckLogin.mockResolvedValue(12);
    odooHas();
    repo.findDealerByPartnerId.mockResolvedValue(null);
    repo.createDealer.mockResolvedValue({ id: 'd1' });
    const outcome = await provisionFromOdooLogin('somchai@yangdee.co', 'pw1234567');
    expect(outcome).toMatchObject({ kind: 'created', newDealer: true, odooUid: 12 });
    expect(repo.createDealer).toHaveBeenCalledWith(expect.objectContaining({ odooPartnerId: 40 }));
    expect(users.createUser).toHaveBeenCalledWith({ email: 'somchai@yangdee.co', name: 'คุณสมชาย', password: 'pw1234567', role: 'DEALER_OWNER', dealerId: 'd1' });
  });

  it('reports a conflict when an unlinked web dealer already carries the company tax id', async () => {
    rpc.odooCheckLogin.mockResolvedValue(12);
    odooHas();
    repo.findDealerByPartnerId.mockResolvedValue(null);
    repo.findDealerByTaxId.mockResolvedValue({ id: 'd-old', name: 'ร้านเดิม', odooPartnerId: null });
    const outcome = await provisionFromOdooLogin('somchai@yangdee.co', 'pw1234567');
    expect(outcome).toMatchObject({ kind: 'conflict', odooUid: 12, dealer: { id: 'd-old' } });
    expect(repo.createDealer).not.toHaveBeenCalled();
    expect(users.createUser).not.toHaveBeenCalled();
  });

  it('adds later logins of the same company as staff of the existing dealer', async () => {
    rpc.odooCheckLogin.mockResolvedValue(12);
    odooHas();
    repo.findDealerByPartnerId.mockResolvedValue({ id: 'd1' });
    repo.getDealer.mockResolvedValue({ id: 'd1', users: [{ id: 'u0' }] });
    const outcome = await provisionFromOdooLogin('staff@yangdee.co', 'pw1234567');
    expect(outcome).toMatchObject({ kind: 'created', newDealer: false });
    expect(repo.createDealer).not.toHaveBeenCalled();
    expect(users.createUser).toHaveBeenCalledWith(expect.objectContaining({ role: 'DEALER_STAFF', dealerId: 'd1' }));
  });
});

