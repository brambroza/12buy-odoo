import { beforeEach, describe, expect, it, vi } from 'vitest';

const leadsRepo = vi.hoisted(() => ({ createLead: vi.fn(), findOpenLeadByEmail: vi.fn(), findOpenLeadByTaxId: vi.fn() }));
const dealersRepo = vi.hoisted(() => ({ findDealerByTaxId: vi.fn() }));
const users = vi.hoisted(() => ({ findUserByEmail: vi.fn() }));
const claim = vi.hoisted(() => ({ findPartnersByTaxId: vi.fn() }));
const store = vi.hoisted(() => ({ allowSubmission: vi.fn(() => true), notifyLead: vi.fn(), toNotification: vi.fn(() => ({})) }));
vi.mock('@/lib/leads/repo', () => leadsRepo);
vi.mock('@/lib/dealers/repo', () => dealersRepo);
vi.mock('@/lib/auth/users', () => users);
vi.mock('@/lib/odoo/partner-claim', () => claim);
vi.mock('@/lib/leads/store', () => store);
vi.mock('@/lib/security/turnstile', () => ({ verifyTurnstile: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/flash', () => ({ flash: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers({ 'x-real-ip': '1.2.3.4' })) }));

const { registerDealerAction } = await import('@/app/actions/register-dealer');

const TAX = '0105556123453';

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values: Record<string, string> = {
    shopName: 'ร้านยางทดสอบ', taxId: '0-1055-56123-45-3', line: '99/1 ม.3', province: 'เชียงใหม่', district: 'กัลยาณิวัฒนา', subdistrict: 'บ้านจันทร์', postalCode: '58130',
    phone: '0812345678', email: 'shop@example.com', password: 'abc12345', confirmPassword: 'abc12345', consent: 'on', ...overrides,
  };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  fd.append('types', 'CAR');
  return fd;
}

describe('registerDealerAction tax id dedupe', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    store.allowSubmission.mockReturnValue(true);
    store.toNotification.mockReturnValue({});
    dealersRepo.findDealerByTaxId.mockResolvedValue(null);
    leadsRepo.findOpenLeadByTaxId.mockResolvedValue(null);
    leadsRepo.findOpenLeadByEmail.mockResolvedValue(null);
    users.findUserByEmail.mockResolvedValue(null);
    leadsRepo.createLead.mockResolvedValue({ id: 'L1', createdAt: new Date(), source: 'landing' });
    claim.findPartnersByTaxId.mockResolvedValue([]);
  });

  it('stores the lead with the normalised tax id when nobody has it', async () => {
    const result = await registerDealerAction(null, form());
    expect(result).toMatchObject({ ok: true });
    expect(dealersRepo.findDealerByTaxId).toHaveBeenCalledWith(TAX);
    expect(leadsRepo.findOpenLeadByTaxId).toHaveBeenCalledWith(TAX);
    expect(claim.findPartnersByTaxId).toHaveBeenCalledWith(TAX);
    expect(leadsRepo.createLead).toHaveBeenCalledWith(expect.objectContaining({ taxId: TAX }));
  });

  it('rejects a bad check digit before touching the database', async () => {
    const result = await registerDealerAction(null, form({ taxId: '0105556123456' }));
    expect(result).toMatchObject({ ok: false, field: 'taxId' });
    expect(dealersRepo.findDealerByTaxId).not.toHaveBeenCalled();
  });

  it('refuses a tax id that already is a web dealer', async () => {
    dealersRepo.findDealerByTaxId.mockResolvedValue({ id: 'd1' });
    const result = await registerDealerAction(null, form());
    expect(result).toMatchObject({ ok: false, field: 'taxId', values: { taxId: '0-1055-56123-45-3' } });
    expect(result && !result.ok ? result.message : '').toContain('ดีลเลอร์ของเราแล้ว');
    expect(leadsRepo.createLead).not.toHaveBeenCalled();
  });

  it('refuses a tax id with an application still open', async () => {
    leadsRepo.findOpenLeadByTaxId.mockResolvedValue({ id: 'L0' });
    const result = await registerDealerAction(null, form());
    expect(result && !result.ok ? result.message : '').toContain('ส่งใบสมัครไว้แล้ว');
    expect(leadsRepo.createLead).not.toHaveBeenCalled();
  });

  it('sends an existing Odoo customer to /activate instead of creating a lead', async () => {
    claim.findPartnersByTaxId.mockResolvedValue([{ id: 7, name: 'ร้านยางสมชาย' }]);
    const result = await registerDealerAction(null, form());
    expect(result).toMatchObject({ ok: false, field: 'taxId', hint: 'activate' });
    expect(leadsRepo.createLead).not.toHaveBeenCalled();
  });

  it('still takes the lead when Odoo cannot be asked', async () => {
    claim.findPartnersByTaxId.mockRejectedValue(new Error('odoo down'));
    const result = await registerDealerAction(null, form());
    expect(result).toMatchObject({ ok: true });
    expect(leadsRepo.createLead).toHaveBeenCalled();
  });

  it('checks the tax id before the email', async () => {
    dealersRepo.findDealerByTaxId.mockResolvedValue({ id: 'd1' });
    users.findUserByEmail.mockResolvedValue({ id: 'u1' });
    const result = await registerDealerAction(null, form());
    expect(result).toMatchObject({ ok: false, field: 'taxId' });
  });
});
